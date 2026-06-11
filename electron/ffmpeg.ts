import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type {
  AppSettings,
  CaptionSettings,
  CompressionComplete,
  CompressionFailed,
  CompressionProgress,
  CompressionSettings,
  CompressionStarted,
  ConversionOutputFormat,
  EncoderCapabilities,
  ExtractionOutputFormat,
  HardwareAcceleration,
  MediaFileInfo,
  StartCompressionPayload,
  StartMediaJobPayload,
  VideoCodec
} from "./types";

type JobHandlers = {
  onProgress: (progress: CompressionProgress) => void;
  onComplete: (complete: CompressionComplete) => void;
  onFailed: (failed: CompressionFailed) => void;
};

type RunningJob = {
  kill: () => void;
};

type SpeechConfig = {
  endpoint: string;
  key: string;
  locale: string;
  apiVersion: string;
};

type CaptionEvent = {
  start: number;
  end: number;
  text: string;
};

const runningJobs = new Map<string, RunningJob>();
const DEFAULT_SPEECH_API_VERSION = "2025-10-15";

export async function getCapabilities(): Promise<EncoderCapabilities> {
  const [ffmpegAvailable, ffprobeAvailable, encoderOutput] = await Promise.all([
    commandExists("ffmpeg"),
    commandExists("ffprobe"),
    readCommandOutput("ffmpeg", ["-hide_banner", "-encoders"]).catch(() => "")
  ]);
  const compiled = {
    nvenc: /h264_nvenc|hevc_nvenc/.test(encoderOutput),
    qsv: /h264_qsv|hevc_qsv/.test(encoderOutput),
    amf: /h264_amf|hevc_amf/.test(encoderOutput)
  };
  const [nvencTest, qsvTest, amfTest] = await Promise.all([
    compiled.nvenc ? probeEncoderUsable("h264_nvenc") : Promise.resolve({ usable: false, reason: "Encoder is not compiled into FFmpeg." }),
    compiled.qsv ? probeEncoderUsable("h264_qsv") : Promise.resolve({ usable: false, reason: "Encoder is not compiled into FFmpeg." }),
    compiled.amf ? probeEncoderUsable("h264_amf") : Promise.resolve({ usable: false, reason: "Encoder is not compiled into FFmpeg." })
  ]);
  const encoders = [
    { id: "nvenc" as const, label: "NVIDIA NVENC", compiled: compiled.nvenc, ...nvencTest },
    { id: "qsv" as const, label: "Intel QuickSync", compiled: compiled.qsv, ...qsvTest },
    { id: "amf" as const, label: "AMD AMF", compiled: compiled.amf, ...amfTest }
  ];
  const recommendedAcceleration = encoders.find((encoder) => encoder.usable)?.id ?? "none";

  return {
    ffmpegAvailable,
    ffprobeAvailable,
    platform: process.platform,
    recommendedAcceleration,
    encoders,
    nvenc: nvencTest.usable,
    qsv: qsvTest.usable,
    amf: amfTest.usable
  };
}

export async function analyzeMediaFile(filePath: string): Promise<MediaFileInfo> {
  const stat = await fs.promises.stat(filePath);
  const probe = await readCommandOutput("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath
  ]);

  const parsed = JSON.parse(probe) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      duration?: string;
    }>;
  };

  const videoStream = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audioStream = parsed.streams?.find((stream) => stream.codec_type === "audio");
  const duration = Number(parsed.format?.duration ?? videoStream?.duration ?? 0);
  const extension = path.extname(filePath).replace(".", "").toLowerCase();

  return {
    path: filePath,
    name: path.basename(filePath),
    extension,
    size: stat.size,
    duration: Number.isFinite(duration) ? duration : 0,
    width: videoStream?.width,
    height: videoStream?.height,
    videoCodec: videoStream?.codec_name,
    audioCodec: audioStream?.codec_name
  };
}

export async function startCompression(
  payload: StartCompressionPayload,
  handlers: JobHandlers
): Promise<CompressionStarted> {
  return startMediaJob(
    {
      inputPath: payload.inputPath,
      mode: "compress",
      settings: {
        mode: "compress",
        conversionFormat: "mp4",
        extractionFormat: "mp3",
        captions: {
          maxDuration: 2,
          font: "Arial",
          fontSize: 30,
          fontColor: "#FFFFFF",
          outlineColor: "#000000",
          shadowEnabled: true,
          shadowColor: "#000000",
          position: "bottom",
          marginV: 80,
          maxChars: 42
        },
        ...payload.settings
      }
    },
    handlers
  );
}

