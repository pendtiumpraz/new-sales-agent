"use client";

import Link from "next/link";
import { BrainCircuit, ChevronRight, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ChannelDot } from "@/components/shared/channel-dot";
import { IDRAmount } from "@/components/shared/idr-amount";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const USERS = [
  { name: "Andi Hidayat", email: "andi@agentic.co.id", role: "Admin" },
  { name: "Rina Permata", email: "rina@agentic.co.id", role: "Sales Manager" },
  { name: "Teguh Saputra", email: "teguh@agentic.co.id", role: "Sales Rep" },
  { name: "Maya Kusuma", email: "maya@agentic.co.id", role: "Sales Rep" },
];

const INTEGRATIONS = [
  { ch: "whatsapp", name: "WhatsApp Business API", on: true },
  { ch: "email", name: "Email (SMTP)", on: true },
  { ch: "instagram", name: "Instagram DM", on: true },
  { ch: "tokopedia", name: "Tokopedia", on: true },
  { ch: "shopee", name: "Shopee", on: false },
  { ch: "tiktok", name: "TikTok Shop", on: false },
];

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Pengaturan" description="Kelola workspace, tim, dan integrasi." />

      <div className="p-6">
        <Tabs defaultValue="umum">
          <TabsList>
            <TabsTrigger value="umum">Umum</TabsTrigger>
            <TabsTrigger value="pengguna">Pengguna</TabsTrigger>
            <TabsTrigger value="integrasi">Integrasi</TabsTrigger>
            <TabsTrigger value="tagihan">Tagihan</TabsTrigger>
          </TabsList>

          <TabsContent value="umum" className="max-w-xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Workspace</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ws-name">Nama workspace</Label>
                  <Input id="ws-name" defaultValue="Agentic Sales Indonesia" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ws-domain">Domain</Label>
                  <Input id="ws-domain" defaultValue="agentic.co.id" />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Zona waktu</p>
                    <p className="text-xs text-muted-foreground">Asia/Jakarta (WIB)</p>
                  </div>
                  <Badge variant="secondary">UTC+7</Badge>
                </div>
              </CardContent>
            </Card>

            <Link href="/settings/knowledge-base">
              <Card className="transition-shadow hover:shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BrainCircuit className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">Basis Pengetahuan AI</p>
                    <p className="text-xs text-muted-foreground">
                      Produk, harga, segmen, & alur retensi — sumber data Advanced RAG
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/settings/compliance">
              <Card className="transition-shadow hover:shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">Kepatuhan UU PDP</p>
                    <p className="text-xs text-muted-foreground">
                      Skor 94/100 · log persetujuan & jejak audit
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </TabsContent>

          <TabsContent value="pengguna">
            <Card className="max-w-2xl">
              <CardContent className="p-0">
                <ul className="divide-y">
                  {USERS.map((u) => (
                    <li key={u.email} className="flex items-center gap-3 p-4">
                      <UserAvatar name={u.name} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <Badge variant="secondary">{u.role}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrasi">
            <Card className="max-w-2xl">
              <CardContent className="p-0">
                <ul className="divide-y">
                  {INTEGRATIONS.map((it) => (
                    <li key={it.ch} className="flex items-center gap-3 p-4">
                      <ChannelDot channel={it.ch} size={10} />
                      <span className="flex-1 text-sm font-medium">{it.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {it.on ? "Terhubung" : "Nonaktif"}
                      </span>
                      <Switch defaultChecked={it.on} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tagihan" className="max-w-xl">
            <Card>
              <CardHeader>
                <CardTitle>Paket Growth</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-1">
                  <IDRAmount value={449000} className="text-3xl font-semibold" />
                  <span className="text-sm text-muted-foreground">/pengguna/bln</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pengguna aktif</span>
                  <span className="font-medium">10 / 10</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tagihan berikutnya</span>
                  <span className="font-medium">1 Juni 2026</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total bulan ini</span>
                  <IDRAmount value={4490000} className="font-medium text-primary" />
                </div>
                <Button variant="outline" className="w-full">
                  Kelola paket
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
