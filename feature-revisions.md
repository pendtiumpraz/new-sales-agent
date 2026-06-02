# Feature Revisions — Agentic Sales AI
> Source: Internal meeting, 29 May 2026  
> Use this file as implementation reference for Claude Code.

---

## 1. UI/UX Changes

- Move **Inbox** into the **Contacts or Profile** view — remove as standalone menu item
- **Hide** Sales Lapangan and E-Commerce modules for now (do not delete, just disable/hide)
- Change sidebar navigation from **horizontal → vertical** (top-to-bottom scroll), following Privasi layout pattern
- Remove standalone **Input** screen — merge into Account or Profile section
- **Contacts and Pipeline** merged into one integrated view

---

## 2. Unified Section: Inbox + Prospect + Pipeline

Combine Inbox, Prospect, and Pipeline into a **single unified section**.

### Goal
Sales team should not need to navigate between separate menus to view chat history, prospect data, and pipeline status simultaneously.

### Expected Behavior
- One section view shows: chat history (Inbox) + prospect profile + current pipeline stage
- Pipeline status can be updated **directly from within a conversation**
- AI reads context from all three to suggest the next best action

### Implementation Notes
- This is a layout/routing change as much as a data model change
- Prospect record and pipeline stage should be linkable from the chat thread
- Consider a split-pane or tabbed layout within the unified section

---

## 3. Pipeline → Enrichment Data

Reframe the Pipeline module as **Enrichment Data**.

### New Functionality
- Identify which prospects are still active vs. dropped
- Add an **AI Analysis layer** inside the pipeline view:
  - Recommend which prospects to prioritize
  - Suggest the right message and offer per segment
- Product input must include **product list + pricing** so AI can match offerings to prospect company size/revenue

---

## 4. AI Response — Non-Linear + Advanced RAG

### Replace Current System
- Current: rule-based, keyword-triggered, linear response flows
- New: **non-linear responses** powered by LLM, no hardcoded rules

### RAG Upgrade
- Replace basic PDF-only retrieval with **Advanced RAG**
- Should support multi-source knowledge retrieval
- Each client requires a **first-time development cost** to build their Knowledge Base

### Knowledge Base Structure (per client)
Each client KB must include:
- `product_list` — product names, descriptions
- `pricing` — per product, per tier if applicable
- `target_segments` — who each product is for
- `priority_products` — which to push first, per segment
- `marketing_strategy` — client-specific approach
- `upsell_map` — what to offer after initial product
- `retention_flows` — repeat order, after-sales, loyalty triggers

---

## 5. WhatsApp Auto-Reply & Human Handoff

All WhatsApp chat and auto-reply features will connect to AI. A **human handoff mechanism** must be defined and implemented.

### Handoff Trigger Conditions
| Trigger | Description |
|---|---|
| Sentiment analysis | If conversation sentiment turns negative → escalate to human |
| Time-based | No resolution after X minutes → hand off |
| Complexity | Topics outside AI scope (custom negotiation, serious complaints) |

### Sentiment Analysis — Dual Use
- Primary: detect when human agent needs to intervene
- Secondary: **market mapping** — aggregate sentiment data per product from chat interactions, usable as product/marketing insight

### Implementation Notes
- Define the exact sentiment threshold for escalation
- Define timeout window for time-based trigger
- Handoff must be smooth — human agent sees full chat context on takeover

---

## 6. Retention & After-Sales Module

Add a retention flow to the system:

- **Repeat order** — trigger re-engagement after purchase cycle
- **Upselling** — offer additional features or products post-sale
- **After-sales marketing** — follow-up sequences post-transaction

All retention flows should be:
- Tied to the client's Knowledge Base
- Customizable per product segment and interaction history

---

## 7. Analytics & Reporting

- **Error rate tracking** — monitor % of AI responses that fail or are inaccurate
- **Complete report dashboard** — end-to-end sales and marketing activity
- **Pipeline verification** — ensure data entering the pipeline is clean and valid

---

## 8. Removed / Deferred Features

| Feature | Status | Notes |
|---|---|---|
| Sales Lapangan | Deferred | Hide from UI, do not delete |
| E-Commerce | Deferred | Hide from UI, do not delete |

---

## 9. LLM Options (for reference)

| Model | Pros | Notes |
|---|---|---|
| GPT-5.5 (OpenAI) | High performance, latest | More expensive |
| Deepseek | Cost-efficient | Good for early dev |
| Llama (self-hosted) | Full control, data privacy | High GPU cost upfront |

- Multi-LLM architecture is possible
- Reference platform for enterprise AI pattern: **ServiceNow**

---

*Last updated: 29 May 2026 — internal use only*
