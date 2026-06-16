"use client";

import { useState } from "react";

export function QuoteActions({ token, decided, status }: { token: string; decided: boolean; status: string }) {
  const [state, setState] = useState<string>(decided ? status : "");
  const [busy, setBusy] = useState(false);

  async function respond(action: "accept" | "reject") {
    setBusy(true);
    try {
      const r = await fetch(`/api/public/quote/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const res = await r.json();
      if (r.ok) setState(res.data?.status ?? action);
    } finally {
      setBusy(false);
    }
  }

  if (state === "accepted") return <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">✓ Penawaran telah Anda terima. Terima kasih — tim kami akan menghubungi Anda.</p>;
  if (state === "rejected") return <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">Penawaran ditolak. Terima kasih atas waktunya.</p>;

  return (
    <div className="flex flex-wrap gap-3">
      <button
        onClick={() => respond("accept")}
        disabled={busy}
        className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy ? "Memproses…" : "Terima penawaran"}
      </button>
      <button
        onClick={() => respond("reject")}
        disabled={busy}
        className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        Tolak
      </button>
      <button
        onClick={() => window.print()}
        className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
      >
        Cetak / Simpan PDF
      </button>
    </div>
  );
}
