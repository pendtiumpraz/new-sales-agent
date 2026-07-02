"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SimpleMarkdown } from "@/components/shared/simple-markdown";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Slide deck viewer for the slide-structured pitch decks (PITCH_TECH/PITCH_BIZ).
//
// Parse rule: split the markdown on lines matching /^##\s+/ (fence-aware, so a
// "##" inside a ``` code block never starts a slide). Each such heading opens a
// new slide — its text is the slide TITLE, and every line up to the next "##"
// heading is the slide BODY. The top-level "#" doc title and any preamble before
// the first "##" are ignored.
//
// Controls: one slide at a time in a 16:9 card, Prev/Next + ArrowLeft/ArrowRight,
// an "N / M" counter, a slide-strip of dots, native Fullscreen, and best-effort
// ".pptx" export (pptxgenjs, lazy-imported in the click handler). Coral Sunset.
// ─────────────────────────────────────────────────────────────────────────────

const BRAND_CORAL = "FB5E3B"; // brand coral for pptx titles (dark-on-light deck)

export interface ParsedSlide {
  title: string;
  body: string;
}

const HR_RE = /^(---+|===+|\*\*\*+)\s*$/;

/** Split slide-structured markdown into { title, body } slides. Fence-aware. */
export function parseSlides(text: string): ParsedSlide[] {
  const lines = (text ?? "").split("\n");
  const slides: ParsedSlide[] = [];
  let cur: ParsedSlide | null = null;
  let fenced = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) fenced = !fenced;

    const m = !fenced ? /^##\s+(.*)$/.exec(line) : null;
    if (m) {
      cur = { title: m[1].trim(), body: "" };
      slides.push(cur);
      continue;
    }
    if (cur) cur.body += line + "\n";
    // lines before the first "##" (doc title / preamble) are dropped
  }

  // Trim leading/trailing blank lines and trailing "---" slide separators.
  for (const s of slides) {
    const b = s.body.split("\n");
    while (b.length && !b[0].trim()) b.shift();
    while (b.length && (!b[b.length - 1].trim() || HR_RE.test(b[b.length - 1].trim()))) b.pop();
    s.body = b.join("\n");
  }
  return slides;
}

// ── inline markdown → plain text (robust, for pptx runs) ──
function stripInline(s: string): string {
  return (s ?? "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1") // links → label
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/^\s*>\s?/, "") // blockquote marker
    .trim();
}

function tableCells(row: string): string[] {
  return row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

// ── body → ordered pptx blocks (text-runs vs. tables), best-effort ──
type PptBlock =
  | { kind: "text"; runs: { text: string; options: Record<string, unknown> }[] }
  | { kind: "table"; rows: string[][] };

function bodyToBlocks(body: string): PptBlock[] {
  const lines = (body ?? "").split("\n");
  const blocks: PptBlock[] = [];
  let textRuns: { text: string; options: Record<string, unknown> }[] = [];
  let fenced = false;

  const flushText = () => {
    if (textRuns.length) blocks.push({ kind: "text", runs: textRuns });
    textRuns = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw ?? "";

    // fenced code → keep verbatim as monospace-ish text lines
    if (line.trimStart().startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      textRuns.push({ text: line, options: { breakLine: true, fontFace: "Consolas", fontSize: 11 } });
      continue;
    }

    // GFM table → its own block
    if (line.trim().startsWith("|") && line.includes("|")) {
      flushText();
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i]);
        i++;
      }
      i--; // step back; loop will ++ again
      const isSep = (r: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(r);
      const parsed = rows.filter((r) => !isSep(r)).map((r) => tableCells(r).map(stripInline));
      if (parsed.length) blocks.push({ kind: "table", rows: parsed });
      continue;
    }

    if (!line.trim()) continue; // blank

    // bullet (- / *), possibly nested by indentation
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const indentLevel = Math.min(3, Math.floor(bullet[1].replace(/\t/g, "  ").length / 2));
      textRuns.push({
        text: stripInline(bullet[2]),
        options: { bullet: true, indentLevel, breakLine: true },
      });
      continue;
    }

    // ordered list item → bullet too (numbered)
    const ol = /^(\s*)\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      textRuns.push({
        text: stripInline(ol[2]),
        options: { bullet: { characterCode: "2022" }, breakLine: true },
      });
      continue;
    }

    // heading inside a slide body (### …) → bold line
    const h = /^#{3,}\s+(.*)$/.exec(line);
    if (h) {
      textRuns.push({ text: stripInline(h[1]), options: { bold: true, breakLine: true } });
      continue;
    }

    // plain paragraph line
    textRuns.push({ text: stripInline(line), options: { breakLine: true } });
  }

  flushText();
  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────

