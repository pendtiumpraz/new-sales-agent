# 18 — SaaS architecture overview (vision)

> **Status: design spec, belum dibangun.** Seri `18`–`27` mendeskripsikan target
> arsitektur untuk menaikkan prototype (`01`–`17`) jadi **multi-tenant B2B sales
> intelligence + engagement platform** — kategori Apollo / Clay / Outreach /
> Lemlist. Tiap doc fokus satu layer dan menunjuk ke kode existing yang jadi
> fondasinya.

## Positioning

Satu kalimat: **crawl & profil target B2B → AI bikin angle "cara produk tenant
masuk ke prospek" → outreach multi-channel dari identitas email user sendiri**,
semuanya terisolasi per tenant dengan RBAC, observability, dan cost metering.

Yang bikin orang bayar bukan crawling-nya (itu komoditas), tapi **positioning
insight** (doc [22]) + **deliverability + identitas pengirim yang rapi** (doc
[23]). Crawling & blasting cuma jalan kalau compliance (doc [25]) jadi fitur,
bukan tempelan — karena risiko mati di kategori ini adalah **ban akun** &
**hukum (UU PDP/GDPR)**, bukan bug.

## Keputusan arsitektur yang sudah dikunci

| Area | Keputusan | Doc |
|------|-----------|-----|
| Isolasi tenant | Shared DB + **Postgres Row-Level Security** via `tenant_id` | [19] |
| RBAC | `superadmin` → `tenant_owner` → `tenant_admin` → `member` | [19] |
| Contact model | Pisah **Company** vs **Person**, `contact_point` polymorphic + provenance/consent | [20] |
| Email sending | **Semua jalur**: OAuth (Gmail/MS) + custom SMTP + platform ESP | [23] |
| AI keys | **Hybrid**: platform default (di-meter) + tenant BYOK | [24] |
| Active model | **Per-tenant** (tiap tenant pilih 1 model aktif) | [24] |
| Crawling posture | **Mode dipilih user** (`compliant` ↔ `aggressive`) + Chrome extension RPA | [21] |

## Layer (peta besar)

```
┌─ Acquisition ──────────────────────────────────────────────┐
│  MCP server (tools: crawl_company, find_contacts, enrich…)  │  doc 21
│  Chrome extension RPA (LinkedIn search dll → local → sync)  │
└──────────────────────────────┬─────────────────────────────┘
                               ▼
┌─ Data & profiling ─────────────────────────────────────────┐
│  Company / Person / ContactPoint + provenance + consent     │  doc 20
│  Enrichment → "positioning insight" engine                  │  doc 22
└──────────────────────────────┬─────────────────────────────┘
                               ▼
┌─ Engagement ───────────────────────────────────────────────┐
│  Cadences multi-channel + mailbox per-user + send worker    │  doc 23
└──────────────────────────────┬─────────────────────────────┘
                               ▼
┌─ Platform plane ───────────────────────────────────────────┐
│  Multitenancy + RBAC (19) · AI registry + cost (24)         │
│  Compliance & governance (25) · Superadmin & obs (26)       │
│  Pricing & billing (27)                                     │
└────────────────────────────────────────────────────────────┘
```

## Maps to existing prototype

| Visi | Sudah ada sebagai | Yang ditambah |
|------|-------------------|----------------|
| Acquisition | `/prospecting` "Crawl prospek baru" (simulated) | MCP + RPA, discovery entry points (URL/bidang/bulk/auto) + cascade, provenance |
| Profiling | `contacts`, `ProspectLead` | pisah Company/Person, consent |
| Positioning insight | `ProspectSheet` "Riset AI" + opener | engine terstruktur, per-product |
| Outreach | `/cadences`, `auto-reply`, `draft-message` | multi-channel + mailbox identity |
| AI | `lib/ai/provider.ts` (DeepSeek) | registry multi-provider + metering |
| Compliance | `docs/15-settings-compliance.md` | governance lintas-crawl & PDP |
| Tenancy/RBAC | (belum) | RLS + role matrix + superadmin |

## Roadmap fase (saran)

1. **Fondasi tenant**: RLS + RBAC + auth nyata (gantiin mock login). Doc [19].
2. **Data model**: Company/Person/ContactPoint + provenance. Doc [20].
3. **AI registry + metering**: generalize `provider.ts`, per-tenant active model. Doc [24].
4. **Acquisition MVP**: MCP `crawl_company` + enrichment + positioning insight. Doc [21], [22].
5. **Engagement**: mailbox connect (OAuth/SMTP) + send worker + cadence multi-channel. Doc [23].
6. **Chrome extension RPA**: LinkedIn search → local buffer → sync. Doc [21].
7. **Compliance hardening + superadmin + billing**. Doc [25], [26], [27].

[19]: ./19-multitenancy-and-rbac.md
[20]: ./20-data-model-company-vs-human.md
[21]: ./21-data-acquisition-crawling-mcp-rpa.md
[22]: ./22-enrichment-and-positioning-insight.md
[23]: ./23-outreach-email-identity-and-deliverability.md
[24]: ./24-ai-provider-model-registry-and-cost.md
[25]: ./25-compliance-and-data-governance.md
[26]: ./26-superadmin-and-observability.md
[27]: ./27-pricing-and-billing.md
