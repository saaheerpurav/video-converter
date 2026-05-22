import { useEffect } from "react";
import { CompressionSettingsPanel } from "./components/CompressionSettingsPanel";
import { DropZone } from "./components/DropZone";
import { QueuePanel } from "./components/QueuePanel";
import { Toast } from "./components/Toast";
import { useCompressionQueue } from "./hooks/useCompressionQueue";
import { electronApi } from "./services/electronApi";
import { fileLocation } from "./utils/format";

export default function App() {
  const items = useCompressionQueue((state) => state.items);
  const settings = useCompressionQueue((state) => state.settings);
  const capabilities = useCompressionQueue((state) => state.capabilities);
  const isProcessing = useCompressionQueue((state) => state.isProcessing);
  const isLoading = useCompressionQueue((state) => state.isLoading);
  const toast = useCompressionQueue((state) => state.toast);
  const initialize = useCompressionQueue((state) => state.initialize);
  const addPaths = useCompressionQueue((state) => state.addPaths);
  const chooseOutputFolder = useCompressionQueue((state) => state.chooseOutputFolder);
  const startQueue = useCompressionQueue((state) => state.startQueue);
  const cancelCurrent = useCompressionQueue((state) => state.cancelCurrent);
  const clearCompleted = useCompressionQueue((state) => state.clearCompleted);
  const setToast = useCompressionQueue((state) => state.setToast);
  const handleProgress = useCompressionQueue((state) => state.handleProgress);
  const handleComplete = useCompressionQueue((state) => state.handleComplete);
  const handleFailed = useCompressionQueue((state) => state.handleFailed);

  const completed = items.filter((item) => item.status === "done");

  useEffect(() => {
    void initialize();

    const offProgress = electronApi.onCompressionProgress(handleProgress);
    const offComplete = electronApi.onCompressionComplete(handleComplete);
    const offFailed = electronApi.onCompressionFailed(handleFailed);

    return () => {
      offProgress();
      offComplete();
      offFailed();
    };
  }, [handleComplete, handleFailed, handleProgress, initialize]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [setToast, toast]);

  const handleBrowse = async () => {
    const paths = await electronApi.selectFiles();
    await addPaths(paths);
  };

  const handleOpenOutput = async () => {
    const folder = settings.outputFolder || fileLocation(completed.at(-1)?.outputPath);

    if (folder) {
      await electronApi.openOutputFolder(folder);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 py-4">
        <header className="mb-4 flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Video Converter</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-400">
              Compress, convert, and extract audio from local media files.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-sm">
            <Stat label="Files" value={String(items.length)} />
            <Stat label="Done" value={String(completed.length)} />
          </div>
        </header>

        {!capabilities?.ffmpegAvailable && capabilities !== null && (
          <div className="mb-4 rounded-lg border border-red-900/70 bg-red-950/50 px-4 py-3 text-sm text-red-200">
            FFmpeg was not found on PATH. Compression requires FFmpeg and FFprobe.
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-4">
            <DropZone onBrowse={handleBrowse} onPaths={addPaths} isLoading={isLoading} />
            <CompressionSettingsPanel />
          </aside>

          <section className="flex min-h-[420px] flex-col rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Media Queue</h2>
                <p className="mt-1 text-sm text-slate-400">Tasks are processed one at a time.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={chooseOutputFolder}>
                  Output Folder
                </button>
                <button className="btn-secondary" onClick={handleOpenOutput} disabled={!settings.outputFolder && completed.length === 0}>
                  Open Output
                </button>
                <button className="btn-secondary" onClick={clearCompleted} disabled={!items.some((item) => item.status !== "queued" && item.status !== "processing")}>
                  Clear Finished
                </button>
                {isProcessing ? (
                  <button className="btn-danger" onClick={cancelCurrent}>
                    Cancel
                  </button>
                ) : (
                  <button className="btn-primary" onClick={startQueue} disabled={!items.some((item) => item.status === "queued")}>
                    Start Queue
                  </button>
                )}
              </div>
            </div>

            <QueuePanel />
          </section>
        </div>
      </section>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </main>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : "text-white";

  return (
    <div className="min-w-24 rounded-lg bg-slate-800 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-base font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
