"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Globe,
  Plus,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";

import { ChannelDot } from "@/components/shared/channel-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { TempBadge } from "@/components/shared/temp-badge";
import { ProspectSheet } from "@/components/prospecting/prospect-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProspectingStore } from "@/lib/stores/prospecting-store";
import { channelMeta } from "@/lib/utils/channel-config";
import { cn } from "@/lib/utils";
import type { AiTemp, ProspectLead } from "@/lib/types";
import { toast } from "sonner";

const TEMP_FILTERS: { key: "all" | AiTemp; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "panas", label: "Panas" },
  { key: "hangat", label: "Hangat" },
  { key: "dingin", label: "Dingin" },
];

const SOURCE_LABEL: Record<string, string> = {
  website: "Website",
  form: "Form",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  marketplace: "Marketplace",
};

/**
 * Lead discovery panel — embedded inside the Contacts page as the
 * "Penemuan Lead" tab. Equivalent to the legacy /prospecting page body, minus
 * the page-level PageHeader (the Contacts page owns that now).
 */
export function ProspectingPanel({ embedded = false }: { embedded?: boolean }) {
  const prospects = useProspectingStore((s) => s.prospects);
  const inbound = useProspectingStore((s) => s.inbound);
  const crawl = useProspectingStore((s) => s.crawl);
  const enrich = useProspectingStore((s) => s.enrich);
  const enrichMany = useProspectingStore((s) => s.enrichMany);
  const addManyToCrm = useProspectingStore((s) => s.addManyToCrm);
  const replyInbound = useProspectingStore((s) => s.replyInbound);
  const routeInbound = useProspectingStore((s) => s.routeInbound);

  const [search, setSearch] = useState("");
  const [temp, setTemp] = useState<"all" | AiTemp>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ProspectLead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = prospects;
    if (temp !== "all") list = list.filter((p) => p.aiTemp === temp);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.company.toLowerCase().includes(q) ||
          p.industry.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => b.aiScore - a.aiScore);
  }, [prospects, temp, search]);

  const stats = useMemo(() => {
    return {
      total: prospects.length,
      hot: prospects.filter((p) => p.aiTemp === "panas").length,
      unenriched: prospects.filter((p) => !p.enriched).length,
      inCrm: prospects.filter((p) => p.inCrm).length,
      newInbound: inbound.filter((i) => i.status === "baru").length,
    };
  }, [prospects, inbound]);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function open(p: ProspectLead) {
    setDetail(p);
    setSheetOpen(true);
  }

  return (
    <div className={cn("space-y-4", embedded ? "p-6 pt-4" : "p-6")}>
      {/* Inline crawl banner — coral/teal gradient strip */}
      <div className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/8 via-tertiary/8 to-transparent px-4 py-3">
        <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-primary/15 blur-2xl" />
        <div className="relative flex items-center gap-2 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-tertiary text-tertiary-foreground">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium text-foreground">
            Temukan, perkaya, dan skor lead baru
          </span>
          <span className="hidden text-muted-foreground sm:inline">
            — lalu kirim ke outbound.
          </span>
        </div>
        <Button
          className="relative"
          onClick={() => {
            const n = 6 + Math.floor(Math.random() * 7); // 6–12
            crawl(n);
            toast.success(`Crawl selesai — ${n} prospek baru ditemukan dari LinkedIn & web.`);
          }}
        >
          <Globe className="h-4 w-4" />
          Crawl prospek baru
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total prospek" value={stats.total} />
        <Stat label="Lead panas" value={stats.hot} tone="hot" />
        <Stat label="Belum diperkaya" value={stats.unenriched} tone="warn" />
        <Stat label="Masuk CRM" value={stats.inCrm} tone="ok" />
        <Stat label="Inbound baru" value={stats.newInbound} tone="accent" />
      </div>

      <Tabs defaultValue="discover">
        <TabsList>
          <TabsTrigger value="discover">Temukan</TabsTrigger>
          <TabsTrigger value="inbound">Inbound ({stats.newInbound})</TabsTrigger>
        </TabsList>

        {/* ── Discover ─────────────────────────────────────────────── */}
        <TabsContent value="discover" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, perusahaan, industri..."
                className="pl-8"
              />
            </div>
            {TEMP_FILTERS.map((f) => {
              const isActive = temp === f.key;
              // Color per temperature when active.
              const activeCls =
                f.key === "panas"
                  ? "border-primary bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_rgba(251,94,59,0.55)]"
                  : f.key === "hangat"
                    ? "border-warning bg-warning text-white shadow-[0_4px_12px_-4px_rgba(245,158,11,0.55)]"
                    : f.key === "dingin"
                      ? "border-sky-400 bg-sky-500 text-white shadow-[0_4px_12px_-4px_rgba(14,165,233,0.55)]"
                      : "border-tertiary bg-tertiary text-tertiary-foreground shadow-[0_4px_12px_-4px_rgba(20,184,166,0.55)]";
              const idleCls =
                f.key === "panas"
                  ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                  : f.key === "hangat"
                    ? "border-warning/30 bg-warning/8 text-amber-700 hover:bg-warning/15"
                    : f.key === "dingin"
                      ? "border-sky-300/40 bg-sky-50 text-sky-700 hover:bg-sky-100"
                      : "border-border bg-card text-muted-foreground hover:text-foreground";
              return (
                <button
                  key={f.key}
                  onClick={() => setTemp(f.key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                    isActive ? activeCls : idleCls,
                  )}
                >
                  {f.label}
                </button>
              );
            })}
            <span className="ml-auto text-sm text-muted-foreground">
              {filtered.length} prospek
            </span>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-tertiary/5 px-4 py-2.5 text-sm shadow-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                <Sparkles className="h-3 w-3" />
                {selected.size} dipilih
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => { enrichMany(Array.from(selected)); toast.success(`${selected.size} prospek diperkaya.`); }}
                >
                  <Wand2 className="h-4 w-4" />
                  Perkaya
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-tertiary/30 bg-tertiary/5 text-tertiary hover:bg-tertiary/10 hover:text-tertiary"
                  onClick={() => { addManyToCrm(Array.from(selected)); toast.success(`${selected.size} prospek ditambahkan ke CRM.`); setSelected(new Set()); }}
                >
                  <Plus className="h-4 w-4" />
                  Ke CRM
                </Button>
                <Button size="sm" onClick={() => { toast.success(`${selected.size} prospek didaftarkan ke cadence outbound.`); setSelected(new Set()); }}>
                  <Sparkles className="h-4 w-4" />
                  Ke cadence
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Prospek</TableHead>
                  <TableHead>Perusahaan</TableHead>
                  <TableHead>Skor AI</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Sumber</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 40).map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer transition-colors even:bg-muted/30 hover:bg-primary/[0.06]"
                    onClick={() => open(p)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={p.name} color={p.avatarColor} className="h-8 w-8 text-[11px]" />
                        <div className="min-w-0">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.title}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{p.company}</p>
                      <p className="text-xs text-muted-foreground">{p.industry} · {p.city}</p>
                    </TableCell>
                    <TableCell>
                      <TempBadge score={p.aiScore} temp={p.aiTemp} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {p.enriched ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <Check className="h-3.5 w-3.5" />
                          Terverifikasi
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
                          onClick={() => { enrich(p.id); toast.success(`Data ${p.name} diperkaya.`); }}
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          Perkaya
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <SourcePill source={p.source} />
                    </TableCell>
                    <TableCell>
                      {p.inCrm ? (
                        <Badge variant="success">Di CRM</Badge>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => open(p)}>
                          Lihat
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Inbound ──────────────────────────────────────────────── */}
        <TabsContent value="inbound" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Lead masuk dari website, form, WhatsApp, Instagram, dan marketplace — diskor & dirutekan otomatis oleh AI.
          </p>
          {inbound.map((lead) => {
            const cm = channelMeta(lead.channel);
            return (
            <Card
              key={lead.id}
              className="overflow-hidden border-l-4 transition-shadow hover:shadow-md"
              style={{ borderLeftColor: cm.color }}
            >
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <UserAvatar name={lead.name} color={lead.avatarColor} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{lead.name}</span>
                    <span className="text-xs text-muted-foreground">{lead.company}</span>
                    <Badge variant="muted" className="gap-1">
                      <ChannelDot channel={lead.channel} size={7} />
                      {SOURCE_LABEL[lead.source]}
                    </Badge>
                    <TempBadge score={lead.aiScore} temp={lead.aiTemp} />
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    &ldquo;{lead.message}&rdquo;
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-tertiary">
                    <Sparkles className="h-3 w-3" />
                    Saran AI: {lead.suggestedAction}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {lead.status === "baru" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => { routeInbound(lead.id); toast.success(`${lead.name} dialihkan ke tim terkait.`); }}>
                        Alihkan
                      </Button>
                      <Button size="sm" onClick={() => { replyInbound(lead.id); toast.success(`Balasan AI terkirim ke ${lead.name}.`); }}>
                        <Wand2 className="h-4 w-4" />
                        Balas dengan AI
                      </Button>
                    </>
                  ) : (
                    <Badge variant={lead.status === "dibalas" ? "success" : "secondary"}>
                      {lead.status === "dibalas" ? "Dibalas AI" : "Dialihkan"}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <ProspectSheet prospect={detail} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

// Source pill — colored by common discovery source.
function SourcePill({ source }: { source: string }) {
  const s = source.toLowerCase();
  const palette = s.includes("linkedin")
    ? { bg: "bg-[#0A66C2]/10", text: "text-[#0A66C2]", dot: "bg-[#0A66C2]" }
    : s.includes("instagram") || s.includes("ig")
      ? { bg: "bg-[#E1306C]/10", text: "text-[#E1306C]", dot: "bg-[#E1306C]" }
      : s.includes("whatsapp") || s.includes("wa")
        ? { bg: "bg-[#25D366]/10", text: "text-emerald-700", dot: "bg-[#25D366]" }
        : s.includes("tokopedia")
          ? { bg: "bg-[#03AC0E]/10", text: "text-emerald-700", dot: "bg-[#03AC0E]" }
          : s.includes("shopee")
            ? { bg: "bg-[#EE4D2D]/10", text: "text-[#EE4D2D]", dot: "bg-[#EE4D2D]" }
            : s.includes("web") || s.includes("crawl")
              ? { bg: "bg-tertiary/10", text: "text-tertiary", dot: "bg-tertiary" }
              : s.includes("form")
                ? { bg: "bg-warning/15", text: "text-amber-700", dot: "bg-warning" }
                : s.includes("event")
                  ? { bg: "bg-primary/10", text: "text-primary", dot: "bg-primary" }
                  : { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground/50" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        palette.bg,
        palette.text,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", palette.dot)} />
      {source}
    </span>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "hot" | "warn" | "ok" | "accent";
}) {
  const palette = {
    default: {
      text: "text-foreground",
      grad: "from-muted/40 via-card to-card",
      border: "border-border",
      bar: "bg-foreground/30",
    },
    hot: {
      text: "text-primary",
      grad: "from-primary/15 via-primary/5 to-card",
      border: "border-primary/25",
      bar: "bg-gradient-to-r from-primary to-rose-500",
    },
    warn: {
      text: "text-amber-700",
      grad: "from-warning/20 via-warning/5 to-card",
      border: "border-warning/25",
      bar: "bg-gradient-to-r from-amber-400 to-warning",
    },
    ok: {
      text: "text-emerald-700",
      grad: "from-success/15 via-success/5 to-card",
      border: "border-success/25",
      bar: "bg-gradient-to-r from-emerald-400 to-success",
    },
    accent: {
      text: "text-tertiary",
      grad: "from-tertiary/15 via-tertiary/5 to-card",
      border: "border-tertiary/25",
      bar: "bg-gradient-to-r from-tertiary to-cyan-500",
    },
  }[tone];
  return (
    <Card className={cn("relative overflow-hidden border", palette.border)}>
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", palette.grad)} />
      <CardContent className="relative p-4">
        <p className={cn("text-2xl font-semibold tnum", palette.text)}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        <div className={cn("mt-2 h-1 w-10 rounded-full", palette.bar)} />
      </CardContent>
    </Card>
  );
}
