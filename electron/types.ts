export type CompressionPreset = "high" | "balanced" | "small";
export type VideoCodec = "h264" | "h265";
export type HardwareAcceleration = "auto" | "none" | "nvenc" | "qsv" | "amf";
export type TaskMode = "compress" | "convert" | "extract";
export type ConversionOutputFormat = "mp4" | "mov" | "mkv" | "mp3" | "wav" | "flac";
export type ExtractionOutputFormat = "mp3" | "wav" | "aac";

export type CompressionSettings = {
  preset: CompressionPreset;
  codec: VideoCodec;
  acceleration: HardwareAcceleration;
  outputFolder: string;
};

export type AppSettings = CompressionSettings & {
  mode: TaskMode;
  conversionFormat: ConversionOutputFormat;
  extractionFormat: ExtractionOutputFormat;
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
