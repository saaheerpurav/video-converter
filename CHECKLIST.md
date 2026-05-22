# Video Converter Checklist

## Milestone 1: Video Compression

- [x] Create Electron + React + TypeScript + Tailwind project structure
- [x] Add secure Electron main/preload separation
- [x] Use system FFmpeg and FFprobe from PATH
- [x] Add file picker and drag-and-drop intake
- [x] Analyze selected videos with FFprobe
- [x] Show original size, duration, codec, and dimensions
- [x] Add compression presets: High Quality, Balanced, Small Size
- [x] Add H.264 and H.265 software encoding
- [x] Add optional GPU encoder selection: Auto, NVENC, QuickSync, AMF
- [x] Parse FFmpeg progress in realtime
- [x] Show elapsed time, output size, and compression percentage after completion
- [x] Support multiple queued files processed sequentially
- [x] Support cancel current job and remove queued items
- [x] Remember output folder and last compression settings locally
- [x] Add open output folder action

## Milestone 2: Media Conversion

- [x] Add output format dropdown for conversion mode
- [x] Support mp4 <-> mov
- [x] Support mp4 <-> mkv
- [x] Support mov <-> mkv
- [x] Support webm -> mp4
- [x] Support avi -> mp4
- [x] Support mp4/mov -> mp3
- [x] Support wav <-> mp3
- [x] Support flac <-> mp3
- [x] Add conversion-specific queue handling
- [x] Add conversion output naming rules

## Milestone 3: Audio Extraction

- [x] Add audio extraction mode
- [x] Export audio as mp3
- [x] Export audio as wav
- [x] Export audio as aac
- [x] Add audio extraction progress and output summary

## Milestone 4: Packaging And Polish

- [x] Improve GPU capability reporting per platform
- [x] Add production packaging validation on Windows
- [x] Add macOS packaging config validation
- [x] Add app icons
- [x] Add final UX pass after all workflows are implemented
