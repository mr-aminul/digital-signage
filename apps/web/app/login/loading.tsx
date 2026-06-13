import { PageLoadingSkeleton } from "@/components/shell/page-loading-skeleton";

export default function LoginLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <PageLoadingSkeleton variant="default" className="space-y-4" />
      </div>
    </div>
  );
}
