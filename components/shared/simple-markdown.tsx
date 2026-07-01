"use client";

import React from "react";

import { cn } from "@/lib/utils";

// A tiny, dependency-free, crash-proof markdown renderer for the docs viewer.
// Handles headings, bold, inline code, fenced code blocks (preserving ASCII
// diagrams), lists, GFM tables, blockquotes, hr, and links. Unknown syntax falls
// back to plain text — it never throws.

export function slugify(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// Pull h2/h3 headings for a table of contents (skips headings inside code fences).
export function extractHeadings(text: string): { level: number; text: string; id: string }[] {
  const out: { level: number; text: string; id: string }[] = [];
  let fenced = false;
  for (const line of (text ?? "").split("\n")) {
    if (line.trimStart().startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = /^(#{2,3})\s+(.*)$/.exec(line);
    if (m) {
      const t = m[2].trim();
      out.push({ level: m[1].length, text: t, id: slugify(t) });
    }
  }
  return out;
}

function inline(text: string, keyBase = 0): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = keyBase;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      parts.push(
        <code key={k++} className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**")) {
      parts.push(
        <strong key={k++} className="font-semibold text-foreground">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (mm) {
        parts.push(
          <a key={k++} href={mm[2]} className="text-primary underline">
            {mm[1]}
          </a>,
        );
      } else parts.push(tok);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function tableCells(row: string): string[] {
  return row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

export function SimpleMarkdown({ text, className }: { text: string; className?: string }) {
  const lines = (text ?? "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (line.trimStart().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push(
        <pre
          key={key++}
          className="my-3 overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 text-[11px] leading-snug"
        >
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // GFM table
    if (line.trim().startsWith("|") && line.includes("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i]);
        i++;
      }
      const header = tableCells(rows[0]);
      const isSep = (r: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(r);
      const body = rows.slice(1).filter((r) => !isSep(r)).map(tableCells);
      blocks.push(
        <div key={key++} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {header.map((h, j) => (
                  <th key={j} className="border border-border bg-muted px-2 py-1 text-left font-semibold">
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border border-border px-2 py-1 align-top">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? "mt-5 text-lg font-bold first:mt-0"
          : level === 2
            ? "mt-6 border-b border-border pb-1 text-base font-bold"
            : level === 3
              ? "mt-4 text-sm font-semibold"
              : "mt-3 text-sm font-semibold";
      blocks.push(
        <div key={key++} id={slugify(h[2])} className={cn("scroll-mt-4", cls)}>
          {inline(h[2])}
        </div>,
      );
      i++;
      continue;
    }

    // hr
    if (/^(---+|===+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-4 border-border" />);
      i++;
      continue;
    }

    // blockquote
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key++} className="my-3 border-l-2 border-primary/40 pl-3 text-muted-foreground">
          {inline(buf.join(" "))}
        </blockquote>,
      );
      continue;
    }

    // list
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      const listCls = cn("my-2 pl-5", ordered ? "list-decimal" : "list-disc");
      blocks.push(
        ordered ? (
          <ol key={key++} className={listCls}>
            {items.map((it, j) => (
              <li key={j} className="my-0.5">
                {inline(it)}
              </li>
            ))}
          </ol>
        ) : (
          <ul key={key++} className={listCls}>
            {items.map((it, j) => (
              <li key={j} className="my-0.5">
                {inline(it)}
              </li>
            ))}
          </ul>
        ),
      );
      continue;
    }

    // blank
    if (!line.trim()) {
      i++;
      continue;
    }

    // paragraph
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|\||>|\s*[-*]\s|\s*\d+\.\s|---)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-2">
        {inline(buf.join(" "))}
      </p>,
    );
  }

  return <div className={cn("text-[13px] leading-relaxed text-foreground/90", className)}>{blocks}</div>;
}
