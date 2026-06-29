/**
 * Seed data — the 17 Teknik Closing (Dewa Eka Prayoga), the closing-stage
 * playbook for the differentiator. Reused (clean) from the prototype's
 * `lib/kb/closing-techniques.ts`, restated as plain DTOs with stable slug `key`s
 * and lowercase `cocokUntuk` (b2b/b2c) to match the rebuild's column shapes.
 *
 * Aggressive/scarcity techniques are tagged `b2c`-only so the consultative B2B
 * path never reaches for them (the market-fit type down-weights them at runtime).
 * `sinyal` lists the trigger signals that should make the closing stage pick a
 * technique. This is pure data — no DB, no AI; the service seeds it per tenant.
 */

export interface KbTechniqueSeed {
  /** Stable slug — unique per tenant; dedup key on (re)seed + override. */
  key: string;
  name: string;
  /** One-line how-it-works. */
  inti: string;
  /** Optional sample line (plain text — no markdown). */
  contoh?: string;
  /** Market fit — b2c-only ones are the aggressive/scarcity techniques. */
  cocokUntuk: ("b2b" | "b2c")[];
  /** Trigger signals that should make the closing stage reach for this. */
  sinyal: string[];
}

export const CLOSING_TECHNIQUES_17: KbTechniqueSeed[] = [
  {
    key: "pertanyaan_pilihan",
    name: "Pertanyaan Pilihan",
    inti: "Kasih pilihan A/B, bukan ya/tidak, biar arah ke transaksi.",
    contoh: "mau yang paket coba dulu, atau langsung yang hemat?",
    cocokUntuk: ["b2b", "b2c"],
    sinyal: ["mau menutup", "ragu pilih"],
  },
  {
    key: "yes_set",
    name: "Ya...Ya...Ya (Yes Set)",
    inti: "Pancing pelanggan bilang 'iya' beruntun sampai mudah closing.",
    cocokUntuk: ["b2b", "b2c"],
    sinyal: ["bangun kesepakatan", "awal closing"],
  },
  {
    key: "kelangkaan",
    name: "Kelangkaan",
    inti: "Stok/slot terbatas — makin langka makin diburu.",
    cocokUntuk: ["b2c"],
    sinyal: ["nunda", "santai"],
  },
  {
    key: "now_or_never",
    name: "Now or Never",
    inti: "Urgensi waktu/promo hari ini biar nggak ditunda.",
    cocokUntuk: ["b2c"],
    sinyal: ["nunda", "pikir-pikir dulu"],
  },
  {
    key: "harga_coret",
    name: "Harga Coret",
    inti: "Tampilkan harga normal lalu harga sekarang → persepsi hemat.",
    contoh: "normalnya 189rb, hari ini 149rb",
    cocokUntuk: ["b2c"],
    sinyal: ["ditanya harga", "merasa mahal"],
  },
  {
    key: "otoritas",
    name: "Otoritas",
    inti: "Pakai kredibilitas, expert, atau bukti/sertifikasi.",
    cocokUntuk: ["b2b", "b2c"],
    sinyal: ["ragu kualitas", "butuh kepercayaan"],
  },
  {
    key: "tanya_balik",
    name: "Tanya Balik",
    inti: "Jawab keberatan dengan pertanyaan biar interaksi jalan.",
    contoh: "boleh tau yang bikin ragu bagian mana?",
    cocokUntuk: ["b2b", "b2c"],
    sinyal: ["objection", "keberatan"],
  },
  {
    key: "machine_gun",
    name: "Machine Gun",
    inti: "Tanya beruntun sampai pelanggan siap dengar solusi.",
    cocokUntuk: ["b2c"],
    sinyal: ["pasif", "belum kebuka"],
  },
  {
    key: "surprise",
    name: "Surprise",
    inti: "Kasih bonus/benefit tak terduga.",
    cocokUntuk: ["b2c"],
    sinyal: ["butuh dorongan akhir"],
  },
  {
    key: "always_be_closing",
    name: "ABC (Always Be Closing)",
    inti: "Gali kebutuhan terus, racik jadi penawaran yang pas.",
    cocokUntuk: ["b2b", "b2c"],
    sinyal: ["kebutuhan belum jelas"],
  },
  {
    key: "ubah_kata",
    name: "Ubah Kata",
    inti: "Pilih diksi yang menggerakkan emosi, bukan kata datar.",
    cocokUntuk: ["b2b", "b2c"],
    sinyal: ["kurang tergerak"],
  },
  {
    key: "perbandingan",
    name: "Perbandingan",
    inti: "Bandingkan opsi/biaya masalah biar keputusan gampang (worth of cost).",
    cocokUntuk: ["b2b", "b2c"],
    sinyal: ["ditanya harga", "banding vendor"],
  },
  {
    key: "cross_selling",
    name: "Cross Selling",
    inti: "Tawarkan produk pelengkap → naikkan nilai transaksi.",
    cocokUntuk: ["b2b", "b2c"],
    sinyal: ["sudah mau beli", "after-sales"],
  },
  {
    key: "tukar_tempat",
    name: "Tukar Tempat",
    inti: "Ajak pelanggan membayangkan/merasakan manfaat produk.",
    cocokUntuk: ["b2b", "b2c"],
    sinyal: ["belum kebayang manfaat"],
  },
  {
    key: "cek_stok",
    name: "Cek Stok",
    inti: "Tampil tidak butuh-butuh amat (cek stok dulu) biar pelanggan mengejar.",
    cocokUntuk: ["b2c"],
    sinyal: ["terlalu santai", "nawar terus"],
  },
  {
    key: "pengandaian",
    name: "Pengandaian",
    inti: "Skenario 'andai...' biar muncul rasa rugi kalau nggak ambil.",
    cocokUntuk: ["b2c"],
    sinyal: ["nunda", "kurang urgensi"],
  },
  {
    key: "pura_pura_bego",
    name: "Pura-pura Bego",
    inti: "Tampil lugu/bertanya polos biar pelanggan buka diri & nyaman.",
    cocokUntuk: ["b2c"],
    sinyal: ["pelanggan defensif"],
  },
];

/**
 * Pick the techniques that fit a market type + (optionally) a detected signal.
 * Heuristic — used by the closing stage to recommend a technique with NO AI:
 *  - b2b filters OUT the b2c-only (aggressive/scarcity) techniques.
 *  - when `signal` is given, techniques whose `sinyal` matches rank first.
 */
export function recommendTechniques(
  list: KbTechniqueSeed[],
  opts: { market?: "b2b" | "b2c" | "mix"; signal?: string; max?: number } = {},
): KbTechniqueSeed[] {
  const { market, signal, max } = opts;
  const fitted =
    market && market !== "mix" ? list.filter((t) => t.cocokUntuk.includes(market)) : list;
  const ranked = signal
    ? [...fitted].sort((a, b) => {
        const am = a.sinyal.some((s) => s.includes(signal) || signal.includes(s)) ? 1 : 0;
        const bm = b.sinyal.some((s) => s.includes(signal) || signal.includes(s)) ? 1 : 0;
        return bm - am;
      })
    : fitted;
  return typeof max === "number" ? ranked.slice(0, max) : ranked;
}
