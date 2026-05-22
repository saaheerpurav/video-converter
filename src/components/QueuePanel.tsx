import { useCompressionQueue } from "../hooks/useCompressionQueue";
import { compressionPercent, fileLocation, formatBytes, formatDuration, formatElapsed, formatEta } from "../utils/format";

export function QueuePanel() {
  const items = useCompressionQueue((state) => state.items);
  const removeItem = useCompressionQueue((state) => state.removeItem);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center">
        <div>
          <p className="text-base font-semibold text-white">No videos queued</p>
          <p className="mt-1 max-w-md text-sm text-slate-400">Add videos from the left panel to begin compression.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
      {items.map((item) => (
        <article key={item.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-white">{item.name}</h3>
                <StatusPill status={item.status} />
                <TaskPill mode={item.mode} targetFormat={item.targetFormat} />
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">{item.path}</p>

              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Original" value={formatBytes(item.size)} />
                <Metric label="Duration" value={formatDuration(item.duration)} />
                <Metric label="Video" value={`${item.width ?? "?"}x${item.height ?? "?"} ${item.videoCodec ?? ""}`} />
                <Metric label="Output" value={item.outputSize ? formatBytes(item.outputSize) : "--"} />
              </div>
            </div>

            <button className="btn-ghost" onClick={() => removeItem(item.id)} disabled={item.status === "processing"}>
              Remove
            </button>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{item.status === "done" ? "Done" : `${Math.round(item.progress)}%`}</span>
              <span>
                Elapsed {formatElapsed(item.elapsedMs)}
                {item.status === "processing" && ` | ETA ${formatEta(item.etaMs)}`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  item.status === "done" ? "bg-emerald-500" : "bg-blue-500"
                }`}
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </div>

          {(item.status === "done" || item.status === "failed" || item.status === "cancelled") && (
            <div className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm">
              {item.status === "done" ? (
                <div className="grid gap-2 md:grid-cols-3">
                  {item.mode === "compress" ? (
                    <>
                      <Metric label="Reduction" value={compressionPercent(item.size, item.outputSize)} />
                      <Metric label="Saved" value={formatBytes(Math.max(0, item.size - (item.outputSize ?? item.size)))} />
                    </>
                  ) : (
                    <>
                      <Metric label="Output Size" value={formatBytes(item.outputSize)} />
                      <Metric label="Format" value={(item.targetFormat ?? item.extension).toUpperCase()} />
                    </>
                  )}
                  <Metric label="Location" value={fileLocation(item.outputPath) || "--"} />
                </div>
              ) : (
                <p className="text-red-300">{item.error ?? item.status}</p>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 truncate font-medium text-slate-200">{value}</p>
    </div>
  );
}

function TaskPill({ mode, targetFormat }: { mode: string; targetFormat?: string }) {
  const label =
    mode === "compress"
      ? "Compress"
      : mode === "convert"
        ? `Convert to ${targetFormat?.toUpperCase() ?? ""}`
        : `Extract ${targetFormat?.toUpperCase() ?? ""}`;

  return (
    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const classes: Record<string, string> = {
    queued: "bg-slate-800 text-slate-300",
    processing: "bg-blue-950 text-blue-200",
    done: "bg-emerald-950 text-emerald-200",
    failed: "bg-red-950 text-red-200",
    cancelled: "bg-amber-950 text-amber-200"
  };
  const labels: Record<string, string> = {
    queued: "Queued",
    processing: "Processing",
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled"
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${classes[status]}`}>
      {labels[status] ?? status}
    </span>
  );
}
