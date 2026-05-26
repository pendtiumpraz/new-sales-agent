import { AiChat } from "@/components/ai/ai-chat";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";

export default function AiAssistantPage() {
  return (
    <div>
      <PageHeader
        title="Asisten Sales"
        description="Bantu pembuatan cadence, analisis pipeline, dan prospek scoring."
      />
      <div className="p-6">
        <Card className="mx-auto h-[calc(100vh-12rem)] max-w-3xl overflow-hidden">
          <AiChat className="h-full" />
        </Card>
      </div>
    </div>
  );
}
