# Maira Sales — Re-Wireframe Spec (semua halaman)

Spec desain ulang UX **(markdown saja, belum ada kode)**. Tujuannya menjawab
"kenapa terasa gak user-friendly" dan menetapkan satu sistem layout yang ditaati
seluruh 42 halaman, lalu wireframe per-halaman.

**Baca berurutan:**

1. **[00 — Master Design System](00-redesign-system.md)** ⭐ baca dulu
   - Diagnosis sistemik · prinsip · IA/nav baru · tata letak global · pola komponen · template per tipe · format wireframe · sistem visual.

Lalu wireframe per cluster:

| Dok | Cakupan | Halaman |
|---|---|---|
| [01 — Beranda & Wawasan](01-home-reports.md) | Dashboard, Laporan, Asisten AI | 3 |
| [02 — Lead & Kontak](02-leads-contacts.md) | Kontak, Profil, Discovery, Peta, Profil-kontak | 5 |
| [03 — Pipeline & Penawaran](03-pipeline-quotes.md) | Pipeline, Penawaran (+editor), Riset Prospek | 4 |
| [04 — Cadence & Autopilot](04-cadences-autopilot.md) | Cadence (+new, +detail), Autopilot | 4 |
| [05 — Inbox & Eskalasi](05-inbox-escalations.md) | Inbox (+thread), Eskalasi | 3 |
| [06 — Retensi · E-com · Konten · Lapangan](06-retention-ecom-content-field.md) | Retensi (+flow), E-commerce, Konten, Field (+visits) | 6 |
| [07 — Workspace · Tim · Marketplace · Panduan](07-workspaces-team-marketplace-docs.md) | Workspaces (+hub), Monitoring, Marketplace, Panduan, Use-case | 6 |
| [08 — Pengaturan (unified)](08-settings.md) | Pengaturan + 10 sub-section | 11 |

**Total: 42 halaman.**

## 3 perubahan struktural terbesar
1. **Sidebar 18 item → 5 seksi berorientasi-tugas** (Cari → Jangkau → Closing → Pantau → Atur) + Command Palette ⌘K. Sub-halaman (Profil/Discovery/Peta) jadi **tab di dalam** induk, bukan item nav.
2. **Satu bahasa layout** untuk semua: PageHeader (1 primary action) · Toolbar/BulkBar · DataTable/Card · Empty/Loading/Error. Hilangkan "tiap halaman beda dialek".
3. **Pengaturan 11 tujuan → 1 halaman + sub-nav kiri.**

## Langkah berikutnya (setelah disetujui)
Implementasi **bertahap**: bangun komponen bersama dulu (PageHeader, Toolbar/BulkBar, DataTable, EmptyState, CommandPalette, SettingsShell, Sidebar baru), lalu migrasi halaman cluster demi cluster (01→08) dengan `tsc`+`lint` tiap langkah. Belum ada kode yang diubah pada tahap spec ini.
