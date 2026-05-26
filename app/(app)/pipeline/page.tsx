import { PageHeader } from "@/components/layout/page-header";
import { KanbanBoard } from "@/components/pipeline/kanban-board";

export default function PipelinePage() {
  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Tarik deal antar tahap. Nilai dalam Rupiah, diperbarui otomatis."
      />
      <KanbanBoard />
    </div>
  );
}
