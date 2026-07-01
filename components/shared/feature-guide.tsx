"use client";

import * as React from "react";
import { BookOpen, HelpCircle, Lightbulb, ListOrdered, Route } from "lucide-react";

import { AppDrawer } from "@/components/shared/app-drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * FeatureGuide — a mandatory per-feature "Panduan" (tutorial) affordance.
 *
 * Renders a subtle book-icon "Panduan" button (meant to sit in a page header)
 * that opens a Coral Sunset right-drawer explaining, in Bahasa Indonesia:
 *   - Apa ini?     — what the feature does (1–2 sentences)
 *   - Cara pakai   — a numbered step list of the real flow on the page
 *   - Kaitan ke flow — how it fits the crawl → CRM → closing spine
 *   - Tips         — optional bullets
 *
 * Content lives centrally in `lib/feature-guides.ts` (FEATURE_GUIDES), so every
 * page just passes the right slug: `<FeatureGuide guide={FEATURE_GUIDES.xxx} />`.
 *
 * Accessibility comes for free from AppDrawer (Radix Dialog): role="dialog",
 * aria-labelledby, focus trap, Esc-to-close, backdrop-click-to-close.
 */
export interface Guide {
  title: string;
  tagline: string;
  what: string;
  steps: string[];
  flow: string;
  tips?: string[];
}

function GuideSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
        <span className="text-primary">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function FeatureGuide({
  guide,
  className,
}: {
  guide: Guide | undefined;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  // Defensive: never crash a page header if a slug is missing.
  if (!guide) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Panduan: ${guide.title}`}
        className={cn(
          "shrink-0 gap-1.5 text-muted-foreground hover:text-foreground",
          className,
        )}
      >
        <BookOpen className="h-4 w-4" />
        Panduan
      </Button>

      <AppDrawer
        open={open}
        onClose={() => setOpen(false)}
        icon={<BookOpen className="h-4 w-4" />}
        title={guide.title}
        subtitle={guide.tagline}
        widthClassName="w-full max-w-[440px]"
      >
        <div className="space-y-5 text-sm leading-relaxed">
          <GuideSection icon={<HelpCircle className="h-3.5 w-3.5" />} title="Apa ini?">
            <p className="text-foreground/80">{guide.what}</p>
          </GuideSection>

          <GuideSection icon={<ListOrdered className="h-3.5 w-3.5" />} title="Cara pakai">
            <ol className="space-y-2.5">
              {guide.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-foreground/80">{step}</span>
                </li>
              ))}
            </ol>
          </GuideSection>

          <GuideSection icon={<Route className="h-3.5 w-3.5" />} title="Kaitan ke flow">
            <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-[13px] text-muted-foreground">
              {guide.flow}
            </p>
          </GuideSection>

          {guide.tips && guide.tips.length > 0 && (
            <GuideSection icon={<Lightbulb className="h-3.5 w-3.5" />} title="Tips">
              <ul className="space-y-1.5">
                {guide.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-tertiary" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </GuideSection>
          )}
        </div>
      </AppDrawer>
    </>
  );
}
