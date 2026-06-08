"use client";

import { Moon, Send, Shield } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAutopilotStore } from "@/lib/stores/autopilot-store";

/**
 * Guardrails panel — drives `useAutopilotStore.config.guardrails`. Controls
 * the daily LinkedIn send cap, quiet hours window, and the human-in-the-loop
 * pause before any outbound DM.
 */
export function GuardrailsPanel({ disabled }: { disabled?: boolean }) {
  const guardrails = useAutopilotStore((s) => s.config.guardrails);
  const setConfig = useAutopilotStore((s) => s.setConfig);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-tertiary" />
          Guardrails
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Max LinkedIn per day */}
        <div className="space-y-1.5">
          <Label
            htmlFor="ap-max-li"
            className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"
          >
            <Send className="h-3 w-3" /> Maks. koneksi LinkedIn / hari
          </Label>
          <Input
            id="ap-max-li"
            type="number"
            min={1}
            max={200}
            disabled={disabled}
            value={guardrails.maxLiPerDay}
            onChange={(e) =>
              setConfig({
                guardrails: {
                  ...guardrails,
                  maxLiPerDay: Math.max(1, Number(e.target.value) || 1),
                },
              })
            }
          />
          <p className="text-[11px] text-muted-foreground">
            Batas aman LinkedIn — 50–100/hari per akun.
          </p>
        </div>

        {/* Quiet hours */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <Moon className="h-3 w-3" /> Jam tenang (tidak mengirim)
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">Mulai</p>
              <Input
                type="time"
                disabled={disabled}
                value={guardrails.quietHoursStart}
                onChange={(e) =>
                  setConfig({
                    guardrails: {
                      ...guardrails,
                      quietHoursStart: e.target.value,
                    },
                  })
                }
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">Selesai</p>
              <Input
                type="time"
                disabled={disabled}
                value={guardrails.quietHoursEnd}
                onChange={(e) =>
                  setConfig({
                    guardrails: {
                      ...guardrails,
                      quietHoursEnd: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            AI tidak mengirim pesan antara {guardrails.quietHoursStart} dan{" "}
            {guardrails.quietHoursEnd} (Asia/Jakarta).
          </p>
        </div>

        {/* Pause-before-send toggle */}
        <div className="flex items-start justify-between gap-3 rounded-2xl border bg-muted/40 p-3">
          <div className="space-y-0.5">
            <Label
              htmlFor="ap-pause"
              className="text-sm font-medium text-foreground"
            >
              Jeda sebelum kirim pesan
            </Label>
            <p className="text-[11px] text-muted-foreground">
              AI akan berhenti dan meminta persetujuan Anda sebelum DM apa pun
              terkirim.
            </p>
          </div>
          <Switch
            id="ap-pause"
            disabled={disabled}
            checked={guardrails.pauseBeforeSendingMessages}
            onCheckedChange={(checked) =>
              setConfig({
                guardrails: {
                  ...guardrails,
                  pauseBeforeSendingMessages: Boolean(checked),
                },
              })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
