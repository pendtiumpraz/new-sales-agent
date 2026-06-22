"use client";

// Inline Discovery (step 3) — add a lead to THIS workspace without leaving the
// hub. POSTs to /api/ingest with workspaceId (session-authed). For the full
// crawler flow there's still a link to the dedicated Discovery page.

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Radar, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function WorkspaceDiscoveryPanel({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [leadType, setLeadType] = useState("unknown");

  const add = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: "manual",
          workspaceId,
          people: [
            {
              fullName: name.trim(),
              companyName: company.trim() || undefined,
              leadType,
              source: "manual",
            },
          ],
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "gagal");
    },
    onSuccess: () => {
      toast.success("Lead ditambahkan ke workspace");
      setName("");
      setCompany("");
      qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
    onError: (e) => toast.error(String(e instanceof Error ? e.message : e)),
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">3</span>
          <Radar className="h-4 w-4 text-primary" /> Discovery — tambah lead
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Nama lead" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Perusahaan (opsional)" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={leadType} onValueChange={setLeadType}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unknown">Belum tau</SelectItem>
              <SelectItem value="b2b_partner">B2B</SelectItem>
              <SelectItem value="b2c_customer">B2C</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4" /> Tambah lead</>}
          </Button>
          <Link href={`/contacts/discovery?workspace=${workspaceId}`} className="ml-auto text-xs text-primary hover:underline">
            Discovery lengkap (crawl URL/industri) →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
