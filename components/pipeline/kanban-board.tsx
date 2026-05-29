"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { ChannelDot } from "@/components/shared/channel-dot";
import { IDRAmount } from "@/components/shared/idr-amount";
import { UserAvatar } from "@/components/shared/user-avatar";
import { DealDetailSheet } from "@/components/pipeline/deal-detail-sheet";
import { STAGES, usePipelineStore } from "@/lib/stores/pipeline-store";
import { formatDayMonthID } from "@/lib/utils/format-date-id";
import { cn } from "@/lib/utils";
import type { Deal, DealStage } from "@/lib/types";
import { toast } from "sonner";

export function KanbanBoard() {
  const deals = usePipelineStore((s) => s.deals);
  const moveDeal = usePipelineStore((s) => s.moveDeal);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openDeal, setOpenDeal] = useState<Deal | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const activeDeal = deals.find((d) => d.id === activeId) ?? null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const stage = over.id as DealStage;
    const deal = deals.find((d) => d.id === active.id);
    if (deal && deal.stage !== stage) {
      moveDeal(deal.id, stage);
      toast.success(
        `${deal.name} → ${STAGES.find((s) => s.key === stage)?.label}`,
      );
    }
  }

  function openCard(deal: Deal) {
    setOpenDeal(deal);
    setSheetOpen(true);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-[calc(100vh-9.25rem)] gap-4 overflow-x-auto p-6">
        {STAGES.map((stage) => (
          <Column
            key={stage.key}
            stageKey={stage.key}
            label={stage.label}
            deals={deals.filter((d) => d.stage === stage.key)}
            onOpen={openCard}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal ? <CardInner deal={activeDeal} dragging /> : null}
      </DragOverlay>

      <DealDetailSheet deal={openDeal} open={sheetOpen} onOpenChange={setSheetOpen} />
    </DndContext>
  );
}

function Column({
  stageKey,
  label,
  deals,
  onOpen,
}: {
  stageKey: DealStage;
  label: string;
  deals: Deal[];
  onOpen: (d: Deal) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey });
  const total = deals.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{label}</span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-medium text-muted-foreground">
            {deals.length}
          </span>
        </div>
        <IDRAmount value={total} compact className="text-xs font-medium text-muted-foreground" />
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "scrollbar-thin flex-1 space-y-2 overflow-y-auto rounded-lg border border-dashed p-2 transition-colors",
          isOver ? "border-primary bg-primary/5" : "border-transparent bg-accent/40",
        )}
      >
        {deals.map((deal) => (
          <DraggableCard key={deal.id} deal={deal} onOpen={onOpen} />
        ))}
        {deals.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-lg text-xs text-muted-foreground">
            Tarik deal ke sini
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  deal,
  onOpen,
}: {
  deal: Deal;
  onOpen: (d: Deal) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(deal)}
      className={cn("cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <CardInner deal={deal} />
    </div>
  );
}

function CardInner({ deal, dragging }: { deal: Deal; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        dragging && "rotate-2 cursor-grabbing shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{deal.name}</p>
        <ChannelDot channel={deal.sourceChannel} size={8} className="mt-1 shrink-0" />
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{deal.company}</p>
      <div className="mt-3 flex items-center justify-between">
        <IDRAmount value={deal.value} compact className="text-sm font-semibold text-primary" />
        <span className="text-[11px] text-muted-foreground">
          {formatDayMonthID(deal.expectedClose)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <UserAvatar name={deal.owner} color={deal.avatarColor} className="h-5 w-5 text-[9px]" />
        <span className="truncate text-[11px] text-muted-foreground">{deal.owner}</span>
      </div>
    </div>
  );
}
