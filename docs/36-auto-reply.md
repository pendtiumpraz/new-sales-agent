# Doc 36 — Auto-reply + escalation (agent runs itself)

Status: **terpasang & terverifikasi.** Inti "agen jalan sendiri": untuk
percakapan yang menunggu balasan, agen **menyusun balasan, menilai keyakinannya,
lalu memutuskan** — auto-kirim (yakin + aman + di-opt-in) atau **escalate ke
manusia** (ragu / topik sensitif / auto-send mati).

## SAFETY default

Auto-send **OFF** secara default. Tanpa `AUTO_REPLY_AUTOSEND=1`, **semua**
kandidat di-escalate (draft-only) — agen tidak pernah mengirim sendiri sampai
operator opt-in. Threshold via `AUTO_REPLY_CONFIDENCE` (default `0.7`).

## Cara kerja (`runAutoReply`)

1. Ambil percakapan `unread > 0`; kandidat = yang pesan terakhirnya **masuk**
   (`direction=in`) dan belum pernah ditangani (idempotent per `message_id`).
2. AI (metered, grounded ke KB) mengembalikan **JSON terstruktur**:
   `{reply, confidence 0..1, escalate, reason, category}`.
3. **Guardrail deterministik**: kalau pesan menyentuh topik sensitif
   (refund/batal/komplain/marah/hukum/nego/"bicara dengan manusia") → **paksa
   escalate**, apa pun confidence AI.
4. Keputusan: `kirim = bukan-escalate && confidence ≥ threshold && AUTO_REPLY_AUTOSEND && channel-siap`.
   - **Kirim** → WhatsApp (WAHA) / email (`send_job`), catat pesan keluar +
     `unread=0`, `auto_reply_event.decision=sent`.
   - **Escalate** → tidak kirim; `decision=escalated` (ini **antrian review
     manusia**, balasan disimpan biar bisa dikirim 1-klik nanti).

## File

| File | Isi |
|------|-----|
| `lib/engagement/autoreply.ts` | `runAutoReply` (gate confidence + guardrail), `recentAutoReplyEvents` |
| `app/api/engagement/auto-reply` | GET antrian/log + POST run (guard `campaign.manage`) |
| `lib/inngest/functions.ts` | `auto-reply-cron` (tiap 10 menit) |
| `app/(app)/cadences/page.tsx` | Tombol "Auto-reply" |
| Tabel `auto_reply_event` (migrasi 0009) | Keputusan + antrian escalation + idempotency |

## Verifikasi (DB live)

2 percakapan, autosend ON, threshold 0.5:
- benign ("harga paket Starter?") → **decision=sent**, conf 1, balasan grounded
  "Rp 300.000 per bulan".
- sensitif ("kecewa, mau refund, bicara dengan manusia") → **decision=escalated**
  (conf 1 tapi guardrail menang), reason "topik sensitif → manusia". ✅

## Konfigurasi (.env.local)

```
AUTO_REPLY_AUTOSEND=1        # default off → semua escalate (draft-only)
AUTO_REPLY_CONFIDENCE=0.7    # ambang auto-send
```

## Catatan & berikutnya

- **Channel-siap**: WA butuh `WAHA_*` + kontak punya nomor; email butuh kontak
  punya email (send worker yang kirim).
- **KB wajib di DB** buat penilaian yang grounded; tanpa KB → `judgment` null →
  escalate (aman).
- Antrian escalation (`decision=escalated`) sudah ada via API GET; **UI inbox
  satu-klik-kirim** = polish berikutnya.
- Pertimbangkan rate-limit + jam kerja buat auto-send, dan logging audit
  (sudah lewat `recordAudit` di route).
