import { useDeferredValue, useMemo, useState } from "react";
import { useCompressionQueue } from "../hooks/useCompressionQueue";
import type {
  CaptionPosition,
  CompressionPreset,
  ConversionOutputFormat,
  ExtractionOutputFormat,
  HardwareAcceleration,
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
  const fonts = useCompressionQueue((state) => state.fonts);
  const updateSettings = useCompressionQueue((state) => state.updateSettings);
  const chooseOutputFolder = useCompressionQueue((state) => state.chooseOutputFolder);
  const captions = settings.captions;
  const previewTextShadow = [
    `0 1px 0 ${captions.outlineColor}`,
    `1px 0 0 ${captions.outlineColor}`,
    `0 -1px 0 ${captions.outlineColor}`,
    `-1px 0 0 ${captions.outlineColor}`,
    captions.shadowEnabled ? `2px 2px 2px ${captions.shadowColor}` : ""
  ]
    .filter(Boolean)
    .join(", ");
  const title =
    settings.mode === "compress"
      ? "Compression Settings"
      : settings.mode === "convert"
        ? "Conversion Settings"
        : settings.mode === "caption"
          ? "Caption Settings"
          : "Audio Settings";

  const updateCaptionSettings = (partial: Partial<typeof captions>) => {
    void updateSettings({ captions: { ...captions, ...partial } });
  };

  return (
    <div className="rounded-2xl border border-stone-800/80 bg-stone-950/75 p-4 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-4">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-stone-400">Configure the selected workflow before starting the queue.</p>
        </div>
      </div>

      <div className="space-y-4">
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
                        ? "border-amber-500 bg-amber-950/30 text-amber-100"
                        : "border-stone-800 bg-stone-950 text-stone-300 hover:border-stone-700"
                    }`}
                    onClick={() => void updateSettings({ preset: option.value })}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-stone-400">{option.description}</span>
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
              <div className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-stone-300">Hardware Encoding</span>
                  <span className="text-xs text-stone-500">{capabilities.platform}</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {capabilities.encoders.map((encoder) => (
                    <div key={encoder.id} className="flex items-start justify-between gap-3 text-xs">
                      <span className="font-medium text-stone-300">{encoder.label}</span>
                      <span className={encoder.usable ? "text-emerald-300" : "text-stone-500"}>
                        {encoder.usable ? "Usable" : encoder.compiled ? "Unavailable" : "Not compiled"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-stone-500">
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
            <span className="mt-2 block text-xs leading-5 text-stone-500">
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

        {settings.mode === "caption" && (
          <div className="space-y-4 pt-1">
            <div className="rounded-lg border border-stone-800 bg-stone-950 p-3">
              <div className="mb-3">
                <span className="field-label">Text Preview</span>
                <div
                  className={`relative flex h-40 overflow-hidden rounded-lg border border-stone-800 bg-gradient-to-br from-stone-900 via-stone-800 to-stone-950 p-4 ${
                    captions.position === "top"
                      ? "items-start"
                      : captions.position === "center"
                        ? "items-center"
                        : "items-end"
                  } justify-center`}
                  style={{ paddingTop: captions.position === "top" ? captions.marginV / 3 : undefined, paddingBottom: captions.position === "bottom" ? captions.marginV / 3 : undefined }}
                >
                  <p
                    className="max-w-full text-center font-bold leading-tight"
                    style={{
                      color: captions.fontColor,
                      fontFamily: captions.font,
                      fontSize: `${Math.max(8, captions.fontSize)}px`,
                      textShadow: previewTextShadow
                    }}
                  >
                    The quick brown fox jumps over the lazy dog
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="min-w-0">
                  <span className="field-label">Max Duration</span>
                  <input
                    className="field-control w-full"
                    min={0.9}
                    step={0.1}
                    type="number"
                    value={captions.maxDuration}
                    onChange={(event) => updateCaptionSettings({ maxDuration: Number(event.target.value) })}
                  />
                </label>

                <label className="min-w-0">
                  <span className="field-label">Font Size</span>
                  <input
                    className="field-control w-full"
                    min={8}
                    step={1}
                    type="number"
                    value={captions.fontSize}
                    onChange={(event) => updateCaptionSettings({ fontSize: Number(event.target.value) })}
                  />
                </label>
              </div>
            </div>

            <FontPicker
              fonts={fonts}
              value={captions.font}
              onChange={(font) => updateCaptionSettings({ font })}
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="min-w-0">
                <span className="field-label">Text Color</span>
                <input
                  className="field-control h-10 w-full p-1"
                  type="color"
                  value={captions.fontColor}
                  onChange={(event) => updateCaptionSettings({ fontColor: event.target.value.toUpperCase() })}
                />
              </label>

              <label className="min-w-0">
                <span className="field-label">Outline</span>
                <input
                  className="field-control h-10 w-full p-1"
                  type="color"
                  value={captions.outlineColor}
                  onChange={(event) => updateCaptionSettings({ outlineColor: event.target.value.toUpperCase() })}
                />
              </label>
            </div>

            <div className="grid gap-3">
              <div className="rounded-lg border border-stone-800 bg-stone-950 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="field-label mb-0">Shadow</span>
                    <p className="mt-1 text-xs text-stone-500">Adds depth behind burned captions.</p>
                  </div>
                  <button
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      captions.shadowEnabled
                        ? "bg-amber-500 text-stone-950"
                        : "border border-stone-700 bg-stone-900 text-stone-300"
                    }`}
                    onClick={() => updateCaptionSettings({ shadowEnabled: !captions.shadowEnabled })}
                    type="button"
                  >
                    {captions.shadowEnabled ? "On" : "Off"}
                  </button>
                </div>
                <input
                  className="field-control mt-3 h-10 w-full p-1"
                  disabled={!captions.shadowEnabled}
                  type="color"
                  value={captions.shadowColor}
                  onChange={(event) => updateCaptionSettings({ shadowColor: event.target.value.toUpperCase() })}
                />
              </div>

              <label className="min-w-0">
                <span className="field-label">Margin</span>
                <input
                  className="field-control w-full"
                  min={0}
                  step={1}
                  type="number"
                  value={captions.marginV}
                  onChange={(event) => updateCaptionSettings({ marginV: Number(event.target.value) })}
                />
              </label>
            </div>

            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
              <label className="min-w-0">
                <span className="field-label">Position</span>
                <select
                  className="field-control w-full"
                  value={captions.position}
                  onChange={(event) => updateCaptionSettings({ position: event.target.value as CaptionPosition })}
                >
                  <option value="bottom">Bottom</option>
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                </select>
              </label>

              <label className="min-w-0">
                <span className="field-label">Max Chars</span>
                <input
                  className="field-control w-full"
                  min={12}
                  step={1}
                  type="number"
                  value={captions.maxChars}
                  onChange={(event) => updateCaptionSettings({ maxChars: Number(event.target.value) })}
                />
              </label>
            </div>
          </div>
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

