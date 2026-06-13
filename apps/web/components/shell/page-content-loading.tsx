import { NavRadialSpinner } from "@/components/ui/nav-radial-spinner";
import { cn } from "@/lib/utils";
import { PageLoadingSkeleton } from "@/components/shell/page-loading-skeleton";

/** Loading UI for the page content slot only — shells, nav, and headers stay mounted. */
export function PageContentLoading({
  label = "Loading data…",
  variant = "default",
  showSkeleton = true,
  className,
}: {
  label?: string;
  variant?: "default" | "table";
  showSkeleton?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4 py-1", className)} aria-busy aria-label={label}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <NavRadialSpinner size={18} aria-hidden />
        <span>{label}</span>
      </div>
      {showSkeleton ? <PageLoadingSkeleton variant={variant} /> : null}
    </div>
  );
}
