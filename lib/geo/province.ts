// Province geo util (doc 40) — map a free-text Indonesian location string
// (person.location, e.g. "Jakarta", "Surabaya, Indonesia", "Bandung, Jawa
// Barat") to one of the 38 provinces, plus centroid coordinates so crawled
// leads can be plotted on a map. Best-effort + real reference data; never dummy.

export const UNKNOWN_PROVINCE = "Tidak diketahui";

// Real centroid (approx) per province — used to plot a CircleMarker on the map.
export const PROVINCE_CENTROIDS: Record<string, [number, number]> = {
  "Aceh": [4.6951, 96.7494],
  "Sumatera Utara": [2.1154, 99.5451],
  "Sumatera Barat": [-0.7399, 100.8],
  "Riau": [0.2933, 101.7068],
  "Kepulauan Riau": [3.9457, 108.1429],
  "Jambi": [-1.6101, 103.6131],
  "Sumatera Selatan": [-3.3194, 103.9144],
  "Bangka Belitung": [-2.7411, 106.4406],
  "Bengkulu": [-3.5778, 102.3464],
  "Lampung": [-4.5586, 105.4068],
  "DKI Jakarta": [-6.2088, 106.8456],
  "Jawa Barat": [-6.9147, 107.6098],
  "Banten": [-6.4058, 106.064],
  "Jawa Tengah": [-7.1509, 110.1403],
  "DI Yogyakarta": [-7.8754, 110.4262],
  "Jawa Timur": [-7.5361, 112.2384],
  "Bali": [-8.4095, 115.1889],
  "Nusa Tenggara Barat": [-8.6529, 117.3616],
  "Nusa Tenggara Timur": [-8.6574, 121.0794],
  "Kalimantan Barat": [-0.2788, 111.4753],
  "Kalimantan Tengah": [-1.6815, 113.3824],
  "Kalimantan Selatan": [-3.0926, 115.2838],
  "Kalimantan Timur": [0.5387, 116.419],
  "Kalimantan Utara": [3.0731, 116.0414],
  "Sulawesi Utara": [0.6247, 123.975],
  "Gorontalo": [0.6999, 122.4467],
  "Sulawesi Tengah": [-1.43, 121.4456],
  "Sulawesi Barat": [-2.8441, 119.2321],
  "Sulawesi Selatan": [-3.6688, 119.974],
  "Sulawesi Tenggara": [-4.1449, 122.1746],
  "Maluku": [-3.2385, 130.1453],
  "Maluku Utara": [1.5709, 127.8088],
  "Papua": [-4.2699, 138.0804],
  "Papua Barat": [-1.3361, 133.1747],
  "Papua Tengah": [-3.99, 136.17],
  "Papua Pegunungan": [-4.05, 138.95],
  "Papua Selatan": [-7.5, 139.5],
  "Papua Barat Daya": [-0.88, 131.25],
};