export async function startMediaJob(
  payload: StartMediaJobPayload,
  handlers: JobHandlers
): Promise<CompressionStarted> {
  if (payload.mode === "caption") {
    return startCaptionJob(payload, handlers);
  }

  const info = await analyzeMediaFile(payload.inputPath);
  const jobId = crypto.randomUUID();
  const { outputPath, args } = await buildMediaJob(payload);
  const startedAt = Date.now();
  const ffmpeg = spawn("ffmpeg", args, { windowsHide: true });
  let stderr = "";

  runningJobs.set(jobId, { kill: () => ffmpeg.kill("SIGTERM") });

  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stderr += text;
    const timeSeconds = parseTimeSeconds(text);

    if (timeSeconds === undefined || info.duration <= 0) {
      return;
    }

    handlers.onProgress({
      jobId,
      percent: Math.min(99, (timeSeconds / info.duration) * 100),
      elapsedMs: Date.now() - startedAt,
      timeSeconds,
      fps: parseNumberValue(text, "fps"),
      speed: parseTextValue(text, "speed")
    });
  });

  ffmpeg.on("error", (error) => {
    runningJobs.delete(jobId);
    handlers.onFailed({ jobId, error: error.message });
  });

  ffmpeg.on("close", async (code) => {
    runningJobs.delete(jobId);

    if (code === null) {
      handlers.onFailed({ jobId, error: "FFmpeg stopped unexpectedly." });
      return;
    }

    if (code !== 0) {
      handlers.onFailed({
        jobId,
        error: code === 255 ? "Job cancelled." : formatFfmpegFailure(code, stderr)
      });
      return;
    }

    try {
      const stat = await fs.promises.stat(outputPath);
      handlers.onProgress({
        jobId,
        percent: 100,
        elapsedMs: Date.now() - startedAt,
        timeSeconds: info.duration
      });
      handlers.onComplete({
        jobId,
        outputPath,
        outputSize: stat.size,
        elapsedMs: Date.now() - startedAt
      });
    } catch (error) {
      handlers.onFailed({
        jobId,
        error: error instanceof Error ? error.message : "Unable to read compressed output."
      });
    }
  });

  return { jobId, outputPath };
}

export function cancelCompression(jobId: string): boolean {
  const job = runningJobs.get(jobId);

  if (!job) {
    return false;
  }

  job.kill();
  runningJobs.delete(jobId);
  return true;
}

async function startCaptionJob(payload: StartMediaJobPayload, handlers: JobHandlers): Promise<CompressionStarted> {
  const info = await analyzeMediaFile(payload.inputPath);

  if (!info.width || !info.height) {
    throw new Error("Captions require a video file.");
  }

  const speechConfig = readSpeechConfig();
  const jobId = crypto.randomUUID();
  const outputPath = getOutputPath(payload.inputPath, payload.settings.outputFolder, "captioned", "mp4");
  const startedAt = Date.now();
  const state: { cancelled: boolean; process: ChildProcessWithoutNullStreams | null } = {
    cancelled: false,
    process: null
  };

  runningJobs.set(jobId, {
    kill: () => {
      state.cancelled = true;
      state.process?.kill("SIGTERM");
    }
  });

  void runCaptionPipeline({
    jobId,
    inputPath: payload.inputPath,
    outputPath,
    info,
    settings: payload.settings,
    speechConfig,
    state,
    startedAt,
    handlers
  });

  return { jobId, outputPath };
}

