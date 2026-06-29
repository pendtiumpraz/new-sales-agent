"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * PurgeDialog — accessible type-to-confirm destructive purge (audit #5 / #37).
 *
 * Replaces the per-page hand-rolled hard-delete modals. Built on Radix Dialog
 * (role="dialog" + aria-modal + aria-labelledby, focus trap, autofocus on the
 * confirm input, focus-return, scroll-lock, Esc-to-close).
 *
 * The confirm-text state is managed internally (the old shells leaked a
 * `purgeConfirm` useState into every page); it resets whenever the dialog
 * opens. `confirmPhrase` defaults to "HAPUS" but pages can pass a stricter
 * token (e.g. admin passes the tenant slug).
 */
export interface PurgeDialogProps {
  open: boolean;
  /** Name of the thing being purged (shown bold in the warning copy). */
  label: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Word the user must type to enable the purge button. Default "HAPUS". */
  confirmPhrase?: string;
  /** Whether matching is case-insensitive. Default true (HAPUS == hapus). */
  caseInsensitive?: boolean;
  /** Optional override of the warning body (defaults to the standard copy). */
  body?: React.ReactNode;
}

export function PurgeDialog({
  open,
  label,
  pending,
  onClose,
  onConfirm,
  confirmPhrase = "HAPUS",
  caseInsensitive = true,
  body,
}: PurgeDialogProps) {
  const [confirm, setConfirm] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // reset the typed phrase each time the dialog opens
  React.useEffect(() => {
    if (open) setConfirm("");
  }, [open]);

  const norm = (s: string) => {
    const t = s.trim();
    return caseInsensitive ? t.toUpperCase() : t;
  };
  const matches = norm(confirm) === norm(confirmPhrase);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-foreground/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            "fixed left-[50%] top-[50%] z-[60] w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-lg border border-destructive/30 bg-card p-5 shadow-soft outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/[0.12] text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-sm font-bold text-destructive">
                Hapus permanen?
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted-foreground">
                {body ?? (
                  <>
                    Tindakan ini <b>tidak bisa dibatalkan</b>.{" "}
                    <span className="font-medium text-foreground">{label}</span> akan dihapus
                    selamanya.
                  </>
                )}
              </DialogPrimitive.Description>
            </div>
          </div>
          <div className="mt-4">
            <label
              htmlFor="purge-confirm-input"
              className="mb-1.5 block text-[12px] text-muted-foreground"
            >
              Ketik{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-semibold text-foreground">
                {confirmPhrase}
              </code>{" "}
              untuk konfirmasi.
            </label>
            <input
              id="purge-confirm-input"
              ref={inputRef}
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={confirmPhrase}
              className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
            />
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <DialogPrimitive.Close className="h-9 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Batal
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || !matches}
              className="h-9 rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {pending ? "Menghapus…" : "Hapus permanen"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