// City / region keyword → province. Lower-cased, matched as substring of the
// location string. Covers the major cities; extend as data demands.
const CITY_TO_PROVINCE: Record<string, string> = {
  // DKI Jakarta
  "jakarta": "DKI Jakarta", "jaksel": "DKI Jakarta", "jakpus": "DKI Jakarta",
  "jakbar": "DKI Jakarta", "jaktim": "DKI Jakarta", "jakut": "DKI Jakarta",
  // Jawa Barat
  "bandung": "Jawa Barat", "bekasi": "Jawa Barat", "bogor": "Jawa Barat",
  "depok": "Jawa Barat", "cimahi": "Jawa Barat", "cirebon": "Jawa Barat",
  "sukabumi": "Jawa Barat", "tasikmalaya": "Jawa Barat", "karawang": "Jawa Barat",
  "garut": "Jawa Barat",
  // Banten
  "tangerang": "Banten", "serang": "Banten", "cilegon": "Banten", "bsd": "Banten",
  // Jawa Tengah
  "semarang": "Jawa Tengah", "solo": "Jawa Tengah", "surakarta": "Jawa Tengah",
  "magelang": "Jawa Tengah", "pekalongan": "Jawa Tengah", "tegal": "Jawa Tengah",
  "purwokerto": "Jawa Tengah", "kudus": "Jawa Tengah", "salatiga": "Jawa Tengah",
  // DI Yogyakarta
  "yogyakarta": "DI Yogyakarta", "jogja": "DI Yogyakarta", "yogya": "DI Yogyakarta",
  "sleman": "DI Yogyakarta", "bantul": "DI Yogyakarta",
  // Jawa Timur
  "surabaya": "Jawa Timur", "malang": "Jawa Timur", "sidoarjo": "Jawa Timur",
  "gresik": "Jawa Timur", "kediri": "Jawa Timur", "jember": "Jawa Timur",
  "madiun": "Jawa Timur", "mojokerto": "Jawa Timur", "probolinggo": "Jawa Timur",
  "banyuwangi": "Jawa Timur", "pasuruan": "Jawa Timur",
  // Bali & Nusa Tenggara
  "denpasar": "Bali", "badung": "Bali", "kuta": "Bali", "ubud": "Bali",
  "mataram": "Nusa Tenggara Barat", "lombok": "Nusa Tenggara Barat",
  "kupang": "Nusa Tenggara Timur",
  // Sumatera
  "medan": "Sumatera Utara", "deli serdang": "Sumatera Utara", "binjai": "Sumatera Utara",
  "padang": "Sumatera Barat", "bukittinggi": "Sumatera Barat",
  "pekanbaru": "Riau", "dumai": "Riau",
  "batam": "Kepulauan Riau", "tanjung pinang": "Kepulauan Riau",
  "jambi": "Jambi",
  "palembang": "Sumatera Selatan",
  "pangkal pinang": "Bangka Belitung", "pangkalpinang": "Bangka Belitung",
  "bengkulu": "Bengkulu",
  "bandar lampung": "Lampung", "lampung": "Lampung",
  "banda aceh": "Aceh", "lhokseumawe": "Aceh",
  // Kalimantan
  "pontianak": "Kalimantan Barat",
  "palangkaraya": "Kalimantan Tengah", "palangka raya": "Kalimantan Tengah",
  "banjarmasin": "Kalimantan Selatan", "banjarbaru": "Kalimantan Selatan",
  "balikpapan": "Kalimantan Timur", "samarinda": "Kalimantan Timur", "bontang": "Kalimantan Timur",
  "tarakan": "Kalimantan Utara",
  // Sulawesi
  "manado": "Sulawesi Utara", "bitung": "Sulawesi Utara",
  "gorontalo": "Gorontalo",
  "palu": "Sulawesi Tengah",
  "mamuju": "Sulawesi Barat",
  "makassar": "Sulawesi Selatan", "parepare": "Sulawesi Selatan",
  "kendari": "Sulawesi Tenggara",
  // Maluku & Papua
  "ambon": "Maluku",
  "ternate": "Maluku Utara", "sofifi": "Maluku Utara",
  "jayapura": "Papua",
  "manokwari": "Papua Barat",
  "sorong": "Papua Barat Daya",
  "nabire": "Papua Tengah",
  "merauke": "Papua Selatan",
  "wamena": "Papua Pegunungan",
};

// Province names themselves (so "…, Jawa Barat" resolves even without a city).
const PROVINCE_NAMES = Object.keys(PROVINCE_CENTROIDS);

export function provinceFromLocation(location: string | null | undefined): string {
  if (!location) return UNKNOWN_PROVINCE;
  const s = location.toLowerCase();
  // 1) explicit province name in the string wins (most specific).
  for (const prov of PROVINCE_NAMES) {
    if (s.includes(prov.toLowerCase())) return prov;
  }
  // common alias for the capital region
  if (/\bjabodetabek\b/.test(s)) return "DKI Jakarta";
  // 2) city keyword.
  for (const [city, prov] of Object.entries(CITY_TO_PROVINCE)) {
    if (s.includes(city)) return prov;
  }
  return UNKNOWN_PROVINCE;
}

export function centroidOf(province: string): [number, number] | null {
  return PROVINCE_CENTROIDS[province] ?? null;
}
