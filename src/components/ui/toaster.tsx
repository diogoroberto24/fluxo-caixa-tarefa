"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { useAppStore } from "@/components/providers/app-store";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts } = useAppStore();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg",
            t.tone === "success" ? "border-success-line" : "border-danger-line",
          )}
        >
          {t.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          )}
          <span className="text-ink">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
