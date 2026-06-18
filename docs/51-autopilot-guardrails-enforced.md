# 51 — Autopilot guardrails benar-benar ditegakkan

**Temuan audit (LOGIC-AUDIT #4, critical):** Panel Guardrails di `/autopilot` mengumpulkan tiga setelan keamanan ke `config.guardrails`, tapi orchestrator **tidak pernah membacanya** (`lib/autopilot/orchestrator.ts` punya 0 referensi ke `config.guardrails`). Artinya tiga switch keamanan diam-diam tidak melakukan apa pun:

- "Maks. koneksi LinkedIn / hari" → diabaikan; bisa blast melewati batas aman → **risiko ban LinkedIn**.
- "Jam tenang" → diabaikan; kirim kapan saja.
- "Jeda sebelum kirim pesan" (human-in-the-loop) → diabaikan; **DM terkirim tanpa persetujuan**.

Switch keamanan yang tidak berfungsi lebih berbahaya daripada tidak ada switch — operator merasa aman padahal tidak.

## Yang diperbaiki

Ketiga guardrail sekarang ditegakkan di orchestrator:

1. **Jam tenang (Asia/Jakarta).** Sebelum step 1, orchestrator menghitung jam dinding Jakarta (`jakartaHHMM()` via `toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta" })`) dan mengecek window `quietHoursStart`–`quietHoursEnd`. `withinWindow()` menangani window yang melewati tengah malam (mis. 20:00–08:00). Jika aktif, run **dihentikan di awal** dengan pesan jelas — tidak membakar token AI untuk draf yang tak boleh dikirim. Jujur pada janji panel "tidak mengirim".

2. **Cap LinkedIn / hari.** Setelah seleksi audiens (tiap prospek = 1 connection request), `selected` dipotong ke `maxLiPerDay`. Jumlah yang dipangkas disurfacekan di detail step "Pilih audiens" (`· dibatasi guardrail LinkedIn N/hari (dari M)`), jadi operator tahu cap-nya menggigit.

3. **Jeda sebelum kirim DM (human-in-the-loop).** Sebelum step 6 (`send-intro-dms`), jika toggle ON, run masuk status `"paused"`, memunculkan baris "Menunggu persetujuan", dan **memblokir** sampai operator menekan "Lanjutkan kirim" (atau "Batalkan"). Tidak ada satu DM pun terkirim sebelum persetujuan.

## Mekanik pause/resume

- Store (`lib/stores/autopilot-store.ts`): tambah aksi `resumeRun()` — membalik `"paused"` → `"running"` (no-op kalau bukan paused). Status `"paused"` bukan terminal, jadi tidak di-persist / tidak set `finishedAt`.
- Orchestrator: `waitWhilePaused()` mem-poll store (pola yang sama dengan `isStopped()`), jadi tanpa plumbing callback baru. Saat resume → lanjut; saat stop → `emitStopped()` + keluar.
- Page (`app/(app)/autopilot/page.tsx`): state `paused` + `busy = running || paused`. Hero + AudiencePicker + GuardrailsPanel terkunci selama `busy` (audiens tak bisa diedit di tengah run). Banner amber "Autopilot dijeda" muncul saat paused dengan tombol **Lanjutkan kirim** (→ `resumeRun()`) dan **Batalkan** (→ `stopRun()`).

## Definisi selesai (dari audit)

- ✅ baca guardrails sebelum step send
- ✅ pause + status `"paused"` bila toggle ON
- ✅ cap `min(audienceCap, maxLiPerDay)`
- ✅ skip jam tenang Asia/Jakarta

## Catatan

Tanpa scheduler, jam tenang **menghentikan** run (bukan menunda sampai pagi) — paling jujur untuk prototype: operator menjalankan lagi di luar jam tenang. Kalau nanti ada job runner, ini bisa jadi penundaan terjadwal.
