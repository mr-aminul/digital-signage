import { redirect } from "next/navigation";
import type { AdminDirectoryEntry } from "@signage/types";
import { AdminAdminsTable } from "@/components/admin/admin-admins-table";
import { getServerStaffAuth } from "@/lib/auth/staff";

export default async function AdminAdminsPage() {
  const ctx = await getServerStaffAuth();
  if (!ctx) redirect("/login?next=/admin/admins");

  if (ctx.staff.role !== "owner") {
    redirect("/admin");
  }

  const { data, error } = await ctx.supabase.rpc("admin_list_admins");
  if (error) {
    throw new Error(error.message);
  }

  const admins = (data as AdminDirectoryEntry[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admins</h1>
        <p className="text-sm text-muted-foreground">
          People with access to the admin portal. Add a row below to grant access to a new admin.
        </p>
      </div>
      <AdminAdminsTable admins={admins} />
    </div>
  );
}
