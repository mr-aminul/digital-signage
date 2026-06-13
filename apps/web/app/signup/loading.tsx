import { PageLoadingSkeleton } from "@/components/shell/page-loading-skeleton";

export default function SignupLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <PageLoadingSkeleton />
      </div>
    </div>
  );
}
