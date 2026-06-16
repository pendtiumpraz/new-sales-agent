import { notFound } from "next/navigation";

import { getQuoteByToken, markViewed } from "@/lib/quotes/store";
import { QuoteActions } from "./quote-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fmtMoney = (n: number, c: string) =>
  c === "IDR" ? "Rp" + Math.round(n || 0).toLocaleString("id-ID") : `${c} ${(n || 0).toLocaleString("en-US")}`;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf", sent: "Terkirim", viewed: "Dibuka", accepted: "Diterima", rejected: "Ditolak", expired: "Kadaluarsa",
};

export default async function PublicQuotePage({ params }: { params: { token: string } }) {
  const q = await getQuoteByToken(params.token);
  if (!q) notFound();
  // Tracking: opening the link marks it viewed (sent → viewed) — fire & forget.
  await markViewed(params.token).catch(() => {});

  const decided = q.status === "accepted" || q.status === "rejected";

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-slate-800">
      <style>{`@media print { .no-print { display:none !important } }`}</style>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{q.title}</h1>
          <p className="text-sm text-slate-500">Penawaran {q.number}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {STATUS_LABEL[q.status] ?? q.status}
        </span>
      </div>

      {(q.customerName || q.customerCompany) && (
        <div className="mb-6 text-sm">
          <p className="text-slate-500">Untuk</p>
          <p className="font-medium">{q.customerName}{q.customerCompany ? ` · ${q.customerCompany}` : ""}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Deskripsi</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Harga</th>
              <th className="px-4 py-2 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {(q.items ?? []).map((it, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-2">{it.desc}</td>
                <td className="px-4 py-2 text-right">{it.qty}</td>
                <td className="px-4 py-2 text-right">{fmtMoney(it.unitPrice, q.currency)}</td>
                <td className="px-4 py-2 text-right">{fmtMoney((Number(it.qty) || 0) * (Number(it.unitPrice) || 0), q.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{fmtMoney(q.subtotal, q.currency)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">PPN ({Math.round((q.taxRate || 0) * 100)}%)</span><span>{fmtMoney(q.taxAmount, q.currency)}</span></div>
        <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span>{fmtMoney(q.total, q.currency)}</span></div>
      </div>

      {q.validUntil && <p className="mt-4 text-sm text-slate-500">Berlaku sampai: {q.validUntil}</p>}
      {q.notes && (
        <div className="mt-6">
          <h2 className="mb-1 text-sm font-semibold">Syarat & ketentuan</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-600">{q.notes}</p>
        </div>
      )}

      <div className="no-print mt-8">
        <QuoteActions token={params.token} decided={decided} status={q.status} />
      </div>
    </main>
  );
}
