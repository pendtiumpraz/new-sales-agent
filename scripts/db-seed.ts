/**
 * Seed script — loads existing mock JSON into Postgres.
 *
 * Idempotent: every INSERT uses ON CONFLICT (id) DO UPDATE so re-running
 * refreshes the rows without erroring.
 *
 * Run with: `npm run db:seed`
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Tiny .env loader — avoids adding a `dotenv` dependency just for this script.
// Parses KEY=VALUE lines, ignores comments + blanks, strips surrounding quotes.
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Load .env.local first (Vercel-pulled creds), fall back to .env.
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

import dealsJson from "../lib/mock-data/deals.json";
import contactsJson from "../lib/mock-data/contacts.json";
import conversationsJson from "../lib/mock-data/conversations.json";
import messagesJson from "../lib/mock-data/messages.json";
import { seedKnowledgeBase } from "../lib/api-mock/kb";
import { DEMO_ACCOUNTS } from "../lib/auth/demo-accounts";

import { db } from "../lib/db/client";
import {
  kbTable,
  dealsTable,
  contactsTable,
  conversationsTable,
  messagesTable,
  usersTable,
} from "../lib/db/schema";

type DealRow = (typeof dealsJson)[number];
type ContactRow = (typeof contactsJson)[number];
type ConversationRow = (typeof conversationsJson)[number];
type MessageRow = (typeof messagesJson)[number];

async function seedKb() {
  await db
    .insert(kbTable)
    .values({
      id: "client_default",
      data: seedKnowledgeBase,
    })
    .onConflictDoUpdate({
      target: kbTable.id,
      set: {
        data: seedKnowledgeBase,
        updatedAt: new Date(),
      },
    });
  console.log("  kb: 1 row");
}

async function seedDeals() {
  const rows = (dealsJson as DealRow[]).map((d) => ({
    id: d.id,
    name: d.name,
    contactId: d.contactId ?? null,
    contactName: d.contactName ?? null,
    company: d.company ?? null,
    value: Number(d.value),
    stage: d.stage,
    expectedClose: d.expectedClose ?? null,
    sourceChannel: d.sourceChannel ?? null,
    owner: d.owner ?? null,
    avatarColor: d.avatarColor ?? null,
    createdAt: d.createdAt ?? null,
  }));

  // Insert in chunks so we don't hit parameter limits on big seeds.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(dealsTable)
      .values(slice)
      .onConflictDoUpdate({
        target: dealsTable.id,
        set: {
          name: dealsTable.name,
          contactId: dealsTable.contactId,
          contactName: dealsTable.contactName,
          company: dealsTable.company,
          value: dealsTable.value,
          stage: dealsTable.stage,
          expectedClose: dealsTable.expectedClose,
          sourceChannel: dealsTable.sourceChannel,
          owner: dealsTable.owner,
          avatarColor: dealsTable.avatarColor,
          createdAt: dealsTable.createdAt,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`  deals: ${rows.length} rows`);
}

async function seedContacts() {
  const rows = (contactsJson as ContactRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title ?? null,
    companyId: c.companyId ?? null,
    company: c.company ?? null,
    industry: c.industry ?? null,
    city: c.city ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    channelPreference: c.channelPreference ?? null,
    consent: c.consent ?? null,
    consentSource: c.consentSource ?? null,
    consentDate: c.consentDate ?? null,
    lastActivity: c.lastActivity ?? null,
    avatarColor: c.avatarColor ?? null,
    tags: (c.tags ?? []) as string[],
    source: c.source ?? null,
  }));

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(contactsTable)
      .values(slice)
      .onConflictDoUpdate({
        target: contactsTable.id,
        set: {
          name: contactsTable.name,
          title: contactsTable.title,
          companyId: contactsTable.companyId,
          company: contactsTable.company,
          industry: contactsTable.industry,
          city: contactsTable.city,
          email: contactsTable.email,
          phone: contactsTable.phone,
          channelPreference: contactsTable.channelPreference,
          consent: contactsTable.consent,
          consentSource: contactsTable.consentSource,
          consentDate: contactsTable.consentDate,
          lastActivity: contactsTable.lastActivity,
          avatarColor: contactsTable.avatarColor,
          tags: contactsTable.tags,
          source: contactsTable.source,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`  contacts: ${rows.length} rows`);
}

async function seedConversations() {
  const rows = (conversationsJson as ConversationRow[]).map((c) => ({
    id: c.id,
    contactId: c.contactId,
    contactName: c.contactName ?? null,
    company: c.company ?? null,
    channel: c.channel,
    lastMessage: c.lastMessage ?? null,
    lastTimestamp: c.lastTimestamp ?? null,
    unread: Number(c.unread ?? 0),
    avatarColor: c.avatarColor ?? null,
    assignedTo: c.assignedTo ?? null,
  }));

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(conversationsTable)
      .values(slice)
      .onConflictDoUpdate({
        target: conversationsTable.id,
        set: {
          contactId: conversationsTable.contactId,
          contactName: conversationsTable.contactName,
          company: conversationsTable.company,
          channel: conversationsTable.channel,
          lastMessage: conversationsTable.lastMessage,
          lastTimestamp: conversationsTable.lastTimestamp,
          unread: conversationsTable.unread,
          avatarColor: conversationsTable.avatarColor,
          assignedTo: conversationsTable.assignedTo,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`  conversations: ${rows.length} rows`);
}

async function seedMessages() {
  const rows = (messagesJson as MessageRow[]).map((m) => {
    const r = m as Partial<MessageRow> & {
      subject?: string | null;
      attachmentLabel?: string | null;
    };
    return {
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      body: m.body,
      timestamp: m.timestamp,
      status: r.status ?? null,
      subject: r.subject ?? null,
      attachmentLabel: r.attachmentLabel ?? null,
    };
  });

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(messagesTable)
      .values(slice)
      .onConflictDoUpdate({
        target: messagesTable.id,
        set: {
          conversationId: messagesTable.conversationId,
          direction: messagesTable.direction,
          body: messagesTable.body,
          timestamp: messagesTable.timestamp,
          status: messagesTable.status,
          subject: messagesTable.subject,
          attachmentLabel: messagesTable.attachmentLabel,
        },
      });
  }
  console.log(`  messages: ${rows.length} rows`);
}

// Tolerate Vercel Marketplace's "Environment Variables Prefix" feature
// (e.g. MAIRA_POSTGRES_URL instead of the canonical POSTGRES_URL). The
// runtime client in lib/db/client.ts handles this gracefully; mirror the
// same scan here so the pre-flight error message is accurate.
function hasAnyPostgresUrl(): boolean {
  if (process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING) return true;
  return Object.keys(process.env).some(
    (k) => /_POSTGRES_URL(_NON_POOLING)?$/.test(k),
  );
}

async function seedUsers() {
  // Upsert each demo account into the `users` table. Idempotent on email
  // (the unique constraint), so re-running the seed refreshes credentials
  // without erroring.
  for (const a of DEMO_ACCOUNTS) {
    await db
      .insert(usersTable)
      .values({
        id: a.id,
        name: a.name,
        email: a.email.toLowerCase(),
        password: a.password,
        role: a.role,
        avatarColor: a.avatarColor,
        scope: a.scope,
      })
      .onConflictDoUpdate({
        target: usersTable.email,
        set: {
          id: a.id,
          name: a.name,
          password: a.password,
          role: a.role,
          avatarColor: a.avatarColor,
          scope: a.scope,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`  users: ${DEMO_ACCOUNTS.length} rows`);
}

async function main() {
  if (!hasAnyPostgresUrl()) {
    console.error(
      "Missing POSTGRES_URL. Run `vercel env pull .env.local` first, " +
        "then re-run `npm run db:seed`.",
    );
    process.exit(1);
  }

  console.log("Seeding Postgres…");
  await seedKb();
  await seedDeals();
  await seedContacts();
  await seedConversations();
  await seedMessages();
  await seedUsers();
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => {
    // Ensure node exits cleanly even if pool keeps a handle open.
    setTimeout(() => process.exit(0), 100).unref();
  });
