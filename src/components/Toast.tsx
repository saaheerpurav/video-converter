type ToastState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

type ToastProps = {
  toast: ToastState;
  onClose: () => void;
};

export function Toast({ toast, onClose }: ToastProps) {
  if (!toast) {
    return null;
  }

  const tone = {
    success: "border-emerald-800 bg-emerald-950 text-emerald-100",
    error: "border-red-800 bg-red-950 text-red-100",
    info: "border-amber-800 bg-amber-950 text-amber-100"
  }[toast.type];

  return (
    <button
      className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-left text-sm shadow-lg ${tone}`}
      onClick={onClose}
    >
      {toast.message}
    </button>
  );
}
