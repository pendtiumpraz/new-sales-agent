# Predictive training loop (G7)

Closing-readiness started as a pure heuristic (`lib/sales/predictive.ts`:
stage + signals → 0–100 score + band dingin/hangat/panas). G7 closes the loop:
record how chats actually end, then **calibrate** the score against reality —
honestly (a tenant-specific empirical close rate per band), **not** a trained model.

## Pieces

- **Outcome store** (`lib/sales/outcome-store.ts`, zero-migration via
  `platformSettingTable`):
  - `convoutcome:<conversationId>` — the chat's latest outcome (`won|lost|stalled`)
    with the readiness score/band captured at that moment.
  - `closeoutcomes:<tenantId>` — a bounded (≤500) log, deduped by conversationId,
    that calibration reads in one row.
- **Calibration** (`lib/sales/calibration.ts`): per-band empirical close rate —
  "of chats that were 'panas', how many closed?". `ready` once ≥10 outcomes total;
  a band's rate is only surfaced at ≥3 samples (below that it's noise).

## How outcomes get recorded

1. **Manual (source of truth)** — `OutcomeMarker` above the thread → `POST
   /api/sales/outcome {conversationId, outcome}`. The score/band are pulled from the
   last saved readiness so the log captures *predicted vs. actual*.
2. **Auto-capture (high precision)** — the WA inbound route runs `detectOutcome` on
   each message; only **explicit** signals ("sudah transfer", "gak jadi", "batal")
   record an `auto` outcome. The loose closing-intent ("oke", "lanjut") is excluded
   so the log isn't polluted with false wins. Auto never overwrites a manual mark.

## How it feeds back

The score itself stays the transparent heuristic — we don't silently mutate it from
sparse data. Instead the **empirical close rate for the score's band** is attached:

- `GET /api/sales/readiness` annotates `readiness.calibration = {closeRate, n}`.
- `GET /api/sales/calibration` returns the full per-band table.
- The `ReadinessBadge` shows `… · ~64%` and a tooltip "Historis band panas: closing
  64% (n=33)" once there's enough data.

So a rep reads both the model's guess (score) and how that band has *actually*
converted for this tenant — and trusts or discounts it accordingly. As outcomes
accumulate, the calibration sharpens. Concurrency note: the tenant log is a
read-modify-write on one key — fine at prototype volume; a real build would move it
to its own table.
