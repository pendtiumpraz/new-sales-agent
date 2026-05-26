"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Crosshair, MapPin } from "lucide-react";

import { MiniMap } from "@/components/mobile/mini-map";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function MobileCheckInPage() {
  const router = useRouter();
  const [checkedIn, setCheckedIn] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">Check-in Kunjungan</h1>
      <p className="text-sm text-muted-foreground">Toko Berkah Abadi · Tanah Abang</p>

      <MiniMap className="mt-4 h-40" />

      <div className="mt-3 flex items-center gap-2 rounded-xl border bg-card p-3 text-sm">
        <Crosshair className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <p className="font-medium tnum">-6.2088, 106.8456</p>
          <p className="text-xs text-muted-foreground">Akurasi GPS ±8 m</p>
        </div>
        <MapPin className="h-4 w-4 text-success" />
      </div>

      <button
        onClick={() => setHasPhoto(true)}
        className="mt-3 flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed bg-card py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      >
        <Camera className="h-6 w-6" />
        {hasPhoto ? "Foto tersimpan ✓" : "Ambil foto kunjungan"}
      </button>

      {checkedIn ? (
        <div className="mt-5 flex flex-col items-center gap-2 rounded-xl bg-success/10 p-5 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <p className="font-semibold text-success">Check-in berhasil!</p>
          <p className="text-xs text-muted-foreground">
            Lokasi & waktu tercatat 13:02 WIB
          </p>
          <Button
            className="mt-2 w-full"
            onClick={() => router.push("/m/visits/new")}
          >
            Catat hasil kunjungan
          </Button>
        </div>
      ) : (
        <Button
          size="lg"
          className="mt-5 h-14 w-full text-base"
          onClick={() => {
            setCheckedIn(true);
            toast.success("Check-in berhasil tercatat.");
          }}
        >
          <MapPin className="h-5 w-5" />
          Check-in Sekarang
        </Button>
      )}
    </div>
  );
}
