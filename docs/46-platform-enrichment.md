# Doc 46 — Platform-side enrichment (websearch + gender + contacts)

## Problem
The extension crawl gives name + LinkedIn URL but thin profiling, and the old
"Klasifikasi" button only labelled B2C/B2B from the (often messy) title — no email,
no phone, no gender, and it could never see anything LinkedIn-only from the server.

## What enrichment does now (`/api/profiles/enrich`)
The platform **can** fetch the public web — it just can't log into LinkedIn. So per
person we run, server-side:

1. **Gender + honorific** from the name — rule-based (`salutationFor`), instant, offline.
2. **Web discovery** (`lib/websearch/discover.ts`):
   - DuckDuckGo HTML search on `"<name>" <company>` + `"<name>" github/email/linkedin`.
   - If a `github.com/<user>` link appears → **GitHub API** (`api.github.com/users/<user>`)
     for public email / blog (website) / twitter / company / bio — great for IT leads.
   - **email + phone extracted by regex** from the result snippets — never fabricated.
   - LinkedIn `/in/` URL captured if present.
   - Optional 1-line AI summary (untrusted-wrapped per doc 43; falls back to GitHub bio).
3. **Classify** (`classifyLead`) for B2C/B2B/partner.
4. Persist: `person.gender/honorific/leadType/leadReason/leadScore/profileSummary/socials/
   linkedin_url` + contact points (email/phone/website/github/twitter, `source:"websearch"`).

## Display (`/contacts/profiles`)
Each person card now shows: LinkedIn link, GitHub/website/X/IG links, gender/honorific,
the AI summary, and contact points are linkified — email→mailto, **phone→tel + a
WhatsApp (wa.me) button** (phones normalized to `62…`).

## Notes
- Deterministic email/phone (regex + GitHub API) → no hallucinated contacts.
- doc 43: web text is injection-scanned (`looksInjected`) and wrapped (`wrapUntrusted`);
  the AI only writes the summary.
- Bulk enrich is capped (8/call) — websearch is slow. Best-effort: any leg can be empty
  (DDG blocked, no GitHub, no model) and the rest still persists.
