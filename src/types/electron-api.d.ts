import type {
  AppSettings,
  CompressionComplete,
  CompressionFailed,
  CompressionProgress,
  CompressionStarted,
  EncoderCapabilities,
  MediaFileInfo,
  StartCompressionPayload,
  StartMediaJobPayload
} from "./media";

export type MediaApi = {
  selectFiles: () => Promise<string[]>;
  selectOutputFolder: () => Promise<string | null>;
  openOutputFolder: (folderPath: string) => Promise<void>;
  getPathForFile: (file: File) => string;
  analyzeFiles: (paths: string[]) => Promise<MediaFileInfo[]>;
  getCapabilities: () => Promise<EncoderCapabilities>;
  startCompression: (payload: StartCompressionPayload) => Promise<CompressionStarted>;
  startMediaJob: (payload: StartMediaJobPayload) => Promise<CompressionStarted>;
  cancelCompression: (jobId: string) => Promise<boolean>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  onCompressionProgress: (callback: (event: CompressionProgress) => void) => () => void;
  onCompressionComplete: (callback: (event: CompressionComplete) => void) => () => void;
  onCompressionFailed: (callback: (event: CompressionFailed) => void) => () => void;
};

declare global {
  interface Window {
    mediaApi: MediaApi;
  }
}

export {};
