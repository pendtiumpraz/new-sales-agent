"use client";

// Discovery — Module 5 FRONTEND (Sainskerta Loop rebuild). GOAL-FIRST &
// channel-NEUTRAL, faithful to mockups/discovery.html (Coral Sunset). The target
// is a GRAPH — Perusahaan (nama · telp · email · domain · alamat · industri) →
// Orang di dalamnya (nama · jabatan · telp · email) — that can be filled from ANY
// channel; channels are just roads into the graph.
//
// Bands (top → bottom):
//   (1) GOAL banner — explains the Company→People graph (channel-neutral).
//   (2) Two entry cards:
//        A) "Cari berdasarkan target" (field/location/seniority) →
//           POST /api/discovery/plan → cross-channel DiscoveryPlan (modules/
//           enrichment/plan.ts — the NEW shape, NOT linkedinQueries-only).
//        B) "Tempel URL apa aja" — textarea → channel detected from the URL
//           (incl. a post-URL intent-mining hint) → POST /api/discovery (kind:url)
//           server-side crawl. Each scraped company becomes a result node.
//   (3) Cross-channel PLAN grid — one card per channel (LinkedIn incl. post/
//       komentar intent-mining, Google Maps, Google SERP/dork, Instagram,
//       Facebook, Shopee/Tokopedia/TikTok) with its queries/actions + an HONEST
//       Live/WIP badge (Live = ingest sink ready; WIP = browser scraper lands in
//       the extension phase — marked, never fake-checked).
//   (4) Results — the Company→People graph grouped by PT (phone/email at company
//       AND person level, channel/source per node) with checkbox →
//       "Simpan ke workspace" → POST /api/discovery/ingest (channel-agnostic graph
//       sink → CRM contacts with enrichment_status "none"). HONESTY: we never
//       fabricate people — the graph starts empty and fills from real scrapes/
//       the extension ingest, so the results band shows an awaiting state until
//       a real URL-scrape (or a future extension run) lands nodes.
//
// Every band has loading + empty + error states. Lives inside the Kontak cluster
// subnav (app/(app)/contacts/layout.tsx) — NO in-page tab bar here.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  Building2,
  ChevronDown,
  Copy,
  ExternalLink,
  Link2,
  Mail,
  Phone,
  Plug,
  Radar,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { cn } from "@/lib/utils";

// ── API envelope ({ ok, data } | { ok, error }) ──────────────────────────────
interface ApiOk<T> {
  ok: true;
  data: T;
}
interface ApiErr {
  ok: false;
  error: string;
  code?: string;
}
type ApiResult<T> = ApiOk<T> | ApiErr;

async function readJson<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => null)) as ApiResult<T> | null;
  if (!r.ok || !j || j.ok === false) {
    if (r.status === 403) throw new Error("forbidden");
    throw new Error((j && "error" in j && j.error) || "Permintaan gagal");
  }
  return j.data;
}

// ── cross-channel plan shape — mirrors modules/enrichment/plan.ts (the NEW shape) ──
interface DiscoveryCompany {
  name: string;
  why: string;
  domainGuess?: string;
}
interface LinkedInChannelPlan {
  searchQueries: string[];
  profileHints: string[];
  postSearch: string[];
}
interface GoogleMapsChannelPlan {
  queries: string[];
  categories: string[];
  areas: string[];
}
interface SearchChannelPlan {
  queries: string[];
  note: string;
}
interface MarketplaceChannelPlan {
  shopee: string[];
  tokopedia: string[];
  note: string;
}
interface DiscoveryPlan {
  field: string;
  location: string;
  roles: string[];
  industries: string[];
  companies: DiscoveryCompany[];
  keywords: string[];
  linkedin: LinkedInChannelPlan;
  googleMaps: GoogleMapsChannelPlan;
  googleDorks: string[];
  instagram: SearchChannelPlan;
  facebook: SearchChannelPlan;
  marketplace: MarketplaceChannelPlan;
  tiktok: SearchChannelPlan;
  note: string;
}

