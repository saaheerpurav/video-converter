import { useEffect, useState } from "react";
import { CompressionSettingsPanel } from "./components/CompressionSettingsPanel";
import { DropZone } from "./components/DropZone";
import { QueuePanel } from "./components/QueuePanel";
import { Toast } from "./components/Toast";
import { useCompressionQueue } from "./hooks/useCompressionQueue";
import { electronApi } from "./services/electronApi";
import type { TaskMode } from "./types/media";
import { fileLocation } from "./utils/format";

const workflows: Array<{
  mode: TaskMode;
  title: string;
  description: string;
  detail: string;
  accent: string;
}> = [
  {
    mode: "compress",
    title: "Compress Video",
    description: "Reduce file size while keeping visual quality under control.",
    detail: "Best for sharing, archiving, and faster uploads.",
    accent: "from-emerald-500 to-teal-400"
  },
  {
    mode: "convert",
    title: "Convert Media",
    description: "Change video or audio formats for compatibility.",
    detail: "Supports common MP4, MOV, MKV, MP3, WAV, and FLAC flows.",
    accent: "from-amber-500 to-orange-400"
  },
  {
    mode: "extract",
    title: "Extract Audio",
    description: "Export the audio track from a video file.",
    detail: "Create MP3, WAV, or AAC audio output.",
    accent: "from-cyan-500 to-sky-400"
  },
  {
    mode: "caption",
    title: "Generate Captions",
    description: "Create a new video with burned-in captions.",
    detail: "Uses Foundry Speech and your caption style settings.",
    accent: "from-rose-500 to-fuchsia-400"
  }
];

export default function App() {
  const [hasSelectedWorkflow, setHasSelectedWorkflow] = useState(false);
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
  const updateSettings = useCompressionQueue((state) => state.updateSettings);
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

  const handleSelectWorkflow = async (mode: TaskMode) => {
    await updateSettings({ mode });
    setHasSelectedWorkflow(true);
  };

  const activeWorkflow = workflows.find((workflow) => workflow.mode === settings.mode) ?? workflows[0];

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#273127_0,#111714_34%,#090b0a_100%)] text-stone-100">
      {!hasSelectedWorkflow ? (
        <WorkflowSelection
          capabilitiesReady={capabilities !== null}
          ffmpegAvailable={capabilities?.ffmpegAvailable ?? true}
          isLoading={isLoading}
          onSelect={handleSelectWorkflow}
        />
      ) : (
        <section className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-5 py-4">
          <header className="mb-4 rounded-2xl border border-stone-800/80 bg-stone-950/70 p-4 shadow-2xl shadow-black/25 backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <button
                  className="mb-3 inline-flex items-center gap-2 rounded-full border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm font-semibold text-stone-200 transition hover:border-amber-500 hover:text-amber-200 disabled:border-stone-800 disabled:text-stone-600"
                  disabled={isProcessing}
                  onClick={() => setHasSelectedWorkflow(false)}
                  type="button"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Back
                </button>
                <div className="flex flex-wrap items-center gap-3">
                  <WorkflowMark mode={activeWorkflow.mode} accent={activeWorkflow.accent} />
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{activeWorkflow.title}</h1>
                    <p className="mt-1 max-w-2xl text-sm leading-5 text-stone-400">{activeWorkflow.description}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-stone-800 bg-stone-950 p-2 shadow-sm">
                <Stat label="Files" value={String(items.length)} />
                <Stat label="Done" value={String(completed.length)} />
              </div>
            </div>
          </header>

          {!capabilities?.ffmpegAvailable && capabilities !== null && (
            <div className="mb-4 rounded-xl border border-red-900/70 bg-red-950/50 px-4 py-3 text-sm text-red-200">
              FFmpeg was not found on PATH. Media processing requires FFmpeg and FFprobe.
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col gap-4">
              <DropZone onBrowse={handleBrowse} onPaths={addPaths} isLoading={isLoading} />
              <CompressionSettingsPanel />
            </aside>

            <section className="flex min-h-[420px] flex-col rounded-2xl border border-stone-800/80 bg-stone-950/75 p-4 shadow-2xl shadow-black/20 backdrop-blur">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Media Queue</h2>
                  <p className="mt-1 text-sm text-stone-400">Add files, review settings, then start processing.</p>
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
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </main>
  );
}

function WorkflowSelection({
  capabilitiesReady,
  ffmpegAvailable,
  isLoading,
  onSelect
}: {
  capabilitiesReady: boolean;
  ffmpegAvailable: boolean;
  isLoading: boolean;
  onSelect: (mode: TaskMode) => Promise<void>;
}) {
  return (
    <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-5 py-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.32em] text-amber-300">Video Converter</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
          Choose what you want to do.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-stone-400">
          Start with a workflow, then add videos and configure only the settings that matter for that task.
        </p>
      </div>

      {capabilitiesReady && !ffmpegAvailable && (
        <div className="mb-5 rounded-xl border border-red-900/70 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          FFmpeg was not found on PATH. Media processing requires FFmpeg and FFprobe.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {workflows.map((workflow) => (
          <button
            className="group rounded-3xl border border-stone-800/80 bg-stone-950/70 p-5 text-left shadow-2xl shadow-black/20 backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-amber-500/70 hover:bg-stone-900/80"
            disabled={isLoading}
            key={workflow.mode}
            onClick={() => void onSelect(workflow.mode)}
          >
            <div className="mb-7 flex items-center justify-between gap-4">
              <WorkflowMark mode={workflow.mode} accent={workflow.accent} />
              <span className="rounded-full border border-stone-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-stone-400 transition group-hover:border-amber-400/70 group-hover:text-amber-200">
                Select
              </span>
            </div>
            <h2 className="text-2xl font-semibold text-white">{workflow.title}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-400">{workflow.description}</p>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-stone-500">{workflow.detail}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function WorkflowMark({ mode, accent }: { mode: TaskMode; accent: string }) {
  return (
    <div className={`flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-stone-950 shadow-lg shadow-black/30`}>
      <WorkflowIcon mode={mode} />
    </div>
  );
}

function WorkflowIcon({ mode }: { mode: TaskMode }) {
  const common = "h-6 w-6";

  if (mode === "compress") {
    return (
      <svg className={common} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />
        <path d="M9 9h6v6H9z" />
      </svg>
    );
  }

  if (mode === "convert") {
    return (
      <svg className={common} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M7 7h11l-3-3M17 17H6l3 3" />
        <path d="M18 7v4M6 17v-4" />
      </svg>
    );
  }

  if (mode === "extract") {
    return (
      <svg className={common} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M9 18V5l10-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </svg>
    );
  }

  return (
    <svg className={common} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <path d="M7 15h4M13 15h4M7 11h10" />
    </svg>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : "text-white";

  return (
    <div className="min-w-24 rounded-lg bg-stone-900 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
