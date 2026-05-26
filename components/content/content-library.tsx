"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Megaphone, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { useContentStore } from "@/lib/stores/content-store";
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_META,
  CONTENT_TYPE_META,
  CONTENT_TYPES,
} from "@/lib/utils/content-config";
import { formatDateID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";
import type { ContentItem, ContentStatus, ContentType } from "@/lib/types";
import { toast } from "sonner";

export function ContentLibrary() {
  const items = useContentStore((s) => s.items);
  const setStatus = useContentStore((s) => s.setStatus);
  const remove = useContentStore((s) => s.remove);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ContentType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");

  const filtered = useMemo(() => {
    let list = items;
    if (typeFilter !== "all") list = list.filter((i) => i.type === typeFilter);
    if (statusFilter !== "all")
      list = list.filter((i) => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.body.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [items, typeFilter, statusFilter, search]);

  return (
    <div>
      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari konten..."
            className="pl-8"
          />
        </div>
        <FilterChip
          active={typeFilter === "all"}
          onClick={() => setTypeFilter("all")}
        >
          Semua jenis
        </FilterChip>
        {CONTENT_TYPES.map((t) => (
          <FilterChip
            key={t}
            active={typeFilter === t}
            onClick={() => setTypeFilter(t)}
            color={CONTENT_TYPE_META[t].color}
          >
            {CONTENT_TYPE_META[t].label}
          </FilterChip>
        ))}
        <span className="mx-2 h-5 w-px bg-border" />
        <FilterChip
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        >
          Semua status
        </FilterChip>
        {CONTENT_STATUSES.map((s) => (
          <FilterChip
            key={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          >
            {CONTENT_STATUS_META[s].label}
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Belum ada konten yang cocok"
          description="Coba ubah filter atau buat konten baru untuk mengisi pipeline marketing Anda."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              onSetStatus={(s) => {
                setStatus(item.id, s);
                toast.success(
                  `"${item.title}" → ${CONTENT_STATUS_META[s].label}.`,
                );
              }}
              onDelete={() => {
                remove(item.id);
                toast.success(`"${item.title}" dihapus.`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {color && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </button>
  );
}

function ContentCard({
  item,
  onSetStatus,
  onDelete,
}: {
  item: ContentItem;
  onSetStatus: (status: ContentStatus) => void;
  onDelete: () => void;
}) {
  const meta = CONTENT_TYPE_META[item.type];
  const status = CONTENT_STATUS_META[item.status];

  return (
    <Card className="flex h-full flex-col transition-shadow hover:shadow-sm">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: meta.color }}
          >
            <meta.icon className="h-4 w-4" />
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {meta.label}
          </span>
          <Badge variant={status.variant} className="ml-auto">
            {status.label}
          </Badge>
        </div>

        <h3 className="mt-3 line-clamp-2 font-semibold leading-snug">
          {item.title}
        </h3>
        {item.subject && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            Subjek: {item.subject}
          </p>
        )}
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
          {item.body}
        </p>

        {item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {item.tags.map((t) => (
              <span
                key={t}
                className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs">
          <div className="min-w-0 flex-1">
            {item.scheduledFor ? (
              <p className="truncate text-muted-foreground">
                {item.status === "published" ? "Diterbitkan" : "Jadwal"}{" "}
                <span className="font-medium text-foreground">
                  {formatDateID(item.scheduledFor)}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground">Belum dijadwalkan</p>
            )}
            {item.audience && (
              <p className="truncate text-[11px] text-muted-foreground">
                {item.audience}
                {item.reach !== undefined &&
                  ` · ${item.reach.toLocaleString("id-ID")} reach`}
              </p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 px-2">
                Status
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ubah status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {CONTENT_STATUSES.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => onSetStatus(s)}
                  disabled={s === item.status}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      s === "draft" && "bg-muted-foreground",
                      s === "review" && "bg-warning",
                      s === "approved" && "bg-slate-400",
                      s === "scheduled" && "bg-primary",
                      s === "published" && "bg-success",
                    )}
                  />
                  {CONTENT_STATUS_META[s].label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete}>
                <Trash2 className="h-4 w-4 text-danger" />
                <span className="text-danger">Hapus</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
