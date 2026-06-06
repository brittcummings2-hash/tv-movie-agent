"use client";

import type { ToastMessage, ToastType } from "@/lib/types";

const toastClass: Record<ToastType, string> = {
  success: "toast toast-success",
  error: "toast toast-error",
  warning: "toast toast-warning",
  info: "toast toast-info",
};

export function ToastContainer({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={toastClass[t.type]}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function createToast(type: ToastType, message: string): ToastMessage {
  return { id: `${Date.now()}-${Math.random()}`, type, message };
}
