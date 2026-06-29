"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/utils";

/**
 * ConfirmDialog — accessible centered confirm/restore dialog (audit #5 / #37).
 *
 * Drop-in replacement for the per-page hand-rolled `ConfirmModal`s. Built on the
 * Radix Dialog primitive, so it gets role="dialog" + aria-modal +
 * aria-labelledby, focus trap, autofocus, focus-return, scroll-lock, and
 * Esc-to-close for free (the old shells had none of these and only closed on
 * backdrop click).
 *
 * The prop surface is the *superset* of the two conventions that existed in the
 * rebuild so it is a literal drop-in for every page:
 *   - close handler: `onClose` (most pages) OR `onCancel` (pipeline)
 *   - pending flag:  `confirmPending` (most pages) OR `confirmDisabled` (pipeline)
 * `confirmLabel` may already contain its own pending text (pipeline passes
 * "Memproses…" itself); when `confirmPending` is used we fall back to the old
 * "Memproses…" label like the original shells.
 */
export interface ConfirmDialogProps {
  open: boolean;
  icon: React.ReactNode;
  tone: "destructive" | "tertiary";
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  /** Close handler — accepts either spelling. */
  onClose?: () => void;
  onCancel?: () => void;
  /** Pending flag — accepts either spelling. */
  confirmPending?: boolean;
  confirmDisabled?: boolean;
}

export function ConfirmDialog({
  open,
  icon,
  tone,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  onCancel,
  confirmPending,
  confirmDisabled,
}: ConfirmDialogProps) {
  const close = onClose ?? onCancel ?? (() => {});
  // When the caller drives the label itself (confirmDisabled convention), don't
  // override it. When it uses the confirmPending convention, mirror the old
  // "Memproses…" swap so the visual is identical.
  const pending = confirmPending ?? false;
  const disabled = confirmDisabled ?? confirmPending ?? false;
  const label = confirmPending !== undefined && pending ? "Memproses…" : confirmLabel;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-foreground/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-[60] w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-lg border border-border bg-card p-5 shadow-soft outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                tone === "destructive"
                  ? "bg-destructive/[0.12] text-destructive"
                  : "bg-tertiary/[0.12] text-tertiary",
              )}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-sm font-bold">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted-foreground">
                {body}
              </DialogPrimitive.Description>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <DialogPrimitive.Close className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Batal
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={disabled}
              className={cn(
                "h-9 rounded-lg px-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tone === "destructive"
                  ? "bg-destructive text-white"
                  : "bg-tertiary text-tertiary-foreground",
              )}
            >
              {label}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
