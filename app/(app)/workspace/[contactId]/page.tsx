"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { UnifiedWorkspace } from "@/components/workspace/unified-workspace";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Wave 3 — Unified workspace at /workspace/[contactId]. Optional `?cv=cv_XXXX`
 * query param can deep-link to a specific conversation for that contact
 * (used by the "Buka di workspace" button on the inbox header).
 */
export default function WorkspaceContactPage({
  params,
}: {
  params: { contactId: string };
}) {
  // useSearchParams requires a Suspense boundary (Next 14 static prerender).
  return (
    <Suspense
      fallback={
        <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 gap-3 p-4 md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_360px]">
          <Skeleton className="h-full" />
          <Skeleton className="h-full" />
          <Skeleton className="hidden h-full xl:block" />
        </div>
      }
    >
      <WorkspacePageInner contactId={params.contactId} />
    </Suspense>
  );
}

function WorkspacePageInner({ contactId }: { contactId: string }) {
  const search = useSearchParams();
  const initialConversationId = search.get("cv") ?? undefined;

  return (
    <UnifiedWorkspace
      contactId={contactId}
      initialConversationId={initialConversationId}
    />
  );
}