// ── channel-agnostic graph ingest shapes — mirror modules/enrichment/service.ts ──
interface IngestPersonRef {
  name?: string | null;
  domain?: string | null;
}
interface IngestPersonInput {
  fullName: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  location?: string | null;
  channelProfileUrl?: string | null;
  companyRef?: IngestPersonRef | null;
}
interface IngestCompanyInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  domain?: string | null;
  address?: string | null;
  industry?: string | null;
}
interface IngestGraphResult {
  companiesUpserted: number;
  peopleUpserted: number;
  jobId: string;
}

// ── the in-page Company→People graph (results) ───────────────────────────────
// One node per real scrape / extension ingest. People hang under their company.
// Each node carries its capture channel + source for provenance (mockup band 4).
interface PersonNode {
  id: string;
  fullName: string;
  title: string | null;
  channel: ChannelKey;
  channelLabel: string;
  profileHandle: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
}
interface CompanyNode {
  id: string;
  name: string;
  industry: string | null;
  domain: string | null;
  channel: ChannelKey;
  channelLabel: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  people: PersonNode[];
}

// ── channel registry (the "roads" — Live vs WIP is HONEST) ───────────────────
// Live = backend ingest sink + a working extraction path (URL crawl / future ext
// adapter). WIP = the per-channel browser scraper hasn't landed yet — flagged, not
// fake-checked. Colors match the mockup channel dots.
type ChannelKey =
  | "linkedin"
  | "google_maps"
  | "google"
  | "instagram"
  | "facebook"
  | "marketplace"
  | "tiktok"
  | "web";

const CHANNEL_DOT: Record<ChannelKey, string> = {
  linkedin: "#0A66C2",
  google_maps: "#34A853",
  google: "#EA4335",
  instagram: "#E1306C",
  facebook: "#1877F2",
  marketplace: "#EE4D2D",
  tiktok: "#010101",
  web: "#0D9488",
};
// ── per-URL channel detection (mockup band 2 — "channel dikenali otomatis") ───
interface UrlDetection {
  channel: ChannelKey;
  label: string;
  /** true when the URL is a POST/feed item → intent-mining (commenters/reactors). */
  isPost: boolean;
}

