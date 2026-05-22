import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { AppSettings } from "./types";

const defaultSettings: AppSettings = {
  mode: "compress",
  preset: "balanced",
  codec: "h264",
  acceleration: "none",
  conversionFormat: "mp4",
  extractionFormat: "mp3",
  outputFolder: ""
};

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

export function readSettings(): AppSettings {
  const settingsPath = getSettingsPath();

  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    const parsed = { ...defaultSettings, ...JSON.parse(raw) } as AppSettings;
    return parsed.acceleration === "auto" ? { ...parsed, acceleration: "none" } : parsed;
  } catch {
    return { ...defaultSettings };
  }
}

export function writeSettings(settings: AppSettings): AppSettings {
  const normalized = { ...defaultSettings, ...settings };
  if (normalized.acceleration === "auto") {
    normalized.acceleration = "none";
  }
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
