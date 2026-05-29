import { create } from "zustand";

import { prospects as seedProspects, inbound as seedInbound } from "@/lib/api-mock/data";
import type { InboundLead, ProspectLead } from "@/lib/types";

function enrichOne(p: ProspectLead): ProspectLead {
  if (p.enriched) return p;
  const dom =
    p.company
      .replace(/^(PT|CV|UD|Koperasi)\s+/i, "")
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .slice(0, 12) || "mail";
  return {
    ...p,
    enriched: true,
    emailVerified: true,
    email: `${p.name.toLowerCase().replace(/\s+/g, ".")}@${dom}.co.id`,
    phone: `+62 81${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
    techStack: p.techStack.length
      ? p.techStack
      : ["WhatsApp Business API", "Google Workspace"],
  };
}

interface ProspectingState {
  prospects: ProspectLead[];
  inbound: InboundLead[];
  enrich: (id: string) => void;
  enrichMany: (ids: string[]) => void;
  addToCrm: (id: string) => void;
  addManyToCrm: (ids: string[]) => void;
  replyInbound: (id: string) => void;
  routeInbound: (id: string) => void;
}

// In-memory only. Seeded from prospects.json / inbound.json.
export const useProspectingStore = create<ProspectingState>((set) => ({
  prospects: seedProspects.map((p) => ({ ...p })),
  inbound: seedInbound.map((i) => ({ ...i })),
  enrich: (id) =>
    set((s) => ({
      prospects: s.prospects.map((p) => (p.id === id ? enrichOne(p) : p)),
    })),
  enrichMany: (ids) =>
    set((s) => ({
      prospects: s.prospects.map((p) => (ids.includes(p.id) ? enrichOne(p) : p)),
    })),
  addToCrm: (id) =>
    set((s) => ({
      prospects: s.prospects.map((p) =>
        p.id === id ? { ...enrichOne(p), inCrm: true } : p,
      ),
    })),
  addManyToCrm: (ids) =>
    set((s) => ({
      prospects: s.prospects.map((p) =>
        ids.includes(p.id) ? { ...enrichOne(p), inCrm: true } : p,
      ),
    })),
  replyInbound: (id) =>
    set((s) => ({
      inbound: s.inbound.map((i) =>
        i.id === id ? { ...i, status: "dibalas" } : i,
      ),
    })),
  routeInbound: (id) =>
    set((s) => ({
      inbound: s.inbound.map((i) =>
        i.id === id ? { ...i, status: "dialihkan" } : i,
      ),
    })),
}));
