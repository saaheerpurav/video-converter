import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
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

const runningJobs = new Map<string, ChildProcessWithoutNullStreams>();

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
  const info = await analyzeMediaFile(payload.inputPath);
  const jobId = crypto.randomUUID();
  const { outputPath, args } = await buildMediaJob(payload);
  const startedAt = Date.now();
  const ffmpeg = spawn("ffmpeg", args, { windowsHide: true });
  let stderr = "";

  runningJobs.set(jobId, ffmpeg);

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

  job.kill("SIGTERM");
  runningJobs.delete(jobId);
  return true;
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
