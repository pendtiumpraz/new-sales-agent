"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  BookOpen,
  ChevronLeft,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { RequireSuperadmin } from "@/components/auth/require-superadmin";
import { SentimentMap } from "@/components/inbox/sentiment-map";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { handoffEvents } from "@/lib/api-mock/handoff";
import { useHandoffStore } from "@/lib/stores/handoff-store";
import { formatRelativeID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";

const TRIGGER_LABEL: Record<string, string> = {
  sentiment: "Sentimen",
  timeout: "Tanpa respons",
  complexity: "Topik kompleks",
};

const TRIGGER_STYLE: Record<string, string> = {
  sentiment: "border-primary/30 bg-primary/10 text-primary",
  timeout: "border-warning/30 bg-warning/15 text-warning",
  complexity: "border-tertiary/30 bg-tertiary/10 text-tertiary",
};

export default function HandoffSettingsPage() {
  return (
    <RequireSuperadmin>
      <HandoffSettingsPageInner />
    </RequireSuperadmin>
  );
}

function HandoffSettingsPageInner() {
  const config = useHandoffStore((s) => s.config);
  const setSentimentThreshold = useHandoffStore((s) => s.setSentimentThreshold);
  const setTimeoutMinutes = useHandoffStore((s) => s.setTimeoutMinutes);
  const addComplexityTopic = useHandoffStore((s) => s.addComplexityTopic);
  const removeComplexityTopic = useHandoffStore((s) => s.removeComplexityTopic);
  const setAutoReplyEnabled = useHandoffStore((s) => s.setAutoReplyEnabled);

  const [newTopic, setNewTopic] = useState("");

  // Load the tenant's saved config from the DB so settings survive reload.
  useEffect(() => {
    void useHandoffStore.getState().hydrate();
  }, []);

  function onAddTopic() {
    const t = newTopic.trim();
    if (!t) return;
    addComplexityTopic(t);
    setNewTopic("");
    toast.success(`Topik "${t}" ditambahkan.`);
  }

  return (
    <div>
      <PageHeader
        title="Alihkan ke Manusia"
        description="Atur kapan AI harus mengalihkan percakapan ke agen manusia."
      >
        <Button variant="outline" asChild>
          <Link href="/settings">
            <ChevronLeft className="h-4 w-4" />
            Kembali ke Pengaturan
          </Link>
        </Button>
      </PageHeader>

      {/* Hero strip — teal+coral gradient banner */}
      <div className="relative overflow-hidden border-b bg-gradient-to-r from-tertiary/15 via-primary/8 to-transparent px-6 py-4">
        <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-tertiary/25 blur-3xl" />
        <div className="absolute -left-4 -bottom-12 h-28 w-28 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tertiary text-tertiary-foreground shadow-[0_8px_20px_-8px_rgba(20,184,166,0.55)]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Tiga pemicu — sentimen, batas waktu, dan topik
            </p>
            <p className="text-xs text-muted-foreground">
              Atur kondisi handoff sekali, AI menjalankan otomatis di seluruh
              channel.
            </p>
          </div>
          <Badge variant="default" className="gap-1 bg-tertiary/15 text-tertiary">
            <AlarmClock className="h-3 w-3" />
            {config.timeoutMinutes} mnt timeout
          </Badge>
          <Badge variant="default" className="gap-1 bg-primary/15 text-primary">
            <Sparkles className="h-3 w-3" />
            Threshold {config.sentimentThreshold}
          </Badge>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          {/* Triggers */}
          <div className="space-y-4">
            {/* Sentiment threshold */}
            <Card className="overflow-hidden border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  Ambang batas sentimen
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Jika sentimen percakapan turun di bawah nilai ini, AI akan
                  menyarankan handoff ke agen.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="threshold" className="text-sm">
                    Nilai ambang batas
                  </Label>
                  <span className="tnum text-2xl font-semibold text-primary">
                    {config.sentimentThreshold}
                  </span>
                </div>
                <input
                  id="threshold"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={config.sentimentThreshold}
                  onChange={(e) =>
                    setSentimentThreshold(Number(e.target.value))
                  }
                  className={cn(
                    "h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-rose-300 via-amber-200 to-emerald-300",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
                    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
                    "[&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white",
                    "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full",
                    "[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white",
                  )}
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>0 — sangat negatif</span>
                  <span>50 — netral</span>
                  <span>100 — positif</span>
                </div>
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Default: <strong className="text-foreground">30</strong>. Skor
                  yang lebih rendah berarti AI lebih toleran sebelum
                  menyerahkan ke agen.
                </p>
              </CardContent>
            </Card>

            {/* Timeout */}
            <Card className="overflow-hidden border-l-4 border-l-warning">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/15 text-warning">
                    <AlarmClock className="h-4 w-4" />
                  </span>
                  Batas waktu tanpa resolusi
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Jika AI belum menyelesaikan percakapan dalam waktu ini, akan
                  diteruskan ke agen.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="timeout" className="text-sm">
                      Durasi (menit)
                    </Label>
                    <Input
                      id="timeout"
                      type="number"
                      min={1}
                      max={120}
                      value={config.timeoutMinutes}
                      onChange={(e) =>
                        setTimeoutMinutes(Number(e.target.value))
                      }
                    />
                  </div>
                  <div className="flex flex-1 flex-wrap gap-1.5">
                    {[5, 15, 30, 60].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setTimeoutMinutes(m)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          config.timeoutMinutes === m
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-card text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {m} mnt
                      </button>
                    ))}
                  </div>
                </div>
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Default: <strong className="text-foreground">15 menit</strong>.
                </p>
              </CardContent>
            </Card>

            {/* Complexity topics */}
            <Card className="overflow-hidden border-l-4 border-l-tertiary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-tertiary/10 text-tertiary">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  Topik eskalasi otomatis
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Daftar topik yang selalu dialihkan ke agen — di luar
                  cakupan AI.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {config.complexityTopics.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Belum ada topik. Tambahkan di bawah.
                    </p>
                  ) : (
                    config.complexityTopics.map((t, i) => {
                      // Rotate through coral/teal/amber/blue/violet for each chip.
                      const tones = [
                        "border-primary/30 bg-primary/10 text-primary",
                        "border-tertiary/30 bg-tertiary/10 text-tertiary",
                        "border-warning/30 bg-warning/15 text-warning",
                        "border-info/30 bg-info/10 text-info",
                        "border-violet-300/40 bg-violet-50 text-violet-700",
                      ];
                      const tone = tones[i % tones.length];
                      return (
                        <span
                          key={t}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
                            tone,
                          )}
                        >
                          {t}
                          <button
                            type="button"
                            onClick={() => {
                              removeComplexityTopic(t);
                              toast.success(`Topik "${t}" dihapus.`);
                            }}
                            className="ml-0.5 rounded-full p-0.5 opacity-70 transition hover:bg-black/5 hover:opacity-100"
                            aria-label={`Hapus ${t}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onAddTopic();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="Misal: garansi panjang, pajak khusus..."
                  />
                  <Button type="submit" disabled={!newTopic.trim()}>
                    <Plus className="h-4 w-4" />
                    Tambah
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Auto-reply master switch */}
            <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/8 via-transparent to-tertiary/8">
              <CardContent className="flex items-center gap-3 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_rgba(251,94,59,0.55)]">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Auto-reply AI</p>
                  <p className="text-xs text-muted-foreground">
                    Aktifkan agar AI menyusun draf jawaban di semua kanal
                    masuk. Anda tetap meninjau sebelum kirim.
                  </p>
                </div>
                <Switch
                  checked={config.autoReplyEnabled}
                  onCheckedChange={setAutoReplyEnabled}
                />
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 rounded-xl border border-tertiary/30 bg-tertiary/5 px-4 py-3 text-sm">
              <BookOpen className="h-4 w-4 shrink-0 text-tertiary" />
              <span className="text-muted-foreground">
                Auto-reply menggunakan{" "}
                <strong className="text-foreground">Basis Pengetahuan</strong>{" "}
                klien — daftar produk, harga, dan strategi pemasaran.
              </span>
            </div>
          </div>

          {/* Right column: market mapping + recent events */}
          <div className="space-y-6">
            <SentimentMap />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Eskalasi terbaru</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Riwayat handoff dari AI ke agen.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {handoffEvents.map((e) => (
                    <li key={e.id} className="space-y-1 px-5 py-3 even:bg-muted/30">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            TRIGGER_STYLE[e.trigger] ?? "border-muted text-muted-foreground",
                          )}
                        >
                          {TRIGGER_LABEL[e.trigger]}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatRelativeID(e.triggeredAt)}
                        </span>
                      </div>
                      {e.note && (
                        <p className="text-xs text-foreground">{e.note}</p>
                      )}
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <Link
                          href="/inbox"
                          className="hover:text-foreground hover:underline"
                        >
                          Lihat percakapan ({e.conversationId})
                        </Link>
                        {e.assignedTo && (
                          <span>Ditugaskan ke {e.assignedTo}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
