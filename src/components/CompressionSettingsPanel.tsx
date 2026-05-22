import { useCompressionQueue } from "../hooks/useCompressionQueue";
import type {
  CompressionPreset,
  ConversionOutputFormat,
  ExtractionOutputFormat,
  HardwareAcceleration,
  TaskMode,
  VideoCodec
} from "../types/media";

const presetOptions: Array<{ value: CompressionPreset; label: string; description: string }> = [
  { value: "high", label: "High Quality", description: "Larger output, cleaner image" },
  { value: "balanced", label: "Balanced", description: "Good daily default" },
  { value: "small", label: "Small Size", description: "Maximum reduction" }
];

const codecOptions: Array<{ value: VideoCodec; label: string }> = [
  { value: "h264", label: "H.264" },
  { value: "h265", label: "H.265" }
];

const accelerationOptions: Array<{ value: HardwareAcceleration; label: string }> = [
  { value: "none", label: "CPU (Recommended)" },
  { value: "nvenc", label: "NVIDIA NVENC" },
  { value: "qsv", label: "Intel QuickSync" },
  { value: "amf", label: "AMD AMF" }
];

const modeOptions: Array<{ value: TaskMode; label: string; description: string }> = [
  { value: "compress", label: "Compress", description: "Reduce video size" },
  { value: "convert", label: "Convert", description: "Change media format" },
  { value: "extract", label: "Extract Audio", description: "Export audio from video" }
];

const conversionOptions: Array<{ value: ConversionOutputFormat; label: string }> = [
  { value: "mp4", label: "MP4" },
  { value: "mov", label: "MOV" },
  { value: "mkv", label: "MKV" },
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "flac", label: "FLAC" }
];

const extractionOptions: Array<{ value: ExtractionOutputFormat; label: string }> = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "aac", label: "AAC" }
];

export function CompressionSettingsPanel() {
  const settings = useCompressionQueue((state) => state.settings);
  const capabilities = useCompressionQueue((state) => state.capabilities);
  const updateSettings = useCompressionQueue((state) => state.updateSettings);
  const chooseOutputFolder = useCompressionQueue((state) => state.chooseOutputFolder);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
      <div className="mb-4">
        <div>
          <h2 className="text-base font-semibold text-white">Task Settings</h2>
          <p className="mt-1 text-sm text-slate-400">Choose a workflow, then add files to the queue.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="field-label">Mode</label>
          <div className="grid gap-2">
            {modeOptions.map((option) => (
              <button
                key={option.value}
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  settings.mode === option.value
                    ? "border-blue-500 bg-blue-950/60 text-blue-100"
                    : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700"
                }`}
                onClick={() => void updateSettings({ mode: option.value })}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-0.5 block text-xs text-slate-400">{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        {settings.mode === "compress" && (
          <div className="space-y-4 pt-1">
            <div>
              <label className="field-label">Preset</label>
              <div className="grid gap-2">
                {presetOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      settings.preset === option.value
                        ? "border-blue-500 bg-blue-950/60 text-blue-100"
                        : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700"
                    }`}
                    onClick={() => void updateSettings({ preset: option.value })}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">{option.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.7fr)] gap-3">
              <label className="min-w-0">
                <span className="field-label">Codec</span>
                <select
                  className="field-control w-full"
                  value={settings.codec}
                  onChange={(event) => void updateSettings({ codec: event.target.value as VideoCodec })}
                >
                  {codecOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="min-w-0">
                <span className="field-label">Acceleration</span>
                <select
                  className="field-control w-full"
                  value={settings.acceleration}
                  onChange={(event) => void updateSettings({ acceleration: event.target.value as HardwareAcceleration })}
                >
                  {accelerationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {capabilities && (
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-300">Hardware Encoding</span>
                  <span className="text-xs text-slate-500">{capabilities.platform}</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {capabilities.encoders.map((encoder) => (
                    <div key={encoder.id} className="flex items-start justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-300">{encoder.label}</span>
                      <span className={encoder.usable ? "text-emerald-300" : "text-slate-500"}>
                        {encoder.usable ? "Usable" : encoder.compiled ? "Unavailable" : "Not compiled"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Recommended: {capabilities.recommendedAcceleration === "none" ? "CPU" : capabilities.recommendedAcceleration.toUpperCase()}
                </p>
              </div>
            )}
          </div>
        )}

        {settings.mode === "convert" && (
          <label className="block pt-1">
            <span className="field-label">Convert To</span>
            <select
              className="field-control w-full"
              value={settings.conversionFormat}
              onChange={(event) =>
                void updateSettings({ conversionFormat: event.target.value as ConversionOutputFormat })
              }
            >
              {conversionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-xs leading-5 text-slate-500">
              Supported: MP4/MOV/MKV pairs, WEBM/AVI to MP4, MP4/MOV to MP3, WAV/MP3, and FLAC/MP3.
            </span>
          </label>
        )}

        {settings.mode === "extract" && (
          <label className="block pt-1">
            <span className="field-label">Audio Format</span>
            <select
              className="field-control w-full"
              value={settings.extractionFormat}
              onChange={(event) =>
                void updateSettings({ extractionFormat: event.target.value as ExtractionOutputFormat })
              }
            >
              {extractionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div>
          <label className="field-label">Output Folder</label>
          <button className="field-control min-h-12 w-full truncate text-left" onClick={chooseOutputFolder}>
            {settings.outputFolder || "Same folder as source"}
          </button>
        </div>
      </div>
    </div>
  );
}
