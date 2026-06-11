import { create } from "zustand";
import { electronApi } from "../services/electronApi";
import type {
  AppSettings,
  CompressionComplete,
  CompressionFailed,
  CompressionProgress,
  EncoderCapabilities,
  QueueItem
} from "../types/media";
import { isSupportedConversion, unsupportedConversionMessage } from "../utils/mediaRules";

type ToastState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

type CompressionState = {
  items: QueueItem[];
  settings: AppSettings;
  capabilities: EncoderCapabilities | null;
  fonts: string[];
  activeItemId: string | null;
  activeJobId: string | null;
  isProcessing: boolean;
  isLoading: boolean;
  toast: ToastState;
  initialize: () => Promise<void>;
  setToast: (toast: ToastState) => void;
  addPaths: (paths: string[]) => Promise<void>;
  removeItem: (id: string) => void;
  clearCompleted: () => void;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  chooseOutputFolder: () => Promise<void>;
  startQueue: () => Promise<void>;
  cancelCurrent: () => Promise<void>;
  handleProgress: (progress: CompressionProgress) => void;
  handleComplete: (complete: CompressionComplete) => void;
  handleFailed: (failed: CompressionFailed) => void;
};

const defaultSettings: AppSettings = {
  mode: "compress",
  preset: "balanced",
  codec: "h264",
  acceleration: "none",
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
  outputFolder: ""
};

export const useCompressionQueue = create<CompressionState>((set, get) => ({
  items: [],
  settings: defaultSettings,
  capabilities: null,
  fonts: [],
  activeItemId: null,
  activeJobId: null,
  isProcessing: false,
  isLoading: false,
  toast: null,

  initialize: async () => {
    set({ isLoading: true });

    try {
      const [settings, capabilities, fonts] = await Promise.all([
        electronApi.getSettings(),
        electronApi.getCapabilities(),
        electronApi.listFonts().catch(() => [])
      ]);
      set({ settings: normalizeSettings(settings), capabilities, fonts, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        toast: {
          type: "error",
          message: error instanceof Error ? error.message : "Unable to initialize app."
        }
      });
    }
  },

  setToast: (toast) => set({ toast }),

  addPaths: async (paths) => {
    const uniquePaths = paths.filter((filePath) => !get().items.some((item) => item.path === filePath));

    if (uniquePaths.length === 0) {
      return;
    }

    set({ isLoading: true });

    try {
      const analyzed = await electronApi.analyzeFiles(uniquePaths);
      const settings = get().settings;
      const items = analyzed.map<QueueItem>((file) => ({
        ...file,
        id: crypto.randomUUID(),
        mode: settings.mode,
        targetFormat:
          settings.mode === "convert"
            ? settings.conversionFormat
            : settings.mode === "extract"
              ? settings.extractionFormat
              : undefined,
        status: "queued",
        progress: 0,
        elapsedMs: 0,
        etaMs: undefined
      }));

      set((state) => ({
        items: [...state.items, ...items],
        isLoading: false,
        toast: { type: "success", message: `${items.length} file${items.length === 1 ? "" : "s"} added.` }
      }));
    } catch (error) {
      set({
        isLoading: false,
        toast: {
          type: "error",
          message: error instanceof Error ? error.message : "Unable to analyze selected media."
        }
      });
    }
  },

  removeItem: (id) => {
    const item = get().items.find((entry) => entry.id === id);

    if (item?.jobId && item.status === "processing") {
      void electronApi.cancelCompression(item.jobId);
    }

    set((state) => ({
      items: state.items.filter((entry) => entry.id !== id)
    }));
  },

  clearCompleted: () => {
    set((state) => ({
      items: state.items.filter((item) => item.status !== "done" && item.status !== "failed" && item.status !== "cancelled")
    }));
  },

  updateSettings: async (partial) => {
    const settings = normalizeSettings({ ...get().settings, ...partial });
    set((state) => ({
      settings,
      items: state.items.map((item) =>
        item.status === "queued"
          ? {
              ...item,
              mode: settings.mode,
              targetFormat: getTargetFormat(settings)
            }
          : item
      )
    }));

    try {
      const saved = await electronApi.saveSettings(settings);
      set({ settings: saved });
    } catch {
      set({ toast: { type: "error", message: "Unable to save settings." } });
    }
  },

  chooseOutputFolder: async () => {
    const folder = await electronApi.selectOutputFolder();

    if (folder) {
      await get().updateSettings({ outputFolder: folder });
    }
  },

  startQueue: async () => {
    if (get().isProcessing) {
      return;
    }

    const nextItem = get().items.find((item) => item.status === "queued");

    if (!nextItem) {
      set({ toast: { type: "info", message: "Queue is empty." } });
      return;
    }

    const validationError = validateQueueItem(nextItem);

    if (validationError) {
      set((state) => ({
        items: state.items.map((item) =>
          item.id === nextItem.id ? { ...item, status: "failed", error: validationError } : item
        ),
        toast: { type: "error", message: validationError }
      }));
      void get().startQueue();
      return;
    }

    set((state) => ({
      isProcessing: true,
      activeItemId: nextItem.id,
      items: state.items.map((item) =>
        item.id === nextItem.id
          ? { ...item, status: "processing", progress: 0, elapsedMs: 0, etaMs: undefined, error: undefined }
          : item
      )
    }));

    try {
      const started = await electronApi.startMediaJob({
        inputPath: nextItem.path,
        mode: nextItem.mode,
        settings: get().settings,
        targetFormat: nextItem.targetFormat ?? getTargetFormat(get().settings)
      });

      set((state) => ({
        activeJobId: started.jobId,
        items: state.items.map((item) =>
          item.id === nextItem.id ? { ...item, jobId: started.jobId, outputPath: started.outputPath } : item
        )
      }));
    } catch (error) {
      set((state) => ({
        isProcessing: false,
        activeItemId: null,
        activeJobId: null,
        items: state.items.map((item) =>
          item.id === nextItem.id
            ? {
                ...item,
                status: "failed",
                error: error instanceof Error ? error.message : "Unable to start compression."
              }
            : item
        ),
        toast: { type: "error", message: "Job failed to start." }
      }));
    }
  },

  cancelCurrent: async () => {
    const jobId = get().activeJobId;

    if (!jobId) {
      return;
    }

    await electronApi.cancelCompression(jobId);
  },

  handleProgress: (progress) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.jobId === progress.jobId || item.id === state.activeItemId
          ? { ...item, progress: progress.percent, elapsedMs: progress.elapsedMs, etaMs: estimateEta(item.etaMs, progress) }
          : item
      )
    }));
  },

  handleComplete: (complete) => {
    set((state) => ({
      isProcessing: false,
      activeItemId: null,
      activeJobId: null,
      items: state.items.map((item) =>
        item.jobId === complete.jobId
          ? {
              ...item,
              status: "done",
              progress: 100,
              etaMs: 0,
              outputPath: complete.outputPath,
              outputSize: complete.outputSize,
              elapsedMs: complete.elapsedMs
            }
          : item
      ),
      toast: { type: "success", message: "Job complete." }
    }));

    void get().startQueue();
  },

  handleFailed: (failed) => {
    const cancelled = failed.error.toLowerCase().includes("cancel");

    set((state) => ({
      isProcessing: false,
      activeItemId: null,
      activeJobId: null,
      items: state.items.map((item) =>
        item.jobId === failed.jobId || item.id === state.activeItemId
          ? {
              ...item,
              status: cancelled ? "cancelled" : "failed",
              etaMs: undefined,
              error: failed.error
            }
          : item
      ),
      toast: { type: cancelled ? "info" : "error", message: failed.error }
    }));

    if (!cancelled) {
      void get().startQueue();
    }
  }
}));