function detectChannel(rawUrl: string): UrlDetection | null {
  const u = rawUrl.trim();
  if (!u) return null;
  const host = u.replace(/^https?:\/\//i, "").toLowerCase();
  const isLinkedInPost = /linkedin\.com\/(posts|feed|pulse)\//i.test(u);
  if (host.includes("linkedin.com")) {
    return { channel: "linkedin", label: "LinkedIn", isPost: isLinkedInPost };
  }
  if (host.includes("google.") && (u.includes("/maps") || host.includes("maps.google")))
    return { channel: "google_maps", label: "Google Maps", isPost: false };
  if (host.includes("instagram.com"))
    return { channel: "instagram", label: "Instagram", isPost: /\/(p|reel)\//i.test(u) };
  if (host.includes("facebook.com") || host.includes("fb.com"))
    return { channel: "facebook", label: "Facebook", isPost: /\/(posts|permalink|story)/i.test(u) };
  if (host.includes("shopee.") || host.includes("tokopedia."))
    return { channel: "marketplace", label: host.includes("shopee.") ? "Shopee" : "Tokopedia", isPost: false };
  if (host.includes("tiktok.com"))
    return { channel: "tiktok", label: "TikTok", isPost: /\/video\//i.test(u) };
  if (host.includes("google."))
    return { channel: "google", label: "Google SERP", isPost: false };
  return { channel: "web", label: "Website", isPost: false };
}

// ── per-channel deep-link builders (open the query on the real platform) ─────
const linkedinSearchUrl = (q: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}&origin=GLOBAL_SEARCH_HEADER`;
const linkedinContentUrl = (q: string) =>
  `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(q)}`;
const googleUrl = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const mapsUrl = (q: string) => `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
const igUrl = (q: string) =>
  `https://www.instagram.com/explore/tags/${encodeURIComponent(q.replace(/[^a-zA-Z0-9]/g, ""))}/`;
const fbUrl = (q: string) => `https://www.facebook.com/search/top?q=${encodeURIComponent(q)}`;
const shopeeUrl = (q: string) => `https://shopee.co.id/search?keyword=${encodeURIComponent(q)}`;
const tokopediaUrl = (q: string) => `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(q)}`;
const tiktokUrl = (q: string) => `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`;

// A channel card in the cross-channel plan grid. `live` toggles solid vs dashed
// border + the Live/WIP badge. `queries` render as copyable rows; `linkFor`/`tag`
// are optional per-row.
interface PlanQuery {
  text: string;
  href?: string;
  tag?: string; // e.g. "niat" for an intent-mining row
  mono?: boolean; // render as code (dorks)
}
interface ChannelCard {
  key: ChannelKey;
  title: string;
  subtitle: string;
  live: boolean;
  queries: PlanQuery[];
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function DiscoveryPage() {
  const activeWs = useWorkspaceStore((s) => s.active);
  const workspaceId = activeWs?.id ?? null;

  // Extension last-seen → the honest "Belum terhubung / Terhubung" pill.
  const extQ = useQuery({
    queryKey: ["rep-account"],
    queryFn: async () => {
      const r = await fetch("/api/rep/account");
      if (!r.ok) return null;
      return (await r.json()) as { connected?: boolean; lastSeenAt?: string | null };
    },
    retry: false,
  });
  const extConnected = !!extQ.data?.connected;

  // ── (A) goal-first inputs ────────────────────────────────────────────────────
  const [field, setField] = useState("");
  const [location, setLocation] = useState("Indonesia");
  const [seniority, setSeniority] = useState("");

  const plan = useMutation({
    mutationFn: async () =>
      readJson<DiscoveryPlan>(
        await fetch("/api/discovery/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, location, seniority }),
        }),
      ),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyusun rencana"),
  });

  // ── (B) paste-URL inputs ─────────────────────────────────────────────────────
  const [urls, setUrls] = useState("");
  // The FIRST non-empty URL drives the detection hint banner.
  const firstUrl = useMemo(() => urls.split("\n").map((u) => u.trim()).find(Boolean) ?? "", [urls]);
  const detection = useMemo(() => detectChannel(firstUrl), [firstUrl]);

  // ── results graph (real nodes only — never fabricated) ───────────────────────
  const [companies, setCompanies] = useState<CompanyNode[]>([]);
  // Selection: company ids + person ids that are checked for "Simpan ke workspace".
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());

  const totalPeople = useMemo(
    () => companies.reduce((n, c) => n + c.people.length, 0),
    [companies],
  );
  const selectedCount = selectedCompanies.size + selectedPeople.size;

  function toggleCompany(co: CompanyNode) {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(co.id)) next.delete(co.id);
      else next.add(co.id);
      return next;
    });
    // Selecting/clearing a company cascades to its people (a graph edge).
    setSelectedPeople((prev) => {
      const next = new Set(prev);
      const turningOn = !selectedCompanies.has(co.id);
      for (const p of co.people) {
        if (turningOn) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  }
  function togglePerson(p: PersonNode) {
    setSelectedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  }

  // ── (B) URL scrape → /api/discovery (kind:url). Each scraped company becomes a
  // real result node we can then save to the workspace. Channel is detected from
  // the URL (channel-neutral). NOTE: server-side crawl extracts company-level
  // contacts from public pages; people come from the extension/ingest path.
  const scrape = useMutation({
    mutationFn: async (url: string) => {
      const u = url.startsWith("http") ? url : `https://${url}`;
      const det = detectChannel(u);
      const r = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "url", url: u, ...(workspaceId ? { workspaceId } : {}) }),
      });
      const j = (await r.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            result?: {
              name?: string;
              domain?: string | null;
              emails?: number;
              phones?: number;
              contactsCreated?: number;
            } | null;
          }
        | null;
      if (!r.ok || !j || j.ok === false) throw new Error(j?.error || "Gagal scrape URL");
      return { detection: det, result: j.result ?? null, url: u };
    },
    onSuccess: ({ detection: det, result, url }) => {
      const channel: ChannelKey = det?.channel ?? "web";
      const label = det?.label ?? "Website";
      const name = result?.name || result?.domain || url.replace(/^https?:\/\//, "");
      const node: CompanyNode = {
        id: `co_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        industry: null,
        domain: result?.domain ?? null,
        channel,
        channelLabel: label,
        // The crawl reports COUNTS, not the raw values — be honest: show that
        // contacts were captured without inventing a phone/email string.
        phone: null,
        email: null,
        address: null,
        people: [],
      };
      setCompanies((prev) => [node, ...prev]);
      setSelectedCompanies((prev) => new Set(prev).add(node.id));
      const got = result?.contactsCreated ?? 0;
      toast.success(
        got > 0
          ? `Scrape selesai — ${name}: ${got} kontak (${result?.emails ?? 0} email, ${result?.phones ?? 0} telp)`
          : `Scrape selesai — ${name} (tidak ada kontak publik ditemukan)`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal scrape URL"),
  });

  function runScrape() {
    const list = urls.split("\n").map((u) => u.trim()).filter(Boolean);
    if (!list.length) return;
    // Scrape sequentially-ish: fire each; the mutation appends a node per success.
    for (const u of list) scrape.mutate(u);
  }

  // ── (4) Simpan ke workspace → /api/discovery/ingest (channel-agnostic sink) ───
  const ingest = useMutation({
    mutationFn: async (payload: {
      channel: string;
      ingestCompanies: IngestCompanyInput[];
      people: IngestPersonInput[];
    }) =>
      readJson<IngestGraphResult>(
        await fetch("/api/discovery/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: payload.channel,
            workspaceId,
            companies: payload.ingestCompanies,
            people: payload.people,
            analyze: false,
          }),
        }),
      ),
    onSuccess: (res) => {
      toast.success(
        `Disimpan ke workspace — ${res.companiesUpserted} PT, ${res.peopleUpserted} orang masuk ke Kontak (belum di-enrich).`,
      );
      // Drop the saved nodes from the in-page graph + clear selection.
      setCompanies((prev) => prev.filter((c) => !selectedCompanies.has(c.id)));
      setSelectedCompanies(new Set());
      setSelectedPeople(new Set());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menyimpan ke workspace"),
  });

  function saveSelected() {
    if (!workspaceId) {
      toast.error("Pilih workspace dulu (dropdown di topbar) sebelum menyimpan.");
      return;
    }
    if (selectedCount === 0) return;
    // Group selected nodes back into one ingest payload. Channel is taken from the
    // first selected company (the ingest job is channel-tagged; mixed-channel saves
    // would need one call per channel — kept simple: the dominant channel here).
    const pickedCompanies = companies.filter((c) => selectedCompanies.has(c.id) || c.people.some((p) => selectedPeople.has(p.id)));
    if (!pickedCompanies.length) return;
    const channel = pickedCompanies[0].channel;
    const ingestCompanies: IngestCompanyInput[] = pickedCompanies
      .filter((c) => selectedCompanies.has(c.id))
      .map((c) => ({
        name: c.name,
        phone: c.phone,
        email: c.email,
        domain: c.domain,
        address: c.address,
        industry: c.industry,
      }));
    const people: IngestPersonInput[] = [];
    for (const c of pickedCompanies) {
      for (const p of c.people) {
        if (!selectedPeople.has(p.id)) continue;
        people.push({
          fullName: p.fullName,
          title: p.title,
          phone: p.phone,
          whatsapp: p.whatsapp,
          email: p.email,
          channelProfileUrl: p.profileHandle,
          companyRef: { name: c.name, domain: c.domain },
        });
      }
    }
    ingest.mutate({ channel, ingestCompanies, people });
  }

  // ── cross-channel plan grid (built from plan.data) ───────────────────────────
  const channelCards = useMemo<ChannelCard[] | null>(() => {
    const p = plan.data;
    if (!p) return null;
    return [
      {
        key: "linkedin",
        title: "LinkedIn",
        subtitle: "Search · profil · post & komentar (intent-mining)",
        live: true,
        queries: [
          ...p.linkedin.searchQueries.slice(0, 3).map((q) => ({ text: q, href: linkedinSearchUrl(q) })),
          ...p.linkedin.postSearch.slice(0, 2).map((q) => ({ text: q, href: linkedinContentUrl(q), tag: "niat" })),
        ],
      },
      {
        key: "google_maps",
        title: "Google Maps",
        subtitle: "PT + telp + alamat + kategori industri",
        live: true,
        queries: p.googleMaps.queries.slice(0, 4).map((q) => ({ text: q, href: mapsUrl(q) })),
      },
      {
        key: "google",
        title: "Google SERP",
        subtitle: "Dork → website PT + kontak",
        live: true,
        queries: p.googleDorks.slice(0, 4).map((q) => ({ text: q, href: googleUrl(q), mono: true })),
      },
      {
        key: "instagram",
        title: "Instagram",
        subtitle: p.instagram.note,
        live: false,
        queries: p.instagram.queries.slice(0, 3).map((q) => ({ text: q, href: igUrl(q) })),
      },
      {
        key: "facebook",
        title: "Facebook",
        subtitle: p.facebook.note,
        live: false,
        queries: p.facebook.queries.slice(0, 3).map((q) => ({ text: q, href: fbUrl(q) })),
      },
      {
        key: "marketplace",
        title: "Shopee · Tokopedia · TikTok",
        subtitle: p.marketplace.note,
        live: false,
        queries: [
          ...p.marketplace.shopee.slice(0, 2).map((q) => ({ text: q, href: shopeeUrl(q) })),
          ...p.marketplace.tokopedia.slice(0, 1).map((q) => ({ text: q, href: tokopediaUrl(q) })),
          ...p.tiktok.queries.slice(0, 1).map((q) => ({ text: q, href: tiktokUrl(q) })),
        ],
      },
    ];
  }, [plan.data]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Disalin");
  };

  return (
    <div>
      <PageHeader
        title="Discovery"
        description="Cari perusahaan + kontaknya + orang di dalamnya dari channel mana pun — hasilnya satu graf Perusahaan → Orang, siap disimpan ke workspace."
      >
        <Link
          href="/settings/extension"
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
            extConnected
              ? "border-success/40 bg-success/5 text-success hover:border-success/60"
              : "border-border bg-card hover:border-primary/40",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", extConnected ? "bg-success" : "bg-warning")} />
          Extension: <span className="font-semibold">{extConnected ? "Terhubung" : "Belum terhubung"}</span>
        </Link>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* ============ (1) GOAL BANNER — channel-NEUTRAL ============ */}
        <div className="flex items-start gap-3 rounded-lg border border-tertiary/30 bg-tertiary/[0.06] p-4">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-tertiary" />
          <p className="text-[13px] leading-relaxed">
            <b>Targetnya bukan &quot;hasil LinkedIn&quot;</b> — tapi sebuah graf:{" "}
            <span className="font-medium text-tertiary">Perusahaan</span> (nama · telp · email · domain · alamat ·
            industri) → <span className="font-medium text-tertiary">Orang di dalamnya</span> (nama · jabatan · telp ·
            email). Channel cuma jalan buat ngisi graf itu — LinkedIn, Google Maps, Instagram, Facebook,
            Shopee/Tokopedia, TikTok, dll.
          </p>
        </div>

        {/* ============ (2) DUA MODE MASUK ============ */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* (A) goal-first */}
          <div className="space-y-3.5 rounded-lg border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold">Cari berdasarkan target</h2>
              <span className="ml-auto rounded bg-tertiary/[0.12] px-1.5 py-0.5 text-[10px] font-medium text-tertiary">
                AI rencana lintas-channel
              </span>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground/70">Siapa yang dicari?</label>
              <input
                type="text"
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder="mis. kepala HRD pabrik manufaktur · owner toko bangunan · dokter gigi"
                className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground/70">Lokasi</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Indonesia / Jabodetabek"
                  className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-foreground/70">Seniority</label>
                <div className="relative">
                  <select
                    value={seniority || "all"}
                    onChange={(e) => setSeniority(e.target.value === "all" ? "" : e.target.value)}
                    className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-border bg-card pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    <option value="all">Semua</option>
                    <option value="senior">Owner / C-level</option>
                    <option value="mid">Manajer</option>
                    <option value="junior">Staf</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!field.trim() || plan.isPending}
              onClick={() => plan.mutate()}
            >
              <Sparkles className="h-4 w-4" />
              {plan.isPending ? "Menyusun rencana…" : "Susun rencana lintas-channel"}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              AI bikin rencana per-channel; orang aslinya diambil via extension/crawl — bukan dikarang AI.
            </p>
          </div>

          {/* (B) paste URL */}
          <div className="space-y-3.5 rounded-lg border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-info/[0.12] text-info">
                <Link2 className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold">Tempel URL apa aja</h2>
              <span className="ml-auto rounded bg-info/[0.12] px-1.5 py-0.5 text-[10px] font-medium text-info">
                scrape langsung
              </span>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-foreground/70">
                Link profil · post · toko · Google Maps
              </label>
              <textarea
                rows={3}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder={
                  "https://www.linkedin.com/posts/…  (post → ambil komentator & reactor)\nhttps://maps.google.com/…  ·  https://shopee.co.id/toko…  ·  https://instagram.com/…"
                }
                className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>

            {/* live channel-detection hint (+ intent-mining for post URLs) */}
            {detection ? (
              detection.isPost ? (
                <div className="flex items-start gap-2 rounded-lg border border-highlight/40 bg-highlight/[0.08] px-3 py-2 text-[11px] leading-relaxed">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-highlight" />
                  <span>
                    <b>URL post {detection.label} terdeteksi</b> — extension akan ambil <b>yang nge-komen / react /
                    di-tag</b> (sinyal niat terpanas), bukan cuma yang posting.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: CHANNEL_DOT[detection.channel] }} />
                  <span>
                    Channel terdeteksi: <b>{detection.label}</b> — gak perlu pilih platform dulu.
                  </span>
                </div>
              )
            ) : (
              <p className="text-[11px] text-muted-foreground">Tempel satu / beberapa URL — channel dikenali otomatis.</p>
            )}

            <Button
              variant="secondary"
              className="w-full bg-foreground text-background hover:bg-foreground/90"
              disabled={!firstUrl || scrape.isPending}
              onClick={runScrape}
            >
              <Radar className="h-4 w-4" />
              {scrape.isPending ? "Scraping…" : "Scrape URL ini"}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              Channel dikenali otomatis dari URL — gak perlu pilih platform dulu.
            </p>
          </div>
        </div>

        {/* ============ (3) CROSS-CHANNEL PLAN GRID ============ */}
        <div className="rounded-lg border border-border bg-card p-5 shadow-soft">
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Rencana lintas-channel
            </h3>
            {plan.data && (
              <span className="text-[10px] text-muted-foreground">
                target: <b className="text-foreground/70">{plan.data.field} · {plan.data.location}</b>
              </span>
            )}
          </div>

          {plan.isPending ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-lg" />
              ))}
            </div>
          ) : plan.isError ? (
            <ErrorState
              className="border-0"
              title="Gagal menyusun rencana"
              description="Tidak bisa membuat rencana lintas-channel. Coba lagi atau ubah kata kunci target."
              onRetry={() => plan.mutate()}
            />
          ) : !channelCards ? (
            <EmptyState
              className="border-0"
              icon={Sparkles}
              title="Belum ada rencana"
              description='Isi "Cari berdasarkan target" lalu klik Susun rencana — AI akan memetakan query/aksi per channel (LinkedIn, Maps, SERP, IG, FB, marketplace, TikTok).'
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {channelCards.map((card) => (
                  <ChannelPlanCard key={card.key} card={card} onCopy={copy} />
                ))}
              </div>
              <p className="mt-3 text-[10px] italic text-muted-foreground">
                Channel <b className="text-success">Live</b> bisa langsung dieksekusi via extension.{" "}
                <b className="text-warning">WIP</b> = adapter scrape-nya belum jadi (ditandai jujur, bukan dicentang
                palsu).
              </p>
            </>
          )}
        </div>

        {/* ============ (4) RESULTS — Perusahaan → Orang graph ============ */}
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
            <h3 className="text-sm font-semibold">Hasil — Perusahaan &amp; orangnya</h3>
            <span className="text-[11px] text-muted-foreground">
              <b className="text-foreground/80">{companies.length}</b> PT ·{" "}
              <b className="text-foreground/80">{totalPeople}</b> orang
            </span>
            <div className="ml-auto flex items-center gap-2">
              {selectedCount > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  <b className="text-foreground/80">{selectedCount}</b> dipilih
                </span>
              )}
              <Button
                size="sm"
                disabled={selectedCount === 0 || ingest.isPending}
                onClick={saveSelected}
              >
                <ArrowDown className="h-3.5 w-3.5" />
                {ingest.isPending ? "Menyimpan…" : "Simpan ke workspace"}
              </Button>
            </div>
          </div>

          {companies.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={Radar}
              title="Belum ada hasil"
              description="Scrape sebuah URL di atas, atau jalankan channel Live lewat extension. Perusahaan + orang yang ditemukan muncul di sini sebagai graf — bukan data karangan."
              action={
                !extConnected ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/extension">
                      <Plug className="h-4 w-4" /> Hubungkan extension
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div>
              {companies.map((co) => (
                <CompanyGroup
                  key={co.id}
                  company={co}
                  companyChecked={selectedCompanies.has(co.id)}
                  selectedPeople={selectedPeople}
                  onToggleCompany={() => toggleCompany(co)}
                  onTogglePerson={togglePerson}
                />
              ))}
              <div className="border-t border-border bg-muted/30 px-5 py-2.5 text-[11px] text-muted-foreground">
                Yang disimpan masuk ke{" "}
                <Link href="/contacts" className="font-medium text-primary hover:underline">
                  Kontak
                </Link>{" "}
                dengan status <i>&quot;belum di-enrich&quot;</i>; saat enrich, industri PT &amp; jabatan orang otomatis
                diklasifikasi ke{" "}
                <Link href="/master-data" className="font-medium text-primary hover:underline">
                  Master Data
                </Link>
                .
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function ChannelPlanCard({ card, onCopy }: { card: ChannelCard; onCopy: (q: string) => void }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3.5 transition-colors",
        card.live ? "border-border hover:border-primary/40" : "border-dashed border-border opacity-90",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHANNEL_DOT[card.key] }} />
        <span className="text-[13px] font-semibold">{card.title}</span>
        <span
          className={cn(
            "ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
            card.live ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
          )}
        >
          {card.live ? "Live" : "WIP"}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">{card.subtitle}</p>
      {card.queries.length > 0 ? (
        <div className="space-y-1 text-[11px]">
          {card.queries.map((q, i) => (
            <div
              key={`${q.text}-${i}`}
              className={cn(
                "flex items-center gap-1.5 rounded border px-2 py-1",
                q.mono ? "border-transparent bg-muted font-mono text-[10px]" : "border-border",
              )}
            >
              <span className="min-w-0 flex-1 truncate" title={q.text}>
                {q.text}
              </span>
              {q.tag && (
                <span className="shrink-0 rounded bg-highlight/15 px-1 text-[9px] font-semibold text-highlight">
                  {q.tag}
                </span>
              )}
              {q.href ? (
                <a
                  href={q.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-0.5 text-primary"
                >
                  Buka <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => onCopy(q.text)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  title="Salin"
                >
                  <Copy className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] italic text-muted-foreground">
          Adapter extension menyusul — belum ada query untuk channel ini.
        </p>
      )}
    </div>
  );
}

function CompanyGroup({
  company,
  companyChecked,
  selectedPeople,
  onToggleCompany,
  onTogglePerson,
}: {
  company: CompanyNode;
  companyChecked: boolean;
  selectedPeople: Set<string>;
  onToggleCompany: () => void;
  onTogglePerson: (p: PersonNode) => void;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      {/* company header */}
      <div className="flex flex-wrap items-center gap-2.5 bg-muted/40 px-5 py-2.5">
        <input
          type="checkbox"
          checked={companyChecked}
          onChange={onToggleCompany}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <Building2 className="h-4 w-4 text-tertiary" />
        <span className="text-sm font-semibold">{company.name}</span>
        {company.industry ? (
          <span className="rounded-full bg-tertiary/[0.12] px-1.5 py-0.5 text-[10px] font-medium text-tertiary">
            {company.industry}
          </span>
        ) : (
          <span className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            industri: belum
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: CHANNEL_DOT[company.channel] }} />
          {company.channelLabel}
        </span>
        <div className="ml-auto flex items-center gap-1.5 text-[10px]">
          {company.phone && (
            <span className="inline-flex items-center gap-1 rounded bg-success/[0.12] px-1.5 py-0.5 font-medium text-success">
              <Phone className="h-3 w-3" /> {company.phone}
            </span>
          )}
          {company.email && (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
              style={{ background: "#6366F118", color: "#4f46e5" }}
            >
              <Mail className="h-3 w-3" /> {company.email}
            </span>
          )}
        </div>
      </div>

      {/* people OR an honest "no people yet" note (server crawl = company-level) */}
      {company.people.length === 0 ? (
        <div className="px-5 py-2.5 pl-12 text-[11px] text-muted-foreground">
          Kontak level-perusahaan tersimpan. Orang di dalamnya diisi lewat <b>extension</b> (LinkedIn/IG) atau enrich —
          belum ada orang dari scrape ini.
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-border">
            {company.people.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="w-9 py-2.5 pl-12 pr-4">
                  <input
                    type="checkbox"
                    checked={selectedPeople.has(p.id)}
                    onChange={() => onTogglePerson(p)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                </td>
                <td className="px-2 py-2.5">
                  <div className="font-medium">{p.fullName}</div>
                  {p.title && <div className="text-[11px] text-muted-foreground">{p.title}</div>}
                </td>
                <td className="px-2 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: CHANNEL_DOT[p.channel] }} />
                    {p.channelLabel}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  {p.profileHandle && (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                      {p.profileHandle}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-[10px]">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {(p.whatsapp || p.phone) && (
                      <span className="inline-flex items-center gap-1 rounded bg-success/[0.12] px-1.5 py-0.5 font-medium text-success">
                        <Phone className="h-3 w-3" /> {p.whatsapp || p.phone}
                      </span>
                    )}
                    {p.email && (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
                        style={{ background: "#6366F118", color: "#4f46e5" }}
                      >
                        <Mail className="h-3 w-3" /> {p.email}
                      </span>
                    )}
                    {!p.whatsapp && !p.phone && !p.email && <span className="text-muted-foreground">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
