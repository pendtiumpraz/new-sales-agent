"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * AppDrawer — accessible right-side drawer (Coral Sunset, 400px).
 *
 * Drop-in replacement for the hand-rolled `DrawerShell`/`<aside>` shells used
 * across the rebuild pages (audit #5 / #37). Built on the Radix Dialog
 * primitive, so it gets for free:
 *   - role="dialog" + aria-modal + aria-labelledby (wired to the title)
 *   - focus trap, autofocus on open, focus-return to the trigger on close
 *   - uniform body scroll-lock
 *   - Esc-to-close and backdrop-click-to-close
 *
 * The visual design (right-side panel, overlay, slide animation, header/footer
 * chrome) is intentionally identical to the previous hand-rolled shells.
 *
 * API matches the old `DrawerShell`: { open, onClose, icon, title, subtitle,
 * footer, children }. `open && children` mounting is handled internally so
 * heavy form bodies don't render while the drawer is closed.
 */
export interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Drawer width. Defaults to the rebuild's 400px right panel. */
  widthClassName?: string;
  /** Optional extra classes for the panel. */
  className?: string;
}

export function AppDrawer({
  open,
  onClose,
  icon,
  title,
  subtitle,
  footer,
  children,
  widthClassName = "w-full max-w-[400px]",
  className,
}: AppDrawerProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            // Don't yank focus to the close button / first field by default —
            // let Radix focus the panel; pages that need a specific autofocus
            // can pass an autoFocus prop on their input.
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full flex-col border-l border-border bg-card shadow-soft outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:duration-300 data-[state=open]:duration-300",
            widthClassName,
            className,
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              {icon != null && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {icon}
                </span>
              )}
              <div className="min-w-0">
                <DialogPrimitive.Title className="truncate text-sm font-bold text-foreground">
                  {title}
                </DialogPrimitive.Title>
                {subtitle ? (
                  <DialogPrimitive.Description className="truncate text-[11px] text-muted-foreground">
                    {subtitle}
                  </DialogPrimitive.Description>
                ) : (
                  <DialogPrimitive.Description className="sr-only">
                    {title}
                  </DialogPrimitive.Description>
                )}
              </div>
            </div>
            <DialogPrimitive.Close
              aria-label="Tutup"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">{children}</div>
          {footer != null && (
            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-5 py-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * AppDrawerRaw — same accessible shell but without the built-in header/footer
 * chrome, for pages whose drawer body component already renders its own header
 * (e.g. enrichment's EnrichDrawer, escalations' DrawerBody, pipeline's
 * DealDrawer). Pass a `title` for the accessible name (visually hidden).
 */
export interface AppDrawerRawProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog (rendered visually-hidden). */
  title: string;
  children: React.ReactNode;
  widthClassName?: string;
  className?: string;
}

export function AppDrawerRaw({
  open,
  onClose,
  title,
  children,
  widthClassName = "w-full max-w-[400px]",
  className,
}: AppDrawerRawProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full flex-col border-l border-border bg-card shadow-soft outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:duration-300 data-[state=open]:duration-300",
            widthClassName,
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