export function SlideDeck({ text, title }: { text: string; title?: string }) {
  const slides = useMemo(() => parseSlides(text), [text]);
  const [idx, setIdx] = useState(0);
  const [isFs, setIsFs] = useState(false);
  const [exporting, setExporting] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);

  const count = slides.length;
  const cur = slides[Math.min(idx, Math.max(0, count - 1))];

  // clamp when the deck changes
  useEffect(() => {
    setIdx((n) => Math.min(n, Math.max(0, count - 1)));
  }, [count]);

  const go = useCallback(
    (delta: number) => setIdx((n) => Math.max(0, Math.min(count - 1, n + delta))),
    [count],
  );

  // keyboard nav (works in fullscreen too — window-level listener)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // fullscreen button state
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void deckRef.current?.requestFullscreen?.();
    }
  }, []);

  const exportPptx = useCallback(async () => {
    if (!count) return;
    setExporting(true);
    try {
      // lazy-import so the heavy lib stays out of the initial bundle + never SSRs
      const mod = await import("pptxgenjs");
      const PptxGenJS = (mod as any).default ?? mod;
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE"; // built-in 13.33 × 7.5in — readable, presenter-ready

      for (const s of slides) {
        const slide = pptx.addSlide();
        slide.background = { color: "FFFFFF" };
        try {
          // title (brand coral)
          slide.addText(s.title || "Slide", {
            x: 0.6,
            y: 0.35,
            w: 12.1,
            h: 0.9,
            fontSize: 26,
            bold: true,
            color: BRAND_CORAL,
            fontFace: "Arial",
            valign: "middle",
          });
          // accent rule under the title
          slide.addShape("line", {
            x: 0.6,
            y: 1.28,
            w: 12.1,
            h: 0,
            line: { color: BRAND_CORAL, width: 1.5 },
          });

          const blocks = bodyToBlocks(s.body);
          let y = 1.5;
          for (const blk of blocks) {
            if (blk.kind === "text") {
              const h = Math.max(0.4, Math.min(5.6, blk.runs.length * 0.36));
              slide.addText(blk.runs as any, {
                x: 0.6,
                y,
                w: 12.1,
                h,
                fontSize: 15,
                color: "1F2937",
                fontFace: "Arial",
                valign: "top",
                autoFit: true,
              });
              y += h + 0.15;
            } else {
              const rows = blk.rows.map((r, ri) =>
                r.map((c) => ({
                  text: c,
                  options: {
                    bold: ri === 0,
                    color: ri === 0 ? "FFFFFF" : "1F2937",
                    fill: { color: ri === 0 ? BRAND_CORAL : "FFF3EF" },
                    align: "left" as const,
                  },
                })),
              );
              const h = Math.max(0.4, rows.length * 0.35);
              slide.addTable(rows as any, {
                x: 0.6,
                y,
                w: 12.1,
                fontSize: 12,
                fontFace: "Arial",
                border: { type: "solid", pt: 1, color: "F2C9BD" },
                valign: "top",
              });
              y += h + 0.25;
            }
          }
        } catch {
          // any weird slide → dump its raw text, never throw
          slide.addText(s.body || s.title || "", {
            x: 0.6,
            y: 1.5,
            w: 12.1,
            h: 5.4,
            fontSize: 13,
            color: "1F2937",
            valign: "top",
          });
        }
      }

      const fileName = `${(title || "Pitch Deck").replace(/[^\w.-]+/g, "_")}.pptx`;
      await pptx.writeFile({ fileName });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("pptx export failed", err);
    } finally {
      setExporting(false);
    }
  }, [slides, count, title]);

  if (!count) {
    return <p className="p-6 text-sm text-muted-foreground">Tidak ada slide untuk ditampilkan.</p>;
  }

  return (
    <div
      ref={deckRef}
      className={cn(
        "flex flex-col gap-3",
        isFs && "h-screen w-screen justify-center bg-background p-6",
      )}
    >
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{title ?? "Slide deck"}</span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {idx + 1} / {count}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={exportPptx}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            {exporting ? "Menyiapkan…" : "Export .pptx"}
          </button>
          <button
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            {isFs ? "Keluar layar penuh" : "Layar penuh"}
          </button>
        </div>
      </div>

      {/* 16:9 slide card */}
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl border border-border bg-card shadow-soft",
          isFs ? "flex-1" : "aspect-video",
        )}
      >
        {/* coral top accent */}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-primary" />
        <div className="flex h-full flex-col p-6 sm:p-8">
          <h2 className="shrink-0 border-b border-border pb-3 text-xl font-bold text-primary sm:text-2xl">
            {cur.title}
          </h2>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
            <SimpleMarkdown text={cur.body} />
          </div>
        </div>
      </div>

      {/* nav + dots */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-40"
        >
          ← Sebelumnya
        </button>

        <div className="mx-auto flex flex-wrap items-center justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              title={`${i + 1}. ${s.title}`}
              aria-label={`Slide ${i + 1}: ${s.title}`}
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-all",
                i === idx ? "w-5 bg-primary" : "bg-border hover:bg-muted-foreground/40",
              )}
            />
          ))}
        </div>

        <button
          onClick={() => go(1)}
          disabled={idx === count - 1}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-40"
        >
          Berikutnya →
        </button>
      </div>
    </div>
  );
}
