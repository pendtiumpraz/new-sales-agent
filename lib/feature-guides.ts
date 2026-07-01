import type { Guide } from "@/components/shared/feature-guide";

/**
 * FEATURE_GUIDES — central, accurate Bahasa Indonesia tutorial content for every
 * main feature page. Keyed by a short slug; each page renders its own via
 * `<FeatureGuide guide={FEATURE_GUIDES.xxx} />` in the page header.
 *
 * Content is grounded in what each page ACTUALLY does (read from the page's
 * doc-comment + main actions), not invented. The through-line is the product
 * spine: crawl (Discovery) → CRM (Contacts/Pipeline) → closing (Inbox/Penawaran),
 * with 1 workspace = 1 produk.
 */
export const FEATURE_GUIDES: Record<string, Guide> = {
  dashboard: {
    title: "Dashboard",
    tagline: "Ringkasan lead & prioritas hari ini",
    what: "Ringkasan aktivitas sales: KPI lead baru, total kontak, skor fit rata-rata, dan kuota token AI — semua dihitung dari data lead nyata di tenant-mu, bukan angka contoh.",
    steps: [
      "Lihat KPI di atas: lead baru 7 hari terakhir, total kontak, skor fit rata-rata, dan sisa kuota AI.",
      "Baca Funnel pipeline untuk melihat berapa lead yang sudah di-skor, terklasifikasi, dan fit tinggi.",
      "Kerjakan Tugas prioritas hari ini — daftar lead fit tertinggi; klik Buka untuk masuk ke Inbox.",
      "Cek Kontak terbaru; klik Lihat semua untuk kelola penuh di modul Kontak.",
      "Klik Buka Workspace untuk mulai mengatur produk & mencari lead baru.",
    ],
    flow: "Dashboard adalah cermin seluruh spine crawl→CRM→closing: angka di sini baru terisi setelah kamu discovery lead, meng-enrich & mengklasifikasinya, lalu menutup deal.",
    tips: [
      "Skor fit ≥75 = prospek panas, dahulukan.",
      "Angka kosong (—) artinya lead belum di-skor — jalankan klasifikasi di Pengayaan Data.",
    ],
  },

  workspace: {
    title: "Workspace",
    tagline: "1 workspace = 1 produk",
    what: "Hub tempat semua aktivitas sales fokus pada satu produk: produk yang dijual, analisis market-fit (B2B/B2C/mix), funnel, kontak yang didapat, dan Sales Play.",
    steps: [
      "Buat/pilih workspace (1 workspace = 1 produk), lalu hubungkan produk yang dijual di tab Produk.",
      "Buka tab Market-Fit dan klik Analisis untuk menentukan tipe pasar (B2B/B2C/mix), ICP, dan segmen target.",
      "Di tab Sales Play, atur channel, tone, dan teknik closing yang dipakai orkestrator obrolan.",
      "Klik Cari kontak (Discovery) untuk mengisi kontak; pantau di tab Kontak (Semua/B2C/B2B).",
      "Lihat tab Teknik Closing untuk teknik yang kebuka sesuai tipe pasar, dan tab Funnel untuk ringkasan.",
    ],
    flow: "Workspace adalah jantung spine: market-fit di sini menentukan playbook discovery (mau crawl siapa) dan teknik closing yang dipakai AI saat menutup di Inbox.",
    tips: [
      "Teknik closing agresif otomatis dikunci menjadi B2C-only.",
      "Produk boleh dihubungkan belakangan — cukup beri nama workspace dulu.",
    ],
  },

  contacts: {
    title: "Kontak & Lead",
    tagline: "CRM semua lead yang diakuisisi",
    what: "Daftar semua kontak/lead yang sudah didapat, lengkap dengan segmentasi B2C vs B2B, skor fit, dan status pengayaan (enrichment) datanya.",
    steps: [
      "Saring lewat tab segmen (Semua/B2C/B2B/Belum), status enrichment, sumber, atau kotak cari.",
      "Klik satu baris untuk membuka drawer profil: data kontak, klasifikasi segmen, skor fit, dan data enrichment.",
      "Di drawer, jalankan Enrich untuk melengkapi data, atau override segmen B2C/B2B secara manual.",
      "Lihat tab Aktivitas/Deal/Catatan di drawer untuk timeline dan deal terkait kontak.",
      "Impor / Discovery untuk menambah kontak baru; hapus ke Sampah, pulihkan, atau hapus permanen.",
    ],
    flow: "Kontak adalah tahap CRM di spine crawl→CRM→closing: lead dari Discovery/Enrichment mendarat di sini, lalu naik ke Pipeline & Inbox untuk ditutup.",
    tips: [
      "Skor fit membantu prioritas — dahulukan yang tinggi.",
      "Kontak berstatus 'Belum' bisa dilengkapi lewat modul Pengayaan Data.",
    ],
  },

  enrichment: {
    title: "Pengayaan Data",
    tagline: "Lengkapi, klasifikasi, lalu push ke Contacts",
    what: "Antrean lead mentah hasil Discovery: lengkapi datanya (email/HP/profil), klasifikasi otomatis B2C/B2B + skor fit, lalu dorong ke CRM Contacts.",
    steps: [
      "Di tab Enrichment, pilih lead di antrean lalu jalankan Enrich untuk melengkapi field (lihat diff sebelum/sesudah di drawer).",
      "Klik Klasifikasi agar AI menandai B2C/B2B + skor fit; override manual di drawer bila perlu.",
      "Klik Push ke Contacts untuk memindahkan lead yang sudah lengkap ke CRM.",
      "Buka tab Riwayat untuk melihat run discovery sebelumnya.",
      "Kelola Sampah per tab: pulihkan atau hapus permanen record.",
    ],
    flow: "Pengayaan Data adalah jembatan crawl→CRM: hasil crawl Discovery masuk ke sini untuk dibersihkan & diklasifikasi sebelum menjadi kontak siap-closing.",
    tips: [
      "Discovery (cari lead) ada di Kontak → Discovery; hasilnya jatuh ke antrean ini.",
      "Klasifikasi memakai katalog Master Data (industri/pekerjaan).",
    ],
  },

  masterData: {
    title: "Master Data — Industri & Pekerjaan",
    tagline: "Katalog klasifikasi AI",
    what: "Katalog industri & pekerjaan yang dipakai AI untuk mengklasifikasi perusahaan & orang hasil crawl — gabungan base bawaan (read-only) dan tambahanmu (AI/manual).",
    steps: [
      "Pilih tab kategori: Industri, Pekerjaan, Antrian review (usulan AI), atau Sampah.",
      "Saring per sumber: Semua / Base (bawaan) / AI / Manual.",
      "Klik baris untuk Lihat (Base) atau Edit (punyamu) — ubah nama, nama EN, atau induk.",
      "Di Antrian review, setujui atau tolak entri buatan AI; gabungkan (merge) duplikat ke satu entri.",
      "Tambah entri manual lewat tombol di header; kelola Sampah (restore / hapus permanen).",
    ],
    flow: "Master Data adalah kamus di tahap crawl→CRM: setiap perusahaan/orang yang dicrawl diklasifikasi ke katalog ini agar segmentasi & filter di Contacts/Profil konsisten.",
    tips: [
      "Entri Base dipakai bersama semua tenant & tidak bisa diedit.",
      "Entri baru buatan AI perlu di-review dulu sebelum dianggap valid.",
    ],
  },

  pipeline: {
    title: "Pipeline · Deal",
    tagline: "Papan kanban CRM per tahap",
    what: "Papan kanban deal per tahap closing. Tiap kartu = satu deal yang dikaitkan ke kontak, dengan badge segmen B2C/B2B yang ikut dari kontaknya.",
    steps: [
      "Pilih/buat pipeline (papan) untuk workspace ini; tambah tahap bila perlu.",
      "Klik Deal baru untuk menambah deal dan kaitkan ke kontak.",
      "Klik kartu untuk membuka detail di drawer kanan, lalu pindah tahap dari sana.",
      "Tandai deal Won/Lost saat closing selesai; filter per segmen bila perlu.",
      "Hapus deal ke Sampah, pulihkan, atau hapus permanen (purge).",
    ],
    flow: "Pipeline adalah tahap closing di spine: kontak fit-tinggi dari CRM menjadi deal di sini dan dijalankan sampai menang, sinkron dengan obrolan di Inbox.",
    tips: [
      "Segmen kartu mengikuti kontak, bukan deal.",
      "Filter workspace untuk fokus ke satu produk.",
    ],
  },

  inbox: {
    title: "Inbox",
    tagline: "Percakapan WhatsApp & Email",
    what: "Ruang percakapan tiga kolom: daftar percakapan, thread chat (WA & email dalam satu tampilan), dan panel konteks kontak + kesiapan closing.",
    steps: [
      "Pilih percakapan di kolom kiri (saring Semua/Belum dibaca/WA/Email atau cari).",
      "Baca thread di tengah; balas lewat composer atau sisipkan template dari Konten.",
      "Atur mode balasan WA: AI auto (dibalas otomatis) atau Manual.",
      "Di panel kanan, lihat kontak, override segmen B2C/B2B, deal terkait, dan gauge kesiapan closing.",
      "Arsipkan percakapan ke Sampah, pulihkan, atau hapus permanen.",
    ],
    flow: "Inbox adalah ujung closing di spine crawl→CRM→closing: di sinilah orkestrator AI (value-first, humanizer, teknik closing) menjalankan percakapan dan mengeskalasi ke manusia saat perlu.",
    tips: [
      "Mode Manual mematikan balasan otomatis AI.",
      "Komplain/negosiasi berat otomatis dialihkan ke Eskalasi & Handoff, bukan jadi error.",
    ],
  },

  cadences: {
    title: "Cadence",
    tagline: "Urutan follow-up otomatis",
    what: "Urutan langkah follow-up otomatis yang menuntun kontak lintas channel (WhatsApp/Email/Telepon) dengan jeda sebelum tiap step.",
    steps: [
      "Klik Cadence baru untuk membuat urutan bernama.",
      "Klik baris cadence untuk membuka drawer, lalu tambah/edit step (channel, jeda, subjek, template).",
      "Daftarkan (enroll) kontak ke cadence — step pertama otomatis terjadwal.",
      "Pantau jumlah enrolled per cadence dan ubah nama/status bila perlu.",
      "Hapus ke Sampah, pulihkan, atau hapus permanen (cascade ke step & enrollment).",
    ],
    flow: "Cadence adalah mesin nurturing di tahap CRM→closing: kontak yang belum siap ditutup dijaga hangat lewat sentuhan terjadwal sampai membalas di Inbox.",
    tips: [
      "Tiap step menunggu jeda-nya lalu mengirim template.",
      "Template pesan dikelola di modul Konten.",
    ],
  },

  penawaran: {
    title: "Penawaran",
    tagline: "Quote-to-cash ke pelanggan",
    what: "Dokumen penawaran/quote ke pelanggan — AI menyusun isinya, dikirim via email, dan halaman publiknya melacak status dibuka/diterima. 1 penawaran = 1 dokumen.",
    steps: [
      "Klik Buat penawaran untuk membuat draft, lalu buka editornya.",
      "Susun item & harga (AI membantu menyusun) di halaman editor penawaran.",
      "Kirim via email ke pelanggan; pantau status (dibuka/diterima) dari halaman publik.",
      "Lihat ringkasan angka dari daftar penawaran Aktif.",
      "Arsipkan ke Sampah dan pulihkan bila perlu.",
    ],
    flow: "Penawaran adalah langkah quote-to-cash di ujung closing: setelah deal di Pipeline matang, penawaran resmi dikirim untuk menutup transaksi.",
    tips: [
      "Belum ada hapus permanen untuk penawaran — Sampah hanya menyediakan pulihkan.",
      "Nomor & total dihitung otomatis dari daftar.",
    ],
  },

  autopilot: {
    title: "Autopilot",
    tagline: "Riwayat run orkestrasi AI",
    what: "Riwayat run orkestrasi AI atas percakapan & kontak — status, mode, durasi, dan jejak log per langkah. Lifecycle-nya dijalankan oleh orkestrator AI, bukan diketik manual.",
    steps: [
      "Saring run per status atau mode, atau cari run tertentu.",
      "Klik Mulai run untuk mencatat run orkestrasi AI (opsional dikaitkan ke percakapan).",
      "Klik baris untuk membuka drawer: status, meta, dan jejak log terstruktur.",
      "Pantau ringkasan tiap run di tabel (Status · Mode · Trigger · Dimulai · Ringkasan).",
      "Hapus run ke Sampah, pulihkan, atau hapus permanen.",
    ],
    flow: "Autopilot adalah jejak audit dari mesin closing: setiap kali AI mengorkestrasi obrolan di Inbox, prosesnya tercatat di sini untuk ditinjau.",
    tips: [
      "Nilai log tidak dibuat-buat — hanya berasal dari orkestrator nyata.",
      "Kaitkan run ke percakapan untuk konteks lengkap.",
    ],
  },

  escalations: {
    title: "Eskalasi & Handoff",
    tagline: "Antrean take-over manusia",
    what: "Antrean percakapan yang dialihkan AI ke seorang sales — sebagai eskalasi (dengan alasan + prioritas) atau item handoff (antrean take-over) untuk diambil alih manusia.",
    steps: [
      "Pilih sumber antrean: Eskalasi atau Handoff (masing-masing punya Aktif/Sampah).",
      "Klik baris untuk melihat konteks percakapan (transkrip singkat, kontak, channel).",
      "Ambil alih (claim) handoff, atau ubah status/prioritas/assignee eskalasi.",
      "Tandai selesai (resolve/done) setelah ditangani; tambah catatan resolusi.",
      "Hapus ke Sampah, pulihkan, atau hapus permanen.",
    ],
    flow: "Eskalasi adalah katup pengaman di ujung closing: saat AI kena komplain/negosiasi/kredit habis, percakapan dialihkan ke sini — bukan error — agar manusia yang menutup.",
    tips: [
      "Prioritas membantu mengurutkan antrean yang paling mendesak.",
      "Assignee bisa dipilih dari anggota tim.",
    ],
  },

  content: {
    title: "Konten",
    tagline: "Template pesan & kalender editorial",
    what: "Pustaka template pesan/konten plus perencanaan (kalender editorial) — sumber teks yang dipakai balasan Inbox, Cadence, dan blast.",
    steps: [
      "Di tab Template, buat/sunting template pesan di drawer kanan.",
      "Di tab Rencana, tambah item rencana konten di kalender bulanan (atau list).",
      "Pakai template saat membalas di Inbox atau menyusun step Cadence.",
      "Kelola status & jadwal item rencana konten.",
      "Hapus ke Sampah, pulihkan, atau hapus permanen.",
    ],
    flow: "Konten memasok bahasa untuk seluruh spine: template di sini dipakai di titik outreach (Cadence) dan closing (Inbox) agar pesan konsisten.",
    tips: [
      "Template bisa disisipkan langsung dari composer Inbox.",
      "Kalender rencana membantu menjaga ritme konten.",
    ],
  },

  retention: {
    title: "Retensi & Win-back",
    tagline: "Jaga & menangkan kembali pelanggan",
    what: "Flow otomatis untuk menjaga dan memenangkan kembali pelanggan — atur pemicu, segmen, dan langkah per channel (WA/email/telepon/SMS) beserta penawarannya.",
    steps: [
      "Klik Buat flow lalu isi form di drawer (nama, jenis, segmen, pemicu).",
      "Di drawer yang sama, susun step: channel, jeda, penawaran (offer), template.",
      "Aktifkan flow; pantau di grid kartu per jenis/segmen/status.",
      "Saring lewat toolbar kind/segment/status + cari.",
      "Hapus ke Sampah, pulihkan, atau hapus permanen (cascade ke step).",
    ],
    flow: "Retensi menutup lingkaran setelah closing: pelanggan yang sudah beli (dari Pipeline/E-Commerce) dijaga & di-winback agar kembali membeli.",
    tips: [
      "Offer pada step membuat win-back lebih menarik.",
      "Segmen menentukan siapa yang masuk ke flow.",
    ],
  },

  ecommerce: {
    title: "E-Commerce",
    tagline: "Pesanan marketplace & recovery keranjang",
    what: "Pesanan dari marketplace (Tokopedia/Shopee/TikTok Shop) plus pemulihan keranjang yang ditinggalkan — recovery satu klik lewat WhatsApp.",
    steps: [
      "Buka tab Pesanan untuk melihat order per channel dengan status.",
      "Buka tab Keranjang untuk item yang ditinggalkan (nilai + usia abandoned).",
      "Klik recovery WA satu klik: mencatat nudge + membuka draft wa.me ke pembeli.",
      "Tandai keranjang Recovered saat pembeli menyelesaikan pembelian.",
      "Hapus pesanan/keranjang ke Sampah, pulihkan, atau hapus permanen.",
    ],
    flow: "E-Commerce menyambungkan transaksi marketplace ke spine closing: keranjang yang hampir gagal diselamatkan lewat WhatsApp — channel closing utama.",
    tips: [
      "Recovery membuka draft WA berisi pesan siap kirim ke pembeli.",
      "Tiap nudge tercatat sebagai attempt.",
    ],
  },

  marketplace: {
    title: "Marketplace Data",
    tagline: "Jual-beli data perusahaan antar-tenant",
    what: "Bursa data firmografis antar-tenant: jual dataset perusahaan hasil crawl-mu, atau beli dataset tenant lain — langsung terimpor ke CRM-mu. Ini bursa DATA, bukan integrasi channel.",
    steps: [
      "Buka tab Jelajah untuk melihat listing dataset perusahaan dari tenant lain.",
      "Klik Beli pada sebuah listing — perusahaannya langsung terimpor ke graf CRM-mu.",
      "Klik Jual data untuk membuat listing dari data perusahaan hasil crawl (lihat preview jumlah).",
      "Kelola listing di tab Listing Saya (pause/resume).",
      "Kelola Sampah: pulihkan atau hapus permanen listing.",
    ],
    flow: "Marketplace Data memperluas tahap crawl: alih-alih crawl sendiri, kamu bisa membeli data perusahaan siap-pakai untuk mengisi CRM, lalu enrich & closing seperti biasa.",
    tips: [
      "Hanya data perusahaan (firmografis) yang lintas tenant — kontak pribadi tidak (UU PDP).",
      "Preview menampilkan jumlah perusahaan sebelum kamu menjual.",
    ],
  },

  field: {
    title: "Sales Lapangan",
    tagline: "Kunjungan & check-in tim",
    what: "Kunjungan lapangan & check-in tim sales — siapa, di mana, dan statusnya, lengkap dengan check-in ber-geo-stamp per kunjungan.",
    steps: [
      "Klik Kunjungan baru untuk menjadwalkan kunjungan (rep, lokasi, tujuan).",
      "Saring lewat toolbar status/purpose + cari.",
      "Klik baris untuk membuka drawer: info kunjungan, peta, dan timeline check-in.",
      "Catat check-in/check-out dari drawer; ubah status/outcome.",
      "Hapus ke Sampah, pulihkan, atau hapus permanen (cascade ke check-in).",
    ],
    flow: "Sales Lapangan adalah tahap closing offline: kontak/perusahaan dari CRM dikunjungi langsung, dan hasil kunjungan memperkaya deal di Pipeline.",
    tips: [
      "Check-in ber-geo-stamp menjadi bukti kunjungan.",
      "Kaitkan kunjungan ke kontak/perusahaan yang sudah ada.",
    ],
  },

  reports: {
    title: "Laporan & Analitik",
    tagline: "Dasbor agregat real-time",
    what: "Dasbor agregat real-time atas kontak, deal, percakapan, kesiapan closing, pesanan, & kunjungan lapangan. Angka dihitung live dari tabel nyata — tidak dibuat-buat.",
    steps: [
      "Baca stat strip & kartu KPI di atas untuk gambaran menyeluruh.",
      "Telusuri roll-up per modul (CRM, inbox, sales, e-commerce, field).",
      "Sesuaikan tampilan/filter sesuai yang ingin dipantau.",
      "Klik Simpan laporan untuk menyimpan konfigurasi tampilan favorit.",
      "Kelola laporan tersimpan: Sampah, pulihkan, atau hapus permanen.",
    ],
    flow: "Laporan adalah cermin seluruh spine crawl→CRM→closing: setiap angka berasal dari aktivitas nyata di modul lain, jadi ini tempat mengukur kesehatan pipeline.",
    tips: [
      "Metrik dihitung live — tidak ada nilai palsu.",
      "Simpan tampilan yang sering kamu pantau agar cepat diakses.",
    ],
  },

  settings: {
    title: "Pengaturan",
    tagline: "Kelola workspace, tim & integrasi",
    what: "Pusat pengaturan tenant: workspace, tim & akses (RBAC), model AI, mailbox, knowledge base, extension, kepatuhan, dan integrasi lain.",
    steps: [
      "Pilih area yang mau diatur dari kartu/daftar pengaturan.",
      "Kelola Tim & Akses: undang anggota, atur peran & seat.",
      "Atur AI & Model (1 model aktif untuk seluruh tenant, BYOK) dan Knowledge Base.",
      "Hubungkan Mailbox (SMTP/OAuth/ESP) dan Extension (gateway WA + collector).",
      "Cek Kepatuhan (UU PDP) & Billing untuk paket dan kuota.",
    ],
    flow: "Pengaturan menyalakan mesin di balik spine: model AI, knowledge base, mailbox, dan extension yang dipakai discovery, outreach, dan closing semuanya diatur di sini.",
    tips: [
      "1 model AI aktif berlaku untuk semua workspace.",
      "Knowledge Base menjadi sumber kebenaran jawaban AI.",
    ],
  },

  billing: {
    title: "Billing & Kuota",
    tagline: "Paket, kredit AI & pemakaian",
    what: "Paket aktif, saldo kredit AI, dan pemakaian terhadap kuota — plus upgrade paket & portal langganan.",
    steps: [
      "Lihat paket aktif dan saldo kredit AI di header.",
      "Pantau pemakaian terhadap kuota (seat, kontak, AI, WA).",
      "Klik Upgrade untuk pindah paket bila kuota mepet.",
      "Buka portal langganan untuk mengelola pembayaran.",
      "Isi ulang kredit AI saat saldo menipis.",
    ],
    flow: "Billing menjaga mesin tetap menyala: kredit AI $0 membuat balasan AI di Inbox degrade dengan anggun (tidak error), jadi pantau saldo agar closing tidak terhenti.",
    tips: [
      "Saldo kredit $0 tidak menampilkan 'token habis' — AI degrade halus.",
      "Kuota mencakup seat, kontak, token AI, dan pesan WA.",
    ],
  },
};