function estimateEta(previousEtaMs: number | undefined, progress: CompressionProgress) {
  if (progress.percent < 5 || progress.percent >= 100 || progress.elapsedMs <= 0) {
    return progress.percent >= 100 ? 0 : undefined;
  }

  const estimatedTotalMs = progress.elapsedMs / (progress.percent / 100);
  const nextEtaMs = Math.max(0, estimatedTotalMs - progress.elapsedMs);

  if (!Number.isFinite(nextEtaMs)) {
    return previousEtaMs;
  }

  return previousEtaMs === undefined ? nextEtaMs : previousEtaMs * 0.65 + nextEtaMs * 0.35;
}

function getTargetFormat(settings: AppSettings) {
  if (settings.mode === "convert") {
    return settings.conversionFormat;
  }

  if (settings.mode === "extract") {
    return settings.extractionFormat;
  }

  return undefined;
}

function validateQueueItem(item: QueueItem) {
  if (item.mode === "caption" && (!item.width || !item.height)) {
    return "Captions require a video file.";
  }

  if (item.mode !== "convert" || !item.targetFormat) {
    return null;
  }

  if (isSupportedConversion(item.extension, item.targetFormat)) {
    return null;
  }

  return unsupportedConversionMessage(item.extension, item.targetFormat);
}

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...defaultSettings,
    ...settings,
    captions: {
      ...defaultSettings.captions,
      ...settings.captions
    }
  };
}
