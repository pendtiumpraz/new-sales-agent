"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const TYPES = ["Demo produk", "Survey kebutuhan", "Negosiasi", "Penagihan", "Maintenance"];

export default function MobileNewVisitPage() {
  const router = useRouter();
  const [followUp, setFollowUp] = useState(true);
  const [hasPhoto, setHasPhoto] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    toast.success("Kunjungan tersimpan.");
    router.push("/m");
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Catat Kunjungan</h1>

      <div className="space-y-1.5">
        <Label htmlFor="cust">Nama pelanggan</Label>
        <Input id="cust" defaultValue="Toko Berkah Abadi" />
      </div>

      <div className="space-y-1.5">
        <Label>Jenis kunjungan</Label>
        <Select defaultValue={TYPES[0]}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Catatan</Label>
        <Textarea
          id="notes"
          placeholder="Hasil kunjungan, kebutuhan pelanggan, langkah berikutnya..."
          className="min-h-[100px]"
        />
      </div>

      <button
        type="button"
        onClick={() => setHasPhoto(true)}
        className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed bg-card py-5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      >
        <Camera className="h-5 w-5" />
        {hasPhoto ? "Foto terlampir ✓" : "Lampirkan foto"}
      </button>

      <div className="flex items-center justify-between rounded-xl border bg-card p-3">
        <div>
          <p className="text-sm font-medium">Perlu tindak lanjut</p>
          <p className="text-xs text-muted-foreground">Buat tugas follow-up otomatis</p>
        </div>
        <Switch checked={followUp} onCheckedChange={setFollowUp} />
      </div>

      <Button type="submit" className="w-full" size="lg">
        Simpan kunjungan
      </Button>
    </form>
  );
}
