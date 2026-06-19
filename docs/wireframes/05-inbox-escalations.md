# Wireframe 05 — Inbox & Eskalasi

Cakupan: Inbox (+thread), Eskalasi AI. Mengikuti `00-redesign-system.md`.

| Halaman | Route | Template |
|---|---|---|
| Inbox | `/inbox` (+`/inbox/[id]`) | C · Split 3-pane |
| Eskalasi AI | `/escalations` | B · Antrean |

---

### Inbox — `/inbox` · Template: C (3-pane split)
**Tujuan:** balas percakapan omni-channel (WA/email/IG/LinkedIn/SMS) + handoff AI↔manusia.
**Aksi utama:** **Kirim balasan** (composer) — sekunder: Ambil alih.
**Masalah sekarang:**
- Buka/balas dulu tak clear unread (badge nyala selamanya) → **sudah** (mark-read on open).
- Switch auto-reply per-percakapan dulu toggle GLOBAL → **sudah** per-conversation.
- Composer treat semua non-email sebagai WhatsApp → kini channel-aware (placeholder per channel).

```
┌ Inbox ───────────────┬ Percakapan ─────────────────────────────┬ Handoff & Sentimen ──┐
│ 🔎 cari…             │ ◯ Budi · WA · PT Astra   [😊 +28]        │ Sentimen: 😊 +28 ▁▂▃ │
│ [Semua WA Email IG…] │  ───────────────────────────────────────│ Balasan AI terakhir: │
│ • Budi  · 2m   ②     │  Pelanggan: minat paket Growth          │   6 menit lalu       │
│ • Sari  · 1j        │  Anda: Baik, saya kirim detail…         │ Pemicu aktif: —      │
│ • …                 │  ───────────────────────────────────────│ [Ambil alih]         │
│                     │  [😊 balasan cepat]  [Tulis pesan WA… ] ▸│ Auto-reply (percakap.│
│                     │   ↑ placeholder & bubble per CHANNEL      │  ini): [●  ]         │
└─────────────────────┴──────────────────────────────────────────┴──────────────────────┘
```
**Perubahan kunci:**
- 3-pane jelas: daftar (unread badge yang **hilang saat dibuka**) · thread channel-aware · panel handoff/sentimen.
- Auto-reply switch berlabel "(percakapan ini)" + status mengikuti/override global.
- Banner pemicu handoff hanya saat relevan; "Ambil alih" sebagai aksi sekunder menonjol bila pemicu aktif.
**States:** no-selection → "Pilih percakapan"; empty list → "Belum ada percakapan"; loading → skeleton bubbles; error → retry.
**Mobile:** **list → thread full-screen** (back ‹); panel handoff jadi sheet dari ikon.

---

### Eskalasi AI — `/escalations` · Template: B (antrean)
**Tujuan:** tinjau balasan AI yang perlu manusia (sentimen turun / topik kompleks / timeout).
**Aksi utama:** **Tinjau & balas** (per item) — atau "Setujui draf AI".
**Masalah sekarang:**
- "Riwayat" bisa diam-diam drop history (limit-then-filter) → perlu query terpisah.
- `CURRENT_AGENT='Anda'` hardcoded, tak ada ownership; tak per-rep/workspace.

```
┌ Eskalasi AI                                   Workspace: Ekspor ▾   [ Antrean | Riwayat ]┐
│ 🔎 cari…   [Alasan ▾: sentimen/kompleks/timeout]   ↕ terbaru                            │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐│
│ │ ◯ Reza · WA · PT Sinar   alasan: refund   😞 −42        draf AI: "Mohon maaf…"        ││
│ │     [Lihat percakapan]              [Edit draf]  [Setujui & kirim]  [Tandai selesai]  ││
│ └────────────────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** tab **Antrean | Riwayat** sebagai **query terpisah** (history tak hilang); tiap item tampil alasan + sentimen + draf AI + aksi langsung; catat siapa resolve (ownership); scope per-rep/workspace.
**States:** empty → "Tidak ada eskalasi — AI menangani semua 🎉"; loading → skeleton; error → retry.
**Mobile:** kartu per eskalasi; aksi sebagai tombol penuh-lebar.
