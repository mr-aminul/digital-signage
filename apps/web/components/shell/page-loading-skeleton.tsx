import { cn } from "@/lib/utils";

export function PageLoadingSkeleton({
  variant = "default",
  className,
}: {
  variant?: "default" | "table" | "detail";
  className?: string;
}) {
  if (variant === "table") {
    return (
      <div className={cn("space-y-4 animate-pulse", className)} aria-busy aria-label="Loading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="h-8 w-40 rounded-md bg-muted" />
          <div className="h-9 w-56 rounded-md bg-muted/80" />
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-muted/40 px-4 py-3">
            <div className="h-3 w-full max-w-md rounded bg-muted" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-4 border-b border-border/80 px-4 py-4 last:border-0">
              <div className="h-4 w-28 rounded bg-muted" />
              <div className="h-4 flex-1 max-w-xs rounded bg-muted/70" />
              <div className="h-4 w-20 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className={cn("space-y-5 animate-pulse", className)} aria-busy aria-label="Loading">
        <div className="h-4 w-28 rounded bg-muted/70" />
        <div className="space-y-2 border-b border-border/80 pb-4">
          <div className="h-8 w-56 max-w-full rounded-md bg-muted" />
          <div className="h-4 w-72 max-w-full rounded-md bg-muted/70" />
        </div>
        <div className="flex gap-2 border-b border-border/70 pb-px">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-24 rounded-md bg-muted/60" />
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 rounded bg-muted/60" />
                <div className="h-4 w-full max-w-[12rem] rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6 animate-pulse", className)} aria-busy aria-label="Loading">
      <div className="space-y-2">
        <div className="h-8 w-48 max-w-full rounded-md bg-muted" />
        <div className="h-4 w-full max-w-lg rounded-md bg-muted/70" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-6">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="mt-3 h-3 w-32 rounded bg-muted/60" />
            <div className="mt-6 flex items-end justify-between gap-4">
              <div className="h-9 w-14 rounded bg-muted" />
              <div className="h-8 w-16 rounded-md bg-muted/80" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NavigationProgressBar() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[2px] overflow-hidden"
      role="progressbar"
      aria-valuetext="Loading page"
      aria-hidden
    >
      <div className="navigation-progress-bar h-full w-1/3 bg-brand" />
    </div>
  );
}
