// Seed the GLOBAL CANONICAL taxonomy base (tenant_id NULL) — the shared
// industri + pekerjaan master data every tenant reads (and the AI classifies
// into). Bilingual ID/EN, source="seed". DELETABLE + idempotent by design:
//   seed:   npx tsx scripts/seed-taxonomy-base.mts
//   remove: npx tsx scripts/seed-taxonomy-base.mts --unseed   (hard-delete seed_taxo_* rows)
//
// Idempotency: every row is INSERT … ON CONFLICT (tenant_id, slug) DO NOTHING,
// so re-running never duplicates. The (tenant_id, slug) unique index is declared
// NULLS NOT DISTINCT (migration 0038) so the global namespace dedups despite
// tenant_id being NULL. Ids are prefixed "seed_taxo_" so --unseed removes ONLY
// what this script wrote (and never a tenant's private rows).
//
// REQUIRES the 0038 migration to be applied first (industry + occupation tables).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@vercel/postgres";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const eq = l.indexOf("=");
    if (eq === -1) continue;
    const k = l.slice(0, eq).trim();
    let v = l.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.log("RESULT=NO_DB_URL");
  process.exit(1);
}

// Same normalizer as modules/taxonomy/repo.ts (kept in sync by hand — both must
// agree or the seed slug won't match what the app dedups against).
function normalizeSlug(input: string): string {
  return (input ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ~40 LinkedIn-style industries [Bahasa Indonesia, English].
const INDUSTRIES: [string, string][] = [
  ["Pengembangan Perangkat Lunak", "Software Development"],
  ["Teknologi Informasi & Layanan", "Information Technology & Services"],
  ["Layanan Keuangan", "Financial Services"],
  ["Perbankan", "Banking"],
  ["Asuransi", "Insurance"],
  ["Ritel", "Retail"],
  ["Grosir", "Wholesale"],
  ["E-commerce", "E-commerce"],
  ["Manufaktur", "Manufacturing"],
  ["Otomotif", "Automotive"],
  ["Konstruksi", "Construction"],
  ["Real Estat & Properti", "Real Estate & Property"],
  ["Kesehatan & Rumah Sakit", "Healthcare & Hospitals"],
  ["Farmasi", "Pharmaceuticals"],
  ["Pendidikan", "Education"],
  ["Perhotelan & Pariwisata", "Hospitality & Tourism"],
  ["Makanan & Minuman", "Food & Beverage"],
  ["Pertanian", "Agriculture"],
  ["Logistik & Rantai Pasok", "Logistics & Supply Chain"],
  ["Transportasi", "Transportation"],
  ["Telekomunikasi", "Telecommunications"],
  ["Media & Hiburan", "Media & Entertainment"],
  ["Periklanan & Pemasaran", "Advertising & Marketing"],
  ["Konsultan Manajemen", "Management Consulting"],
  ["Hukum", "Legal Services"],
  ["Akuntansi", "Accounting"],
  ["Energi & Pertambangan", "Energy & Mining"],
  ["Minyak & Gas", "Oil & Gas"],
  ["Utilitas", "Utilities"],
  ["Tekstil & Garmen", "Textile & Apparel"],
  ["Kecantikan & Perawatan Diri", "Beauty & Personal Care"],
  ["Kebugaran & Kesehatan", "Fitness & Wellness"],
  ["Game & Esports", "Gaming & Esports"],
  ["Nirlaba", "Non-profit"],
  ["Pemerintahan", "Government"],
  ["Perikanan & Kelautan", "Fisheries & Marine"],
  ["Elektronik & Perangkat Keras", "Electronics & Hardware"],
  ["Kimia", "Chemicals"],
  ["Kedirgantaraan & Pertahanan", "Aerospace & Defense"],
  ["Keuangan Teknologi (Fintech)", "Financial Technology (Fintech)"],
];

// ~32 common job families [Bahasa Indonesia, English].
const OCCUPATIONS: [string, string][] = [
  ["Penjualan", "Sales"],
  ["Pemasaran", "Marketing"],
  ["Teknik / Rekayasa Perangkat Lunak", "Software Engineering"],
  ["Produk", "Product Management"],
  ["Desain", "Design"],
  ["Data & Analitik", "Data & Analytics"],
  ["Operasional", "Operations"],
  ["Keuangan", "Finance"],
  ["Akuntansi", "Accounting"],
  ["Sumber Daya Manusia", "Human Resources"],
  ["Rekrutmen", "Recruiting"],
  ["Hukum", "Legal"],
  ["Layanan Pelanggan", "Customer Service"],
  ["Customer Success", "Customer Success"],
  ["Pengadaan", "Procurement"],
  ["Rantai Pasok & Logistik", "Supply Chain & Logistics"],
  ["Manajemen Proyek", "Project Management"],
  ["Teknologi Informasi (TI)", "Information Technology (IT)"],
  ["Riset & Pengembangan", "Research & Development"],
  ["Manajemen Umum", "General Management"],
  ["Kewirausahaan / Pemilik Usaha", "Entrepreneurship / Business Owner"],
  ["Konsultan", "Consulting"],
  ["Pendidikan & Pelatihan", "Education & Training"],
  ["Kesehatan & Medis", "Healthcare & Medical"],
  ["Hubungan Masyarakat", "Public Relations"],
  ["Pengembangan Bisnis", "Business Development"],
  ["Kualitas & Jaminan Mutu", "Quality Assurance"],
  ["Produksi & Manufaktur", "Production & Manufacturing"],
  ["Administrasi", "Administration"],
  ["Keamanan Informasi", "Information Security"],
  ["Manajemen Akun", "Account Management"],
  ["Media & Konten", "Media & Content"],
];

const PREFIX = "seed_taxo_";
const client = createClient({ connectionString: url });
await client.connect();

const unseed = process.argv.includes("--unseed");
try {
  if (unseed) {
    let total = 0;
    for (const t of ["occupation", "industry"]) {
      try {
        const r = await client.query(`delete from "${t}" where id like '${PREFIX}%'`);
        total += r.rowCount ?? 0;
      } catch (err) {
        console.error(`unseed ${t} failed:`, err);
      }
    }
    console.log(`UNSEEDED: hard-deleted ${total} ${PREFIX}* taxonomy rows.`);
    await client.end();
    process.exit(0);
  }

  let ind = 0;
  for (const [name, nameEn] of INDUSTRIES) {
    const slug = normalizeSlug(name);
    const id = `${PREFIX}ind_${slug}`;
    const r = await client.query(
      `insert into industry (id,tenant_id,name,slug,name_en,source)
       values ($1,null,$2,$3,$4,'seed')
       on conflict (tenant_id,slug) do nothing`,
      [id, name, slug, nameEn],
    );
    ind += r.rowCount ?? 0;
  }

  let occ = 0;
  for (const [name, nameEn] of OCCUPATIONS) {
    const slug = normalizeSlug(name);
    const id = `${PREFIX}occ_${slug}`;
    const r = await client.query(
      `insert into occupation (id,tenant_id,name,slug,name_en,source)
       values ($1,null,$2,$3,$4,'seed')
       on conflict (tenant_id,slug) do nothing`,
      [id, name, slug, nameEn],
    );
    occ += r.rowCount ?? 0;
  }

  console.log(
    `SEEDED taxonomy base: +${ind} industries, +${occ} occupations ` +
      `(${INDUSTRIES.length}/${OCCUPATIONS.length} canonical; existing rows untouched).`,
  );
  await client.end();
  process.exit(0);
} catch (err) {
  console.error("seed-taxonomy-base failed:", err);
  await client.end();
  process.exit(1);
}
