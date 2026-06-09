// Typed accessors over the generated mock JSON.
import companiesJson from "@/lib/mock-data/companies.json";
import contactsJson from "@/lib/mock-data/contacts.json";
import dealsJson from "@/lib/mock-data/deals.json";
import conversationsJson from "@/lib/mock-data/conversations.json";
import messagesJson from "@/lib/mock-data/messages.json";
import cadencesJson from "@/lib/mock-data/cadences.json";
import sequencesJson from "@/lib/mock-data/sequences.json";
import fieldRepsJson from "@/lib/mock-data/field-reps.json";
import visitsJson from "@/lib/mock-data/visits.json";
import ordersJson from "@/lib/mock-data/orders.json";
import aiResponsesJson from "@/lib/mock-data/ai-responses.json";
import consentLogJson from "@/lib/mock-data/consent-log.json";
import dpiaJson from "@/lib/mock-data/dpia.json";
import vendorsJson from "@/lib/mock-data/vendors.json";
import prospectsJson from "@/lib/mock-data/prospects.json";
import inboundJson from "@/lib/mock-data/inbound.json";
import contentJson from "@/lib/mock-data/content.json";
import tasksJson from "@/lib/mock-data/tasks.json";
import activityJson from "@/lib/mock-data/activity.json";

import type {
  ActivityEvent,
  AiResponse,
  Cadence,
  CadenceStep,
  Company,
  Conversation,
  ConsentEntry,
  Contact,
  ContentItem,
  Deal,
  DpiaEntry,
  FieldRep,
  InboundLead,
  Message,
  Order,
  ProspectLead,
  Task,
  VendorRisk,
  Visit,
} from "@/lib/types";

export const companies = companiesJson as unknown as Company[];
export const contacts = contactsJson as unknown as Contact[];
export const deals = dealsJson as unknown as Deal[];
export const conversations = conversationsJson as unknown as Conversation[];
export const messages = messagesJson as unknown as Message[];
// The mock JSON for cadences stores `steps` as a numeric count and the actual
// step bodies live in a separate `sequences.json` keyed by cadence id. The
// canonical Cadence type now embeds the steps array directly (matches the
// Postgres jsonb column shape), so we hydrate here.
export const sequences = sequencesJson as unknown as Record<string, CadenceStep[]>;
export const cadences: Cadence[] = (cadencesJson as unknown as Array<
  Omit<Cadence, "steps"> & { steps: number }
>).map((c) => ({
  ...c,
  steps: sequences[c.id] ?? sequences["default"] ?? [],
}));
export const fieldReps = fieldRepsJson as unknown as FieldRep[];
export const visits = visitsJson as unknown as Visit[];
export const orders = ordersJson as unknown as Order[];
export const aiResponses = aiResponsesJson as unknown as AiResponse[];
export const consentLog = consentLogJson as unknown as ConsentEntry[];
export const dpia = dpiaJson as unknown as DpiaEntry[];
export const vendors = vendorsJson as unknown as VendorRisk[];
export const prospects = prospectsJson as unknown as ProspectLead[];
export const inbound = inboundJson as unknown as InboundLead[];
export const content = contentJson as unknown as ContentItem[];
export const tasks = tasksJson as unknown as Task[];
export const activity = activityJson as unknown as ActivityEvent[];
