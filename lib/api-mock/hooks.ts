"use client";

import { useQuery } from "@tanstack/react-query";

import * as db from "./data";
import type {
  AiResponse,
  Contact,
  Conversation,
  DealStage,
  Message,
} from "@/lib/types";

// Small simulated latency so loading skeletons flash briefly (kept short so
// navigation feels instant).
function settle<T>(data: T, ms = 160): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

export function useContacts() {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await fetch("/api/db/contacts");
      const json = (await res.json()) as { data: Contact[] };
      return json.data;
    },
  });
}

export function useDeals() {
  return useQuery({ queryKey: ["deals"], queryFn: () => settle(db.deals) });
}

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await fetch("/api/db/conversations");
      const json = (await res.json()) as { data: Conversation[] };
      return json.data;
    },
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: async () => {
      const [convsRes, msgsRes] = await Promise.all([
        fetch("/api/db/conversations"),
        fetch(`/api/db/messages?conversationId=${encodeURIComponent(id)}`),
      ]);
      const conversations = ((await convsRes.json()) as { data: Conversation[] })
        .data;
      const messages = ((await msgsRes.json()) as { data: Message[] }).data;
      return {
        conversation: conversations.find((c) => c.id === id) ?? null,
        messages: messages.sort(
          (a, b) => +new Date(a.timestamp) - +new Date(b.timestamp),
        ),
      };
    },
  });
}

export function useCadences() {
  return useQuery({ queryKey: ["cadences"], queryFn: () => settle(db.cadences) });
}

export function useSequence(id: string) {
  return useQuery({
    queryKey: ["sequence", id],
    queryFn: () => settle(db.sequences[id] ?? db.sequences["default"] ?? []),
  });
}

export function useFieldReps() {
  return useQuery({ queryKey: ["fieldReps"], queryFn: () => settle(db.fieldReps) });
}

export function useVisits() {
  return useQuery({ queryKey: ["visits"], queryFn: () => settle(db.visits) });
}

export function useOrders() {
  return useQuery({ queryKey: ["orders"], queryFn: () => settle(db.orders) });
}

export function useConsentLog() {
  return useQuery({
    queryKey: ["consentLog"],
    queryFn: () => settle(db.consentLog),
  });
}

export function useDpia() {
  return useQuery({ queryKey: ["dpia"], queryFn: () => settle(db.dpia) });
}

export function useVendors() {
  return useQuery({ queryKey: ["vendors"], queryFn: () => settle(db.vendors) });
}

export function useTasks() {
  return useQuery({ queryKey: ["tasks"], queryFn: () => settle(db.tasks) });
}

export function useActivity() {
  return useQuery({ queryKey: ["activity"], queryFn: () => settle(db.activity) });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ["contact", id],
    queryFn: () => settle(db.contacts.find((c) => c.id === id) ?? null),
  });
}

const STAGE_ORDER: DealStage[] = [
  "prospek",
  "kualifikasi",
  "penawaran",
  "negosiasi",
  "tutup",
];

/** Derived dashboard KPIs computed from the deal/cadence mock data. */
export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => {
      const open = db.deals.filter((d) => d.stage !== "tutup");
      const pipelineValue = open.reduce((s, d) => s + d.value, 0);
      const now = new Date("2026-05-25T10:00:00+07:00").getTime();
      const weekAhead = now + 7 * 864e5;
      const closing = db.deals.filter(
        (d) => +new Date(d.expectedClose) <= weekAhead && d.stage !== "tutup",
      );
      const closingValue = closing.reduce((s, d) => s + d.value, 0);
      const activeCadences = db.cadences.filter((c) => c.status === "active");
      const enrolled = activeCadences.reduce((s, c) => s + c.enrolled, 0);
      const unreadConvos = db.conversations.filter(
        (c) => c.channel === "whatsapp" && c.unread > 0,
      ).length;
      const funnel = STAGE_ORDER.map((stage) => ({
        stage,
        count: db.deals.filter((d) => d.stage === stage).length,
        value: db.deals
          .filter((d) => d.stage === stage)
          .reduce((s, d) => s + d.value, 0),
      }));
      return settle({
        pipelineValue,
        pipelineChange: 12.4,
        closingCount: closing.length,
        closingValue,
        waResponseRate: 87,
        waUnanswered: unreadConvos,
        activeCadences: activeCadences.length,
        enrolled,
        funnel,
      });
    },
  });
}

// TODO(gap-b): Migrate any remaining callers to `composeKbReply` from
// `@/lib/utils/compose-kb-reply`, then delete this function + the
// `aiResponses` seed data in `lib/api-mock/data.ts` and the `AiResponse`
// type in `lib/types.ts`. The global AI assistant (`components/ai/ai-chat.tsx`)
// is already migrated. This rule-based matcher is kept temporarily for
// backwards compatibility with any legacy surface not yet ported.
/**
 * @deprecated Use `composeKbReply(prompt, kb)` from `@/lib/utils/compose-kb-reply`
 * instead. The new composer reads the live Knowledge Base (products, pricing,
 * segments, strategy notes, upsell rules, retention flows) and returns a
 * grounded multi-paragraph reply + source citations — closing Gap B
 * (feature-revisions.md §4).
 */
export function matchAiResponse(prompt: string): AiResponse {
  const p = prompt.toLowerCase();
  const hit = db.aiResponses.find(
    (r) => r.triggers.length > 0 && r.triggers.some((t) => p.includes(t)),
  );
  return hit ?? db.aiResponses.find((r) => r.kind === "default")!;
}
