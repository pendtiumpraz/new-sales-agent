# 15 — Settings + UU PDP compliance (GRC / DPO suite)

The demo's compliance finale — built out into a full **GRC workspace for Data
Protection Officers**, not just a score card. Sells the "banks love this" pitch
(build.md §9 step 13, §5.11) by streamlining UU PDP No. 27/2022 directly.

## `/settings/compliance` — five tabs

### Ringkasan
- `<ScoreGauge>` (SVG donut, pink arc on dark track) — **94 / 100** + "Sangat baik".
- Six mini-stats: consented % · pending % · none % · permintaan hapus · DPIA
  aktif · vendor dinilai.
- **Three trust cards** (aqua/tertiary icons) framing the enterprise pitch:
  - **Enkripsi AES-256** — consent DB encrypted at-rest & in-transit, immutable.
  - **Residensi data: AWS Jakarta** — region ap-southeast-3 (Indonesia).
  - **DPO terkelola** — Compliance-as-a-Service: DPO consultation + managed
    right-to-delete.
- Right-to-delete queue (Tolak / Proses) + audit trail.

### Jejak Persetujuan (consent audit trail)
An AES-256 / immutable banner over a table that logs, per opt-in, the
**timestamp, IP address, capture channel, policy version, and source** — the
"immutable audit log for every contact" the spec calls for. Columns: Kontak ·
Sumber · Channel (dot) · IP (mono) · Waktu WIB · Versi · Status.

### DPIA
Data Protection Impact Assessment log — one row per business process that
handles personal data (process, data category, risk level, mitigation count,
DPO owner, date, status). "Buat DPIA" creates a new entry (toast).

### Risiko Vendor
Third-party vendor risk assessments: vendor, category, risk-score bar, **DPA
signed** status, **data residency** region, last review.

### Laporan (audit report generator)
A `ReportGenerator` that **auto-generates regulator-ready documentation**:
pick report type (Laporan Audit PDPA / Log DPIA / Penilaian Risiko Vendor /
Laporan Persetujuan) + period → shows a live "what's included" checklist with
real record counts → generate (900 ms) → **Unduh PDF**. Framed as
"siap-regulator — dapat diserahkan ke KOMDIGI / Lembaga PDP." Plus a list of
recently generated reports.

## Data

- `consent-log.json` entries now carry `channel` + `ip` (deterministic, no RNG
  shift to other files).
- `dpia.json` (7 assessments) and `vendors.json` (8 vendors incl. Meta BSP,
  AWS Jakarta, Tokopedia, SendGrid…) generated at the end of the seed script.
- Hooks: `useDpia()`, `useVendors()` alongside `useConsentLog()`.

## `/settings`

Lean overview with four tabs (Umum / Pengguna / Integrasi / Tagihan) and a
click-through card to the compliance suite. Reachable from the profile dropdown.

## Files

```
app/(app)/settings/page.tsx
app/(app)/settings/compliance/page.tsx     5-tab GRC workspace + ReportGenerator
lib/types.ts                               +ConsentEntry.{channel,ip}, DpiaEntry, VendorRisk, RiskLevel
lib/mock-data/{dpia,vendors}.json          generated datasets
scripts/generate-mock-data.ts              +consent fields, DPIA, vendor risk
lib/api-mock/{data,hooks}.ts               +dpia / vendors accessors + hooks
```
