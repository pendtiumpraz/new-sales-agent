// 17 Teknik Closing (Dewa Eka Prayoga) — seeded into the KB for the closing
// stage. Aggressive techniques are tagged B2C-only so the B2B path stays
// consultative (the market-fit type down-weights them). Source:
// https://kbm.id/book/detail/4791ab79-577e-4d68-a168-97474d5c3093

import type { KbClosingTechnique } from "@/lib/types/kb";

export const CLOSING_TECHNIQUES_17: KbClosingTechnique[] = [
  { id: "ct_pilihan", nama: "Pertanyaan Pilihan", inti: "Kasih pilihan A/B, bukan ya/tidak, biar arah ke transaksi.", contohSkrip: "mau yang paket coba dulu, atau langsung yang hemat?", cocokUntuk: ["B2B", "B2C"], sinyalPemicu: ["mau menutup", "ragu pilih"] },
  { id: "ct_yesset", nama: "Ya...Ya...Ya (Yes Set)", inti: "Pancing pelanggan bilang 'iya' beruntun sampai mudah closing.", cocokUntuk: ["B2B", "B2C"], sinyalPemicu: ["bangun kesepakatan", "awal closing"] },
  { id: "ct_langka", nama: "Kelangkaan", inti: "Stok/slot terbatas — makin langka makin diburu.", cocokUntuk: ["B2C"], sinyalPemicu: ["nunda", "santai"] },
  { id: "ct_nowornever", nama: "Now or Never", inti: "Urgensi waktu/promo hari ini biar nggak ditunda.", cocokUntuk: ["B2C"], sinyalPemicu: ["nunda", "pikir-pikir dulu"] },
  { id: "ct_hargacoret", nama: "Harga Coret", inti: "Tampilkan harga normal lalu harga sekarang → persepsi hemat.", contohSkrip: "normalnya 189rb, hari ini 149rb", cocokUntuk: ["B2C"], sinyalPemicu: ["ditanya harga", "merasa mahal"] },
  { id: "ct_otoritas", nama: "Otoritas", inti: "Pakai kredibilitas, expert, atau bukti/sertifikasi.", cocokUntuk: ["B2B", "B2C"], sinyalPemicu: ["ragu kualitas", "butuh kepercayaan"] },
  { id: "ct_tanyabalik", nama: "Tanya Balik", inti: "Jawab keberatan dengan pertanyaan biar interaksi jalan.", contohSkrip: "boleh tau yang bikin ragu bagian mana?", cocokUntuk: ["B2B", "B2C"], sinyalPemicu: ["objection", "keberatan"] },
  { id: "ct_machinegun", nama: "Machine Gun", inti: "Tanya beruntun sampai pelanggan siap dengar solusi.", cocokUntuk: ["B2C"], sinyalPemicu: ["pasif", "belum kebuka"] },
  { id: "ct_surprise", nama: "Surprise", inti: "Kasih bonus/benefit tak terduga.", cocokUntuk: ["B2C"], sinyalPemicu: ["butuh dorongan akhir"] },
  { id: "ct_abc", nama: "ABC (Always Be Closing)", inti: "Gali kebutuhan terus, racik jadi penawaran yang pas.", cocokUntuk: ["B2B", "B2C"], sinyalPemicu: ["kebutuhan belum jelas"] },
  { id: "ct_ubahkata", nama: "Ubah Kata", inti: "Pilih diksi yang menggerakkan emosi, bukan kata datar.", cocokUntuk: ["B2B", "B2C"], sinyalPemicu: ["kurang tergerak"] },
  { id: "ct_perbandingan", nama: "Perbandingan", inti: "Bandingkan opsi/biaya masalah biar keputusan gampang (worth of cost).", cocokUntuk: ["B2B", "B2C"], sinyalPemicu: ["ditanya harga", "banding vendor"] },
  { id: "ct_crosssell", nama: "Cross Selling", inti: "Tawarkan produk pelengkap → naikkan nilai transaksi.", cocokUntuk: ["B2B", "B2C"], sinyalPemicu: ["sudah mau beli", "after-sales"] },
  { id: "ct_tukartempat", nama: "Tukar Tempat", inti: "Ajak pelanggan membayangkan/merasakan manfaat produk.", cocokUntuk: ["B2B", "B2C"], sinyalPemicu: ["belum kebayang manfaat"] },
  { id: "ct_cekstok", nama: "Cek Stok", inti: "Tampil tidak butuh-butuh amat (cek stok dulu) biar pelanggan mengejar.", cocokUntuk: ["B2C"], sinyalPemicu: ["terlalu santai", "nawar terus"] },
  { id: "ct_pengandaian", nama: "Pengandaian", inti: "Skenario 'andai...' biar muncul rasa rugi kalau nggak ambil.", cocokUntuk: ["B2C"], sinyalPemicu: ["nunda", "kurang urgensi"] },
  { id: "ct_purabego", nama: "Pura-pura Bego", inti: "Tampil lugu/bertanya polos biar pelanggan buka diri & nyaman.", cocokUntuk: ["B2C"], sinyalPemicu: ["pelanggan defensif"] },
];

/**
 * Format techniques as a compact prompt snippet. Filters by market type so the
 * B2B path never gets the aggressive (B2C-only) techniques.
 */
export function formatClosingTechniques(
  list: KbClosingTechnique[],
  opts: { market?: "B2B" | "B2C" | "mix"; max?: number } = {},
): string {
  const { market, max } = opts;
  const filtered =
    market && market !== "mix"
      ? list.filter((t) => t.cocokUntuk.includes(market))
      : list;
  const capped = typeof max === "number" ? filtered.slice(0, max) : filtered;
  return capped
    .map((t) => `- ${t.nama}: ${t.inti} (pemicu: ${t.sinyalPemicu.join(", ")})`)
    .join("\n");
}
