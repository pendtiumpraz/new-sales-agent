# Architecture Decisions — Agentic Sales AI (Rebuild)

> Catatan keputusan arsitektur (ADR ringkas). Loop & sub-agent WAJIB baca ini
> sebelum kerja, dan tulis keputusan baru ke sini. Format: tanggal — keputusan — alasan — oleh.

---

## Sudah firm (dari kondisi repo sekarang, dipertahankan di rebuild)

- `2026-06-28` — **No foreign keys di DB** — sudah 0 `.references()` di `lib/db/schema.ts`; sesuai Rule 2. — repo
- `2026-06-28` — **snake_case tabel/kolom** — sudah dipakai (`kb`, `deals`, `contacts`…); sesuai Rule 14. — repo
- `2026-06-28` — **Multi-tenant grain = tenant/akun** (bukan per-user) untuk aktivasi/quota/credit. — repo + memory
- `2026-06-28` — **AI multi-provider BYOK + metered** (registry/adapter/meter) dipertahankan. — repo
- `2026-06-28` — **Push hanya ke `pendtiumpraz HEAD:main`**; remote `origin` (almira) dihapus. — user
- `2026-06-28` — **Stack = Next.js 14 full-stack (TS)**, modular monolith via `modules/<domain>/{schema,repo,service,api}`. **BUKAN** ganti framework / split backend+frontend. Rebuild = bikin ulang bersih (buang lapisan mock) di stack yang sama. — user
- `2026-06-28` — **Snapshot prototype lama DIBUAT** sebelum restructure: tag `pre-loop-rebuild` + branch `archive/pre-loop-rebuild`, dua-duanya di `5ecac8f`. Demo lama selalu bisa di-checkout balik. (Belum di-push; lokal dulu.) — AI/user
- `2026-06-28` — **DESIGN-FIRST (WAJIB, non-negotiable)** — tiap page WAJIB lewat HTML wireframe (low-fi) → user approve → HTML mockup (high-fi, clickable, navigable) → user approve, **SEBELUM** kode apa pun ditulis. Output `wireframes/` + `mockups/` di repo root. Ini Fase 02 loop, tapi **berlaku permanen** untuk tiap page baru (juga di Fase 07). Alasan: project lama gak punya wireframe/mockup sama sekali → user mau lihat flow tampilan dulu. — user

- `2026-06-28` — **DB = Neon existing** (`.env.local`); **AI default = DeepSeek** (Anthropic opsional BYOK); **Deploy = Vercel** (VPS ditunda sampai butuh WA 24/7). — user (default diadopsi)
- `2026-06-28` — **Default theme = "Coral Sunset" existing** (`app/globals.css` HSL vars: primary coral `12 96% 67%` #FD7A5C, brand teal #0D9488, tertiary teal `173 80% 40%`, highlight amber `38 92% 50%`, bg warm-white `18 100% 98%`, radius 1rem, Inter, glass chrome). **JANGAN ganti default-nya** — pakai yang sekarang. — user
- `2026-06-28` — **Branding/theme = PER-USER (bukan per-tenant)** — "hanya berlaku untuk user tersebut". Tiap user ubah tampilannya sendiri lewat halaman **`/branding`**: SELURUH token warna (semua `:root` HSL vars, bukan cuma primary) + **logo** + **favicon** + opsi **Custom CSS** penuh. Default tiap user = Coral Sunset; ada reset-to-default + live preview. Diterapkan runtime hanya untuk sesi user itu (inject `:root` override + `<link rel=icon>` per-user). Storage per-user (no FK). — user
  - **Grain pemisah:** appearance/branding = **user**; vertical/entitlements/modul/kuota/aktivasi = **tenant** (lihat [[architecture-rpa-vs-ai]] grain). Dua concern beda.
- `2026-06-28` — **Multi-vertical usage-based onboarding** — saat onboarding tenant pilih vertical/usage (HR/Sales/lainnya) → nge-set modul + entitlements aktif; usage dibatasi per onboarding (grain = tenant). Extends `lib/entitlements.ts` existing. — user
- `2026-06-28` — **Register + superadmin activation** — register publik → tenant `pending` → superadmin activate (durasi+kuota). First-class flow. — user
- `2026-06-28` — **CRM = modul first-class baru** — contacts/companies/deals/activities + pipeline. — user
- `2026-06-28` — **Module 1 (scope awal) = Auth/Tenant/Onboarding** — pages: login, register, pending, superadmin-users, onboarding (vertical + white-label), dashboard shell. Urutan modul: M1 → Workspace+Product → Contacts/CRM → Inbox/WA → Enrichment. — user

## Pending (diputuskan di fase berikutnya)

- ⬜ Detail entity/field per modul (output Fase 01 Planning).
- ⬜ Approval wireframe & mockup Module 1 (Fase 02 gate).

## DB audit (2026-06-28) — sebelum apply schema rebuild

- Migration `0028_magenta_glorian.sql` = **100% additive** (13 CREATE TABLE + index, 0 DROP/ALTER). Nama rebuild sengaja beda dari legacy (`tenant`≠`tenants`, `membership`≠`memberships`, `app_user`≠`users`, suffix `_v2`) → **0 tabrakan**.
- Live Neon: **56 tabel**, ke-13 tabel rebuild **belum ada** (create = murni nambah). Legacy utuh.
- ⚠️ **Live DB dibangun via `db:push`, BUKAN migrate** (`__drizzle_migrations` gak ada) + live(56) > schema.ts(48). Maka:
  - `db:migrate` → GAGAL (coba apply dari 0001).
  - `db:push` → **BERISIKO** (bikin DB match schema → ±8 tabel live-only bisa di-DROP).
  - ✅ **AMAN: jalanin SQL 0028 langsung, transaksional** (cuma CREATE, additive). Pakai metode ini saat apply.
- Status: ✅ **DI-APPLY 2026-06-28** (user authorized eksplisit) via SQL 0028 langsung transaksional. 28 statement, 13 tabel rebuild kebuat, live 56→69, legacy utuh. **Catatan:** DB ini pakai db:push (no migration tracking) → untuk perubahan schema berikutnya, JANGAN db:migrate; pakai db:push hati-hati (cek drop) atau apply SQL migration langsung.

- **Rule 7 (no dummy data)** menghapus seluruh `lib/api-mock/` + `lib/mock-data/` yang sekarang jadi tulang punggung demo. Konsekuensi: tiap layar harus nunggu API beneran + loading state.
- **Struktur**: App Router meng-colokasi server+client; contoh loop pakai split `backend/ frontend/`. Modular monolith tetap bisa di Next.js via `modules/`.
- **Subsistem besar** (WA gateway/extension, billing Stripe, closing-flow AI) sudah "real" — rebuild harus memutuskan: port apa adanya ke struktur modul, atau tulis ulang.
