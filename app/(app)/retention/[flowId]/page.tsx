"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Pause,
  Play,
  Save,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { AiSimulatePanel } from "@/components/retention/ai-simulate-panel";
import { AudienceFilter } from "@/components/retention/audience-filter";
import { FlowStepEditor } from "@/components/retention/flow-step-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FLOW_STATUS_LABEL,
  FLOW_TYPE_LABEL,
  useRetentionStore,
} from "@/lib/stores/retention-store";

export default function RetentionFlowDetailPage() {
  const params = useParams<{ flowId: string }>();
  const router = useRouter();
  const flowId = params?.flowId;

  const flow = useRetentionStore((s) => s.flows.find((f) => f.id === flowId));
  const toggleStatus = useRetentionStore((s) => s.toggleStatus);
  const updateFlow = useRetentionStore((s) => s.updateFlow);

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [triggerDraft, setTriggerDraft] = useState("");

  useEffect(() => {
    if (flow) {
      setNameDraft(flow.name);
      setDescDraft(flow.description);
      setTriggerDraft(flow.triggerCondition);
      setSelectedStepId((current) =>
        current && flow.steps.some((s) => s.id === current)
          ? current
          : flow.steps[0]?.id ?? null,
      );
    }
  }, [flow]);

  const typeMeta = useMemo(
    () => (flow ? FLOW_TYPE_LABEL[flow.type] : null),
    [flow],
  );
  const statusMeta = useMemo(
    () => (flow ? FLOW_STATUS_LABEL[flow.status] : null),
    [flow],
  );

  if (!flowId) return notFound();
  if (!flow) {
    return (
      <div>
        <PageHeader
          title="Alur tidak ditemukan"
          description="Alur retensi yang Anda cari tidak tersedia."
        >
          <Button variant="outline" onClick={() => router.push("/retention")}>
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </Button>
        </PageHeader>
        <div className="p-6 text-sm text-muted-foreground">
          ID alur "{flowId}" tidak ditemukan dalam mock data.
        </div>
      </div>
    );
  }

  const isActive = flow.status === "aktif";

  function onSave() {
    updateFlow(flow!.id, {
      name: nameDraft,
      description: descDraft,
      triggerCondition: triggerDraft,
    });
    toast.success(`Alur "${nameDraft}" disimpan.`);
  }

  return (
    <div>
      <PageHeader
        title={flow.name}
        description={flow.description}
      >
        <Button variant="outline" onClick={() => router.push("/retention")}>
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            toggleStatus(flow.id);
            toast.success(
              isActive ? "Alur dijeda." : "Alur diaktifkan kembali.",
            );
          }}
        >
          {isActive ? (
            <>
              <Pause className="h-4 w-4" />
              Jeda
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Aktifkan
            </>
          )}
        </Button>
        <Button onClick={onSave}>
          <Save className="h-4 w-4" />
          Simpan
        </Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        {/* Summary band */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                {typeMeta && (
                  <Badge variant={typeMeta.variant}>{typeMeta.label}</Badge>
                )}
                {statusMeta && (
                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                )}
                <Badge variant="muted" className="gap-1">
                  <BookOpen className="h-3 w-3" />
                  KB ref: {flow.kbFlowId ?? "—"}
                </Badge>
                {flow.segmentTarget && (
                  <Badge variant="outline">
                    Segmen: {flow.segmentTarget}
                  </Badge>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="flow-name" className="mb-1.5 block">
                    Nama alur
                  </Label>
                  <Input
                    id="flow-name"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="flow-trigger" className="mb-1.5 block">
                    Kondisi pemicu
                  </Label>
                  <Input
                    id="flow-trigger"
                    value={triggerDraft}
                    onChange={(e) => setTriggerDraft(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="flow-desc" className="mb-1.5 block">
                    Deskripsi
                  </Label>
                  <Input
                    id="flow-desc"
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Terdaftar
                </span>
                <span className="tnum text-lg font-semibold">
                  {flow.enrolled}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">
                  Konversi
                </span>
                <span className="tnum text-lg font-semibold text-tertiary">
                  {flow.conversionRate}%
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">Langkah</span>
                <span className="tnum text-lg font-semibold">
                  {flow.steps.length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs: steps / audience / simulate */}
        <Tabs defaultValue="steps">
          <TabsList>
            <TabsTrigger value="steps">
              Langkah ({flow.steps.length})
            </TabsTrigger>
            <TabsTrigger value="audience">Audiens</TabsTrigger>
            <TabsTrigger value="simulate">Simulasi AI</TabsTrigger>
          </TabsList>

          <TabsContent value="steps">
            <FlowStepEditor
              flowId={flow.id}
              selectedId={selectedStepId}
              onSelect={setSelectedStepId}
            />
          </TabsContent>

          <TabsContent value="audience">
            <div className="grid gap-4 lg:grid-cols-2">
              <AudienceFilter initialSegment={flow.segmentTarget} />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Catatan AI</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    AI menyesuaikan pesan berdasarkan{" "}
                    <span className="font-medium text-foreground">
                      riwayat interaksi
                    </span>{" "}
                    pelanggan dan{" "}
                    <span className="font-medium text-foreground">
                      upsell map
                    </span>{" "}
                    di Basis Pengetahuan klien.
                  </p>
                  <p>
                    Filter di atas akan menentukan pelanggan mana yang
                    diikutsertakan. Jumlah perkiraan akan diperbarui setelah
                    aturan disimpan.
                  </p>
                  <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-foreground">Estimasi audiens</p>
                    <p className="tnum mt-1 text-2xl font-semibold tracking-tight">
                      ~{Math.max(20, flow.enrolled * 2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      pelanggan memenuhi kondisi saat ini
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="simulate">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <AiSimulatePanel flow={flow} stepId={selectedStepId} />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pilih langkah</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Klik langkah untuk melihat pesannya dirender AI.
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {flow.steps.map((step, i) => (
                    <button
                      key={step.id}
                      onClick={() => setSelectedStepId(step.id)}
                      className={
                        "flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors " +
                        (selectedStepId === step.id
                          ? "border-primary ring-1 ring-primary"
                          : "hover:bg-muted/40")
                      }
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-xs font-semibold">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium capitalize">{step.channel}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {step.delayDays === 0
                            ? "Langsung"
                            : `Hari +${step.delayDays}`}{" "}
                          · {step.content.slice(0, 60)}...
                        </p>
                      </div>
                    </button>
                  ))}
                  {flow.steps.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Belum ada langkah pada alur ini.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer back link */}
        <div className="flex justify-between border-t pt-4 text-xs text-muted-foreground">
          <span>
            Diperbarui: {new Date(flow.updatedAt).toLocaleString("id-ID")}
          </span>
          <Link href="/retention" className="hover:text-foreground">
            ← Kembali ke daftar alur
          </Link>
        </div>
      </div>
    </div>
  );
}
