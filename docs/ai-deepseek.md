# Deepseek via Vercel AI Gateway

Zenith calls Deepseek through the **Vercel AI Gateway**. One key, observability,
and OIDC in production — no Deepseek account or per-provider SDK needed.

## Why the Gateway?

- **Cost** — usage is metered through your Vercel project, no separate billing.
- **Observability** — every call (latency, tokens, cost) shows up in the Vercel
  dashboard under *AI → Logs*.
- **OIDC in production** — Vercel auto-issues `VERCEL_OIDC_TOKEN` for prod and
  preview deployments. You only need an API key for local development.
- **Provider portability** — swap Deepseek for any of the 100+ supported models
  by changing the model ID (`deepseek/…` → `anthropic/…`, `openai/…`, etc.).

## One-time setup

```bash
# 1. Link the local repo to the Vercel project
vercel link

# 2. Pull all env vars (including AI_GATEWAY_API_KEY) into .env.local
vercel env pull .env.local
```

If you don't have Vercel CLI access, grab the key manually:

1. Open the Vercel dashboard → **AI** → **Gateway** → **API keys**.
2. Copy the key into `.env.local`:
   ```
   AI_GATEWAY_API_KEY=sk_aigw_…
   ```

## Flipping the real-AI flag

The app defaults to the offline mock (`composeKbReply`). To call the real
Deepseek backend, set:

```
NEXT_PUBLIC_AI_PROVIDER=deepseek
```

This is read by `isRealAiEnabled()` in `lib/ai/provider.ts` and branches both
server routes and client UI affordances.

## Model choices

| Constant                   | Model ID                          | Surface                          |
|----------------------------|-----------------------------------|----------------------------------|
| `GATEWAY_MODEL_CHAT`       | `deepseek/deepseek-v4-pro`        | Assistant chat (multi-turn)      |
| `GATEWAY_MODEL_FAST`       | `deepseek/deepseek-v4-flash`      | One-shot drafts, auto-reply      |
| `GATEWAY_MODEL_REASONING`  | `deepseek/deepseek-v3.2-thinking` | Analysis, deal coaching, RAG     |

Import them from `@/lib/ai/provider`.

## Fallback mock

When `NEXT_PUBLIC_AI_PROVIDER` is unset (or anything other than `"deepseek"`),
`lib/utils/compose-kb-reply.ts` produces a fully-grounded Bahasa Indonesia
answer from the live KB using deterministic heuristics. This keeps the demo
working offline, with no API cost, and is the recommended default for local
development unless you're explicitly testing Deepseek behavior.

The system-prompt builder for the real backend lives in
`lib/utils/kb-system-prompt.ts` — it pins Deepseek to the same KB and
optionally injects top-K retrieved sources for Advanced RAG.
