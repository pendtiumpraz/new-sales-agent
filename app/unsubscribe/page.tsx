"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

// Public opt-out page (doc 25). Linked from every outbound email's footer.
export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const email = params.get("e") ?? "";
  const tenant = params.get("t") ?? "";
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function unsubscribe() {
    setState("loading");
    try {
      const r = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, tenant }),
      });
      setState(r.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Berhenti berlangganan</h1>
        {state === "done" ? (
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{email}</span> tidak akan menerima email lagi. Terima kasih.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Hentikan pengiriman email ke{" "}
              <span className="font-medium text-foreground">{email || "alamat ini"}</span>?
            </p>
            {state === "error" && (
              <p className="mt-2 text-xs text-destructive">Gagal memproses. Coba lagi.</p>
            )}
            <button
              onClick={unsubscribe}
              disabled={!email || !tenant || state === "loading"}
              className="mt-4 inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {state === "loading" ? "Memproses…" : "Ya, berhenti berlangganan"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
