import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import {
  analyzeMediaFile,
  cancelCompression,
  getCapabilities,
  startCompression,
  startMediaJob
} from "./ffmpeg";
import { listSystemFonts } from "./fonts";
import { readSettings, writeSettings } from "./settings";
import type { AppSettings, StartCompressionPayload, StartMediaJobPayload } from "./types";

let mainWindow: BrowserWindow | null = null;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: "Video Converter",
    backgroundColor: "#071014",
    icon: path.join(__dirname, "../build/icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev
    }
  });

  if (!isDev) {
    mainWindow.webContents.on("before-input-event", (event, input) => {
      const key = input.key.toLowerCase();
      const opensDevTools =
        key === "f12" ||
        (input.control && input.shift && key === "i") ||
        (input.control && input.shift && key === "j") ||
        (input.control && input.shift && key === "c");

      if (opensDevTools) {
        event.preventDefault();
      }
    });

    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow?.webContents.closeDevTools();
    });
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function registerIpc() {
  ipcMain.handle("dialog:select-files", async () => {
    const options = {
      title: "Select media files",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Media files", extensions: ["mp4", "mov", "mkv", "webm", "avi", "mp3", "wav", "flac"] },
        { name: "All files", extensions: ["*"] }
      ]
    } satisfies Electron.OpenDialogOptions;
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("dialog:select-output-folder", async () => {
    const options = {
      title: "Choose output folder",
      properties: ["openDirectory", "createDirectory"]
    } satisfies Electron.OpenDialogOptions;
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("shell:open-folder", async (_event, folderPath: string) => {
    if (folderPath) {
      await shell.openPath(folderPath);
    }
  });

  ipcMain.handle("media:analyze-files", async (_event, paths: string[]) => {
    return Promise.all(paths.map((filePath) => analyzeMediaFile(filePath)));
  });

  ipcMain.handle("ffmpeg:get-capabilities", async () => getCapabilities());

  ipcMain.handle("fonts:list", async () => listSystemFonts());

  ipcMain.handle("settings:get", async () => readSettings());

  ipcMain.handle("settings:save", async (_event, settings: AppSettings) => writeSettings(settings));

  ipcMain.handle("compression:start", async (event, payload: StartCompressionPayload) => {
    return startCompression(payload, {
      onProgress: (progress) => event.sender.send("compression:progress", progress),
      onComplete: (complete) => event.sender.send("compression:complete", complete),
      onFailed: (failed) => event.sender.send("compression:failed", failed)
    });
  });

  ipcMain.handle("media:start-job", async (event, payload: StartMediaJobPayload) => {
    return startMediaJob(payload, {
      onProgress: (progress) => event.sender.send("compression:progress", progress),
      onComplete: (complete) => event.sender.send("compression:complete", complete),
      onFailed: (failed) => event.sender.send("compression:failed", failed)
    });
  });

  ipcMain.handle("compression:cancel", async (_event, jobId: string) => cancelCompression(jobId));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  if (!isDev) {
    globalShortcut.register("F12", () => {});
    globalShortcut.register("CommandOrControl+Shift+I", () => {});
    globalShortcut.register("CommandOrControl+Shift+J", () => {});
    globalShortcut.register("CommandOrControl+Shift+C", () => {});
  }

  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
