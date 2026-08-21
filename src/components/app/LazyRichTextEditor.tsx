import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { RichTextEditorProps } from "./RichTextEditor";

const RichTextEditor = lazy(() =>
  import("./RichTextEditor").then((module) => ({ default: module.RichTextEditor })),
);

export function LazyRichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense
      fallback={
        <div aria-label="Carregando editor de texto" className="space-y-2">
          <Skeleton className="h-11 w-full sm:h-9" />
          <Skeleton className="h-[120px] w-full" />
        </div>
      }
    >
      <RichTextEditor {...props} />
    </Suspense>
  );
}
