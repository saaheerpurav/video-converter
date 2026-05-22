import type { ConversionOutputFormat } from "../types/media";

const conversionTargets: Record<string, ConversionOutputFormat[]> = {
  mp4: ["mov", "mkv", "mp3"],
  mov: ["mp4", "mkv", "mp3"],
  mkv: ["mp4", "mov"],
  webm: ["mp4"],
  avi: ["mp4"],
  wav: ["mp3"],
  mp3: ["wav", "flac"],
  flac: ["mp3"]
};

export function getSupportedConversionTargets(sourceFormat: string) {
  return conversionTargets[sourceFormat.toLowerCase()] ?? [];
}

export function isSupportedConversion(sourceFormat: string, targetFormat: string) {
  return getSupportedConversionTargets(sourceFormat).includes(targetFormat.toLowerCase() as ConversionOutputFormat);
}

export function unsupportedConversionMessage(sourceFormat: string, targetFormat: string) {
  const supported = getSupportedConversionTargets(sourceFormat);

  if (supported.length === 0) {
    return `${sourceFormat.toUpperCase()} conversion is not supported.`;
  }

  return `${sourceFormat.toUpperCase()} to ${targetFormat.toUpperCase()} is not supported. Supported targets: ${supported
    .map((format) => format.toUpperCase())
    .join(", ")}.`;
}
