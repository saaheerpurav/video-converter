import { contextBridge, ipcRenderer, webUtils } from "electron";
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
} from "./types";

const mediaApi = {
  selectFiles: () => ipcRenderer.invoke("dialog:select-files") as Promise<string[]>,
  selectOutputFolder: () => ipcRenderer.invoke("dialog:select-output-folder") as Promise<string | null>,
  openOutputFolder: (folderPath: string) => ipcRenderer.invoke("shell:open-folder", folderPath) as Promise<void>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  analyzeFiles: (paths: string[]) => ipcRenderer.invoke("media:analyze-files", paths) as Promise<MediaFileInfo[]>,
  getCapabilities: () => ipcRenderer.invoke("ffmpeg:get-capabilities") as Promise<EncoderCapabilities>,
  startCompression: (payload: StartCompressionPayload) =>
    ipcRenderer.invoke("compression:start", payload) as Promise<CompressionStarted>,
  startMediaJob: (payload: StartMediaJobPayload) =>
    ipcRenderer.invoke("media:start-job", payload) as Promise<CompressionStarted>,
  cancelCompression: (jobId: string) => ipcRenderer.invoke("compression:cancel", jobId) as Promise<boolean>,
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("settings:save", settings) as Promise<AppSettings>,
  onCompressionProgress: (callback: (event: CompressionProgress) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: CompressionProgress) => callback(event);
    ipcRenderer.on("compression:progress", listener);
    return () => ipcRenderer.removeListener("compression:progress", listener);
  },
  onCompressionComplete: (callback: (event: CompressionComplete) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: CompressionComplete) => callback(event);
    ipcRenderer.on("compression:complete", listener);
    return () => ipcRenderer.removeListener("compression:complete", listener);
  },
  onCompressionFailed: (callback: (event: CompressionFailed) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: CompressionFailed) => callback(event);
    ipcRenderer.on("compression:failed", listener);
    return () => ipcRenderer.removeListener("compression:failed", listener);
  }
};

contextBridge.exposeInMainWorld("mediaApi", mediaApi);

export type MediaApi = typeof mediaApi;