async function runCaptionPipeline({
  jobId,
  inputPath,
  outputPath,
  info,
  settings,
  speechConfig,
  state,
  startedAt,
  handlers
}: {
  jobId: string;
  inputPath: string;
  outputPath: string;
  info: MediaFileInfo;
  settings: AppSettings;
  speechConfig: SpeechConfig;
  state: { cancelled: boolean; process: ChildProcessWithoutNullStreams | null };
  startedAt: number;
  handlers: JobHandlers;
}) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "video-converter-captions-"));
  const audioPath = path.join(tempDir, "audio.mp3");
  const assPath = path.join(tempDir, "captions.ass");

  try {
    emitProgress(handlers, jobId, startedAt, 2);

    await runTrackedFfmpeg(
      [
        "-y",
        "-hide_banner",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        audioPath
      ],
      state,
      (text) => {
        const timeSeconds = parseTimeSeconds(text);
        if (timeSeconds !== undefined && info.duration > 0) {
          emitProgress(handlers, jobId, startedAt, 2 + Math.min(13, (timeSeconds / info.duration) * 13), timeSeconds);
        }
      }
    );

    assertNotCancelled(state);
    emitProgress(handlers, jobId, startedAt, 18);

    const transcription = await transcribeAudio(speechConfig, audioPath);
    assertNotCancelled(state);
    emitProgress(handlers, jobId, startedAt, 45);

    const captions = buildCaptionEvents(transcription, settings.captions);

    if (captions.length === 0) {
      throw new Error("No captions were returned by Foundry Speech.");
    }

    await writeAssFile(assPath, captions, [info.width ?? 1920, info.height ?? 1080], settings.captions);

    await runTrackedFfmpeg(
      [
        "-y",
        "-hide_banner",
        "-i",
        inputPath,
        "-vf",
        "ass=captions.ass",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        outputPath
      ],
      state,
      (text) => {
        const timeSeconds = parseTimeSeconds(text);
        if (timeSeconds !== undefined && info.duration > 0) {
          emitProgress(handlers, jobId, startedAt, 50 + Math.min(49, (timeSeconds / info.duration) * 49), timeSeconds);
        }
      },
      tempDir
    );

    assertNotCancelled(state);

    const stat = await fs.promises.stat(outputPath);
    handlers.onProgress({
      jobId,
      percent: 100,
      elapsedMs: Date.now() - startedAt,
      timeSeconds: info.duration
    });
    handlers.onComplete({
      jobId,
      outputPath,
      outputSize: stat.size,
      elapsedMs: Date.now() - startedAt
    });
  } catch (error) {
    handlers.onFailed({
      jobId,
      error: state.cancelled ? "Job cancelled." : error instanceof Error ? error.message : "Caption generation failed."
    });
  } finally {
    runningJobs.delete(jobId);
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function emitProgress(
  handlers: JobHandlers,
  jobId: string,
  startedAt: number,
  percent: number,
  timeSeconds = 0
) {
  handlers.onProgress({
    jobId,
    percent: Math.min(99, Math.max(0, percent)),
    elapsedMs: Date.now() - startedAt,
    timeSeconds
  });
}

function assertNotCancelled(state: { cancelled: boolean }) {
  if (state.cancelled) {
    throw new Error("Job cancelled.");
  }
}

function runTrackedFfmpeg(
  args: string[],
  state: { cancelled: boolean; process: ChildProcessWithoutNullStreams | null },
  onStderr?: (text: string) => void,
  cwd?: string
) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, { windowsHide: true, cwd });
    let stderr = "";

    state.process = ffmpeg;

    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      onStderr?.(text);
    });

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      state.process = null;

      if (state.cancelled || code === 255) {
        reject(new Error("Job cancelled."));
        return;
      }

      if (code !== 0) {
        reject(new Error(formatFfmpegFailure(code ?? 1, stderr)));
        return;
      }

      resolve();
    });
  });
}

function readSpeechConfig(): SpeechConfig {
  const env = loadEnvValues();
  const key = firstEnv(env, "AZURE_SPEECH_KEY", "SPEECH_KEY", "FOUNDRY_SPEECH_KEY", "MICROSOFT_SPEECH_KEY", "AZURE_AI_SPEECH_KEY");
  const endpoint = resolveSpeechEndpoint(env);

  if (!key) {
    throw new Error("Missing SPEECH_KEY or AZURE_SPEECH_KEY in .env.");
  }

  if (!endpoint) {
    throw new Error("Missing SPEECH_ENDPOINT, AZURE_SPEECH_ENDPOINT, or AZURE_SPEECH_RESOURCE_NAME in .env.");
  }

  return {
    key,
    endpoint,
    locale: firstEnv(env, "AZURE_SPEECH_LOCALE", "SPEECH_LOCALE", "CAPTION_LOCALE") ?? "en-US",
    apiVersion: firstEnv(env, "AZURE_SPEECH_API_VERSION", "SPEECH_API_VERSION") ?? DEFAULT_SPEECH_API_VERSION
  };
}

