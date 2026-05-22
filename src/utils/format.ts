export function formatBytes(bytes?: number) {
  if (bytes === undefined || Number.isNaN(bytes)) {
    return "--";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) {
    return "--";
  }

  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }

  return `${secs}s`;
}

export function formatElapsed(ms?: number) {
  if (!ms || ms <= 0) {
    return "0s";
  }

  return formatDuration(ms / 1000);
}

export function formatEta(ms?: number) {
  if (ms === undefined) {
    return "Calculating";
  }

  if (ms <= 0) {
    return "Done";
  }

  return formatDuration(ms / 1000);
}

export function compressionPercent(originalSize: number, outputSize?: number) {
  if (!outputSize || originalSize <= 0) {
    return "--";
  }

  const reduction = ((originalSize - outputSize) / originalSize) * 100;
  return `${Math.max(0, reduction).toFixed(1)}% smaller`;
}

export function fileLocation(filePath?: string) {
  if (!filePath) {
    return "";
  }

  const normalized = filePath.replaceAll("\\", "/");
  return normalized.slice(0, normalized.lastIndexOf("/"));
}
