import Link from "next/link";
import { Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ViewClientButton({
  userId,
  className,
}: {
  userId: string;
  className?: string;
}) {
  return (
    <Link
      href={`/admin/clients/${userId}`}
      className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5", className)}
    >
      <Eye className="h-3.5 w-3.5" aria-hidden />
      View
    </Link>
  );
}