function loadEnvValues() {
  const values: Record<string, string> = { ...process.env } as Record<string, string>;
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env"),
    path.join(app.getPath("userData"), ".env"),
    path.join(path.dirname(process.execPath), ".env")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      Object.assign(values, parseEnvFile(candidate));
      break;
    }
  }

  return values;
}

function parseEnvFile(envPath: string) {
  const values: Record<string, string> = {};
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = line.split("=");
    values[key.trim()] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
  }

  return values;
}

function firstEnv(env: Record<string, string | undefined>, ...names: string[]) {
  for (const name of names) {
    const value = env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function resolveSpeechEndpoint(env: Record<string, string | undefined>) {
  const endpoint = firstEnv(
    env,
    "AZURE_SPEECH_ENDPOINT",
    "SPEECH_ENDPOINT",
    "FOUNDRY_SPEECH_ENDPOINT",
    "MICROSOFT_SPEECH_ENDPOINT",
    "AZURE_AI_SPEECH_ENDPOINT"
  );

  if (endpoint) {
    return endpoint.replace(/\/+$/, "");
  }

  const resourceName = firstEnv(env, "AZURE_SPEECH_RESOURCE_NAME", "SPEECH_RESOURCE_NAME", "FOUNDRY_SPEECH_RESOURCE_NAME");

  return resourceName ? `https://${resourceName}.cognitiveservices.azure.com` : undefined;
}

async function transcribeAudio(config: SpeechConfig, audioPath: string) {
  const audio = await fs.promises.readFile(audioPath);
  const body = new FormData();
  body.append("definition", new Blob([JSON.stringify({ locales: [config.locale] })], { type: "application/json" }));
  body.append("audio", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), path.basename(audioPath));

  const response = await fetch(
    `${config.endpoint}/speechtotext/transcriptions:transcribe?api-version=${encodeURIComponent(config.apiVersion)}`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": config.key
      },
      body
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Foundry Speech HTTP ${response.status}: ${text || response.statusText}`);
  }

  return response.json() as Promise<{
    phrases?: Array<{
      text?: string;
      offsetMilliseconds?: number;
      durationMilliseconds?: number;
      words?: Array<{
        text?: string;
        offsetMilliseconds?: number;
        durationMilliseconds?: number;
      }>;
    }>;
  }>;
}

function buildCaptionEvents(
  response: {
    phrases?: Array<{
      text?: string;
      offsetMilliseconds?: number;
      durationMilliseconds?: number;
      words?: Array<{ text?: string; offsetMilliseconds?: number; durationMilliseconds?: number }>;
    }>;
  },
  settings: CaptionSettings
): CaptionEvent[] {
  const maxDurationMs = Math.max(900, Math.round(settings.maxDuration * 1000));
  const captions: CaptionEvent[] = [];

  for (const phrase of response.phrases ?? []) {
    const text = cleanText(phrase.text ?? "");
    const start = Number(phrase.offsetMilliseconds ?? 0);
    const end = Math.max(start + Number(phrase.durationMilliseconds ?? 0), start + 900);

    if (!text) {
      continue;
    }

    if (phrase.words?.length) {
      captions.push(...splitPhraseByWords(phrase.words, text, settings.maxChars, maxDurationMs, start, end));
    } else {
      captions.push(...splitPhraseByText(text, settings.maxChars, maxDurationMs, start, end));
    }
  }

  return captions;
}

function splitPhraseByWords(
  words: Array<{ text?: string; offsetMilliseconds?: number; durationMilliseconds?: number }>,
  fallbackText: string,
  maxChars: number,
  maxDurationMs: number,
  fallbackStart: number,
  fallbackEnd: number
): CaptionEvent[] {
  const chunks: Array<Array<{ text?: string; offsetMilliseconds?: number; durationMilliseconds?: number }>> = [];
  let current: Array<{ text?: string; offsetMilliseconds?: number; durationMilliseconds?: number }> = [];
  let currentLength = 0;
  const hardLimit = maxChars * 2;

  for (const word of words) {
    const text = cleanText(word.text ?? "");

    if (!text) {
      continue;
    }

    const currentStart = current.length > 0 ? wordStartMs(current[0], fallbackStart) : wordStartMs(word, fallbackStart);
    const nextEnd = wordEndMs(word, currentStart);
    const nextLength = currentLength + text.length + (current.length > 0 ? 1 : 0);

    if (current.length > 0 && (nextLength > hardLimit || nextEnd - currentStart > maxDurationMs)) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }

    current.push(word);
    currentLength += text.length + (currentLength > 0 ? 1 : 0);
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  if (chunks.length === 0) {
    return splitPhraseByText(fallbackText, maxChars, maxDurationMs, fallbackStart, fallbackEnd);
  }

  return chunks.map((chunk) => {
    const start = wordStartMs(chunk[0], fallbackStart);
    const end = wordEndMs(chunk[chunk.length - 1], start);
    const text = chunk.map((word) => cleanText(word.text ?? "")).filter(Boolean).join(" ");

    return {
      start,
      end: Math.max(end, start + 900),
      text: wrapCaption(text, maxChars)
    };
  });
}

function splitPhraseByText(
  text: string,
  maxChars: number,
  maxDurationMs: number,
  start: number,
  end: number
): CaptionEvent[] {
  let chunks = wrapWords(text, maxChars * 2);
  const total = Math.max(end - start, 900);
  const targetCount = Math.max(1, Math.ceil(total / maxDurationMs));

  while (chunks.length < targetCount) {
    const splitIndex = chunks.reduce((longestIndex, chunk, index) => (chunk.length > chunks[longestIndex].length ? index : longestIndex), 0);
    const [left, right] = splitTextNearMiddle(chunks[splitIndex]);

    if (!right) {
      break;
    }

    chunks = [...chunks.slice(0, splitIndex), left, right, ...chunks.slice(splitIndex + 1)];
  }

  const perChunk = Math.max(900, Math.floor(total / chunks.length));

  return chunks.map((chunk, index) => {
    const chunkStart = start + index * perChunk;
    const chunkEnd = Math.min(end, chunkStart + perChunk);

    return {
      start: chunkStart,
      end: Math.max(chunkEnd, chunkStart + 900),
      text: wrapCaption(chunk, maxChars)
    };
  });
}

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function wrapCaption(text: string, maxChars: number) {
  const lines = wrapWords(text, maxChars);

  if (lines.length <= 2) {
    return lines.join("\\N");
  }

  return [`${lines.slice(0, -1).join(" ")}`, lines[lines.length - 1]].join("\\N");
}

function wrapWords(text: string, maxChars: number) {
  const words = cleanText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (current && next.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [text];
}

function splitTextNearMiddle(text: string): [string, string] {
  const words = text.split(" ");

  if (words.length < 2) {
    return [text, ""];
  }

  const midpoint = Math.floor(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}

function wordStartMs(word: { offsetMilliseconds?: number }, fallback: number) {
  return Number(word.offsetMilliseconds ?? fallback);
}

function wordEndMs(word: { offsetMilliseconds?: number; durationMilliseconds?: number }, fallbackStart: number) {
  const start = wordStartMs(word, fallbackStart);
  return start + Number(word.durationMilliseconds ?? 900);
}

async function writeAssFile(assPath: string, captions: CaptionEvent[], videoSize: [number, number], settings: CaptionSettings) {
  const [width, height] = videoSize;
  const fontSize = Math.max(8, settings.fontSize);
  const marginV = settings.marginV || Math.max(36, Math.round(height * 0.07));
  const alignment = { bottom: 2, center: 5, top: 8 }[settings.position];
  const font = (settings.font || "Arial").replace(/,/g, " ").trim() || "Arial";
  const primaryColor = assColor(settings.fontColor);
  const outlineColor = assColor(settings.outlineColor);
  const shadowColor = assColor(settings.shadowColor, "AA");
  const shadowDepth = settings.shadowEnabled ? 1 : 0;
  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${font},${fontSize},${primaryColor},${primaryColor},${outlineColor},${shadowColor},-1,0,0,0,100,100,0,0,1,3,${shadowDepth},${alignment},64,64,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
  ];

  for (const caption of captions) {
    lines.push(`Dialogue: 0,${assTime(caption.start)},${assTime(caption.end)},Default,,0,0,0,,${escapeAss(caption.text)}`);
  }

  await fs.promises.writeFile(assPath, lines.join("\n"), "utf8");
}

function assColor(hexColor: string, alpha = "00") {
  const value = hexColor.trim().replace(/^#/, "");

  if (!/^[\da-f]{6}$/i.test(value) || !/^[\da-f]{2}$/i.test(alpha)) {
    throw new Error(`Invalid caption color: ${hexColor}`);
  }

  const red = value.slice(0, 2);
  const green = value.slice(2, 4);
  const blue = value.slice(4, 6);

  return `&H${alpha.toUpperCase()}${blue.toUpperCase()}${green.toUpperCase()}${red.toUpperCase()}`;
}

function assTime(milliseconds: number) {
  const centiseconds = Math.max(0, Math.round(milliseconds / 10));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const centis = centiseconds % 100;

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function escapeAss(text: string) {
  return text.replace(/{/g, "\\{").replace(/}/g, "\\}");
}

async function buildCompressionArgs(inputPath: string, outputPath: string, settings: CompressionSettings) {
  const encoder = await resolveEncoder(settings.codec, settings.acceleration);
  const qualityArgs = getQualityArgs(settings, encoder);

  return [
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    encoder,
    ...qualityArgs,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath
  ];
}

async function buildMediaJob(payload: StartMediaJobPayload) {
  if (payload.mode === "compress") {
    const outputPath = getOutputPath(payload.inputPath, payload.settings.outputFolder, "compressed", "mp4", payload.settings.preset);
    return {
      outputPath,
      args: await buildCompressionArgs(payload.inputPath, outputPath, payload.settings)
    };
  }

  if (payload.mode === "convert") {
    const targetFormat = (payload.targetFormat ?? payload.settings.conversionFormat) as ConversionOutputFormat;
    assertSupportedConversion(payload.inputPath, targetFormat);
    const outputPath = getOutputPath(payload.inputPath, payload.settings.outputFolder, "converted", targetFormat);
    return {
      outputPath,
      args: buildConversionArgs(payload.inputPath, outputPath, targetFormat)
    };
  }

  const targetFormat = (payload.targetFormat ?? payload.settings.extractionFormat) as ExtractionOutputFormat;
  const outputPath = getOutputPath(payload.inputPath, payload.settings.outputFolder, "audio", targetFormat);
  return {
    outputPath,
    args: buildAudioExtractionArgs(payload.inputPath, outputPath, targetFormat)
  };
}

function buildConversionArgs(inputPath: string, outputPath: string, targetFormat: ConversionOutputFormat) {
  if (isAudioFormat(targetFormat)) {
    return ["-y", "-hide_banner", "-i", inputPath, "-vn", ...audioCodecArgs(targetFormat), outputPath];
  }

  return [
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "22",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    ...(targetFormat === "mp4" || targetFormat === "mov" ? ["-movflags", "+faststart"] : []),
    outputPath
  ];
}

function buildAudioExtractionArgs(inputPath: string, outputPath: string, targetFormat: ExtractionOutputFormat) {
  return ["-y", "-hide_banner", "-i", inputPath, "-vn", ...audioCodecArgs(targetFormat), outputPath];
}

function audioCodecArgs(format: ConversionOutputFormat | ExtractionOutputFormat) {
  if (format === "mp3") {
    return ["-c:a", "libmp3lame", "-b:a", "192k"];
  }

  if (format === "wav") {
    return ["-c:a", "pcm_s16le"];
  }

  if (format === "flac") {
    return ["-c:a", "flac"];
  }

  return ["-c:a", "aac", "-b:a", "192k"];
}

function assertSupportedConversion(inputPath: string, targetFormat: ConversionOutputFormat) {
  const sourceFormat = path.extname(inputPath).replace(".", "").toLowerCase();
  const supported = getSupportedConversionTargets(sourceFormat);

  if (!supported.includes(targetFormat)) {
    throw new Error(`${sourceFormat.toUpperCase()} to ${targetFormat.toUpperCase()} conversion is not supported.`);
  }
}

function getSupportedConversionTargets(sourceFormat: string): ConversionOutputFormat[] {
  const pairs: Record<string, ConversionOutputFormat[]> = {
    mp4: ["mov", "mkv", "mp3"],
    mov: ["mp4", "mkv", "mp3"],
    mkv: ["mp4", "mov"],
    webm: ["mp4"],
    avi: ["mp4"],
    wav: ["mp3"],
    mp3: ["wav", "flac"],
    flac: ["mp3"]
  };

  return pairs[sourceFormat] ?? [];
}

function isAudioFormat(format: ConversionOutputFormat | ExtractionOutputFormat) {
  return format === "mp3" || format === "wav" || format === "flac" || format === "aac";
}

async function resolveEncoder(codec: VideoCodec, acceleration: HardwareAcceleration) {
  const capabilities = await getCapabilities();
  const softwareEncoder = codec === "h264" ? "libx264" : "libx265";
  const preferred = acceleration === "auto" ? ["none"] : [acceleration];

  for (const candidate of preferred) {
    if (candidate === "none") {
      return softwareEncoder;
    }

    if (candidate === "nvenc" && capabilities.nvenc) {
      return codec === "h264" ? "h264_nvenc" : "hevc_nvenc";
    }

    if (candidate === "qsv" && capabilities.qsv) {
      return codec === "h264" ? "h264_qsv" : "hevc_qsv";
    }

    if (candidate === "amf" && capabilities.amf) {
      return codec === "h264" ? "h264_amf" : "hevc_amf";
    }
  }

  return softwareEncoder;
}

function formatFfmpegFailure(code: number, stderr: string) {
  const signedCode = code > 2147483647 ? code - 4294967296 : code;
  const details = getRelevantFfmpegError(stderr);
  const codeText = signedCode === code ? String(code) : `${code} (${signedCode})`;

  return details ? `FFmpeg failed with code ${codeText}: ${details}` : `FFmpeg failed with code ${codeText}.`;
}

function getRelevantFfmpegError(stderr: string) {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const errorLine = [...lines]
    .reverse()
    .find((line) => /error|failed|cannot|unable|invalid|no such|denied/i.test(line));

  return errorLine ?? lines.at(-1);
}

function getQualityArgs(settings: CompressionSettings, encoder: string) {
  const crfByPreset = {
    high: "20",
    balanced: "24",
    small: "30"
  } satisfies Record<CompressionSettings["preset"], string>;

  const cqByPreset = {
    high: "19",
    balanced: "24",
    small: "30"
  } satisfies Record<CompressionSettings["preset"], string>;

  if (encoder.includes("_nvenc")) {
    return ["-preset", "p5", "-cq", cqByPreset[settings.preset], "-b:v", "0"];
  }

  if (encoder.includes("_qsv")) {
    return ["-global_quality", cqByPreset[settings.preset], "-look_ahead", "1"];
  }

  if (encoder.includes("_amf")) {
    return ["-quality", "balanced", "-qp_i", cqByPreset[settings.preset], "-qp_p", cqByPreset[settings.preset]];
  }

  return ["-preset", "medium", "-crf", crfByPreset[settings.preset]];
}

function getCompressionOutputPath(inputPath: string, outputFolder: string, preset: CompressionSettings["preset"]) {
  return getOutputPath(inputPath, outputFolder, "compressed", "mp4", preset);
}

function getOutputPath(inputPath: string, outputFolder: string, operation: string, extension: string, detail?: string) {
  const source = path.parse(inputPath);
  const targetFolder = outputFolder || source.dir;
  const suffix = [operation, detail].filter(Boolean).join("-");
  let outputPath = path.join(targetFolder, `${source.name}-${suffix}.${extension}`);
  let index = 2;

  while (fs.existsSync(outputPath)) {
    outputPath = path.join(targetFolder, `${source.name}-${suffix}-${index}.${extension}`);
    index += 1;
  }

  return outputPath;
}

function parseTimeSeconds(text: string) {
  const match = text.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);

  if (!match) {
    return undefined;
  }

  const [, hours, minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function parseNumberValue(text: string, key: string) {
  const match = text.match(new RegExp(`${key}=\\s*([\\d.]+)`));
  return match ? Number(match[1]) : undefined;
}

function parseTextValue(text: string, key: string) {
  const match = text.match(new RegExp(`${key}=\\s*([^\\s]+)`));
  return match?.[1];
}

function commandExists(command: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, ["-version"], { windowsHide: true });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function probeEncoderUsable(encoder: string) {
  return new Promise<{ usable: boolean; reason?: string }>((resolve) => {
    const child = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=64x64:d=0.1",
        "-frames:v",
        "1",
        "-c:v",
        encoder,
        "-f",
        "null",
        "-"
      ],
      { windowsHide: true }
    );
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => resolve({ usable: false, reason: error.message }));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ usable: true });
        return;
      }

      resolve({ usable: false, reason: getRelevantFfmpegError(stderr) ?? `Probe exited with code ${code}.` });
    });
  });
}

function readCommandOutput(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout || stderr);
        return;
      }

      reject(new Error(stderr || `${command} exited with code ${code}`));
    });
  });
}
