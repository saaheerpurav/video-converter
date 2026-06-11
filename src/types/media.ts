export type CompressionPreset = "high" | "balanced" | "small";
export type VideoCodec = "h264" | "h265";
export type HardwareAcceleration = "auto" | "none" | "nvenc" | "qsv" | "amf";
export type TaskMode = "compress" | "convert" | "extract" | "caption";
export type ConversionOutputFormat = "mp4" | "mov" | "mkv" | "mp3" | "wav" | "flac";
export type ExtractionOutputFormat = "mp3" | "wav" | "aac";
export type CaptionPosition = "bottom" | "center" | "top";

export type CompressionSettings = {
  preset: CompressionPreset;
  codec: VideoCodec;
  acceleration: HardwareAcceleration;
  outputFolder: string;
};

export type CaptionSettings = {
  maxDuration: number;
  font: string;
  fontSize: number;
  fontColor: string;
  outlineColor: string;
  shadowEnabled: boolean;
  shadowColor: string;
  position: CaptionPosition;
  marginV: number;
  maxChars: number;
};

export type AppSettings = CompressionSettings & {
  mode: TaskMode;
  conversionFormat: ConversionOutputFormat;
  extractionFormat: ExtractionOutputFormat;
  captions: CaptionSettings;
};

export type MediaFileInfo = {
  path: string;
  name: string;
  extension: string;
  size: number;
  duration: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
};

export type EncoderCapabilities = {
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  platform: NodeJS.Platform;
  recommendedAcceleration: HardwareAcceleration;
  encoders: Array<{
    id: Exclude<HardwareAcceleration, "auto" | "none">;
    label: string;
    compiled: boolean;
    usable: boolean;
    reason?: string;
  }>;
  nvenc: boolean;
  qsv: boolean;
  amf: boolean;
};

export type StartCompressionPayload = {
  inputPath: string;
  settings: CompressionSettings;
};

export type StartMediaJobPayload = {
  inputPath: string;
  mode: TaskMode;
  settings: AppSettings;
  targetFormat?: ConversionOutputFormat | ExtractionOutputFormat;
};

export type CompressionStarted = {
  jobId: string;
  outputPath: string;
};

export type CompressionProgress = {
  jobId: string;
  percent: number;
  elapsedMs: number;
  timeSeconds: number;
  fps?: number;
  speed?: string;
};

export type CompressionComplete = {
  jobId: string;
  outputPath: string;
  outputSize: number;
  elapsedMs: number;
};

export type CompressionFailed = {
  jobId: string;
  error: string;
};

export type QueueStatus = "queued" | "processing" | "done" | "failed" | "cancelled";

export type QueueItem = MediaFileInfo & {
  id: string;
  mode: TaskMode;
  targetFormat?: ConversionOutputFormat | ExtractionOutputFormat;
  status: QueueStatus;
  progress: number;
  elapsedMs: number;
  etaMs?: number;
  jobId?: string;
  outputPath?: string;
  outputSize?: number;
  error?: string;
};