function FontPicker({
  fonts,
  value,
  onChange
}: {
  fonts: string[];
  value: string;
  onChange: (font: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const options = useMemo(() => {
    const availableFonts = fonts.length > 0 ? fonts : [value || "Arial"];

    return availableFonts
      .filter((font) => font.toLowerCase().includes(normalizedQuery))
      .slice(0, 80);
  }, [fonts, normalizedQuery, value]);

  return (
    <div className="relative">
      <span className="field-label">Font</span>
      <button
        className="field-control flex min-h-10 w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="truncate" style={{ fontFamily: value }}>
          {value}
        </span>
        <span className="text-xs text-stone-500">{open ? "Close" : "Search"}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-lg border border-stone-700 bg-stone-950 p-2 shadow-xl">
          <input
            autoFocus
            className="field-control mb-2 w-full"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search installed fonts"
            value={query}
          />
          <div className="max-h-56 overflow-auto pr-1">
            {options.length > 0 ? (
              options.map((font) => (
                <button
                  className={`block w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-stone-900 ${
                    font === value ? "bg-amber-950/50 text-amber-100" : "text-stone-200"
                  }`}
                  key={font}
                  onClick={() => {
                    onChange(font);
                    setQuery("");
                    setOpen(false);
                  }}
                  style={{ fontFamily: font }}
                  type="button"
                >
                  {font}
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-sm text-stone-500">No matching fonts found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
