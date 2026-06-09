"use client";

import React from "react";
import { AlertOctagon } from "lucide-react";

/**
 * Tiny class-based error boundary around each workspace right-rail card so
 * one card throwing doesn't blow up the whole page — and we get a clear
 * inline label showing which card failed.
 *
 * Class component because React error boundaries can't be functional.
 */
export class CardErrorBoundary extends React.Component<
  { name: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error(`[workspace card "${this.props.name}"] threw:`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-destructive">
            <AlertOctagon className="h-3.5 w-3.5" />
            {this.props.name} gagal dimuat
          </div>
          <p className="font-mono text-[10px] leading-snug text-destructive/90">
            {this.state.error.name}: {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
