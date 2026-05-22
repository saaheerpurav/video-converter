# Video Converter

A lightweight offline desktop app for compressing videos, converting media formats, and extracting audio.

Built with Electron, React, TypeScript, TailwindCSS, Node.js, FFmpeg, and FFprobe.

## Features

- Video compression with High Quality, Balanced, and Small Size presets.
- H.264 and H.265 compression support.
- Optional hardware encoder selection for NVENC, QuickSync, and AMF when available.
- Media conversion for common video and audio formats.
- Audio extraction from video to MP3, WAV, or AAC.
- Batch queue with sequential processing.
- Cancel current job and remove queued items.
- Real-time progress, elapsed time, ETA, and completion status.
- Output folder selection and open output folder action.
- Local settings persistence.
- Secure Electron IPC with main/preload separation.

## Supported Workflows

### Compression

- Input: MP4, MOV, MKV, WEBM, AVI
- Output: MP4
- Presets: High Quality, Balanced, Small Size

### Conversion

- MP4 to MOV, MKV, MP3
- MOV to MP4, MKV, MP3
- MKV to MP4, MOV
- WEBM to MP4
- AVI to MP4
- WAV to MP3
- MP3 to WAV, FLAC
- FLAC to MP3

### Audio Extraction

- Video to MP3
- Video to WAV
- Video to AAC

## Requirements

- Node.js
- npm
- FFmpeg and FFprobe installed and available on PATH

Check FFmpeg:

```powershell
ffmpeg -version
ffprobe -version
```

## Development

Install dependencies:

```powershell
npm install
```

Start the app in development mode:

```powershell
npm run dev
```

Development mode keeps DevTools available.

## Build

Run type checks:

```powershell
npm run typecheck
```

Build Electron and renderer output:

```powershell
npm run build
```

## Packaging

Build the Windows installer:

```powershell
npm run package:win
```

Installer output:

```text
release/Video Converter-0.1.0-win-x64.exe
```

Validate macOS packaging config:

```powershell
npm run package:mac:config
```

Build the macOS package on macOS:

```powershell
npm run package:mac
```

## Production Notes

- The production app has no default Electron menu bar.
- DevTools are disabled in production.
- The app uses the system FFmpeg and FFprobe from PATH.
- Bundled FFmpeg fallback is intentionally not included.
- The Windows installer may show Unknown Publisher unless signed with a trusted certificate.

## Project Structure

```text
electron/   Electron main, preload, FFmpeg services, settings
src/        React app, components, hooks, utilities, types
build/      App icons and packaging resources
scripts/    Local validation scripts
release/    Generated installer output, ignored by Git
```
