import { useState, type DragEvent } from "react";
import { electronApi } from "../services/electronApi";

type DropZoneProps = {
  onBrowse: () => Promise<void>;
  onPaths: (paths: string[]) => Promise<void>;
  isLoading: boolean;
};

export function DropZone({ onBrowse, onPaths, isLoading }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const paths = Array.from(event.dataTransfer.files)
      .map((file) => electronApi.getPathForFile(file))
      .filter(Boolean);

    await onPaths(paths);
  };

  return (
    <div
      className={`rounded-xl border p-4 transition ${
        isDragging
          ? "border-amber-500 bg-amber-950/30"
          : "border-stone-800 bg-stone-950/80 hover:border-amber-700"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div>
        <h2 className="text-base font-semibold text-white">Add media</h2>
        <p className="mt-1 text-sm leading-5 text-stone-400">Drop files here or choose video/audio files for the selected task.</p>
        <button className="btn-primary mt-4 w-full" onClick={onBrowse} disabled={isLoading}>
          {isLoading ? "Reading files..." : "Choose Files"}
        </button>
      </div>
    </div>
  );
}
