import { redirect } from "next/navigation";
import { getServerStaffAuth } from "@/lib/auth/staff";
import { getServerAuth } from "@/lib/supabase/auth";

export default async function HomePage() {
  const [{ user }, staff] = await Promise.all([getServerAuth(), getServerStaffAuth()]);

  if (staff) redirect("/admin");
  if (user) redirect("/dashboard");
  redirect("/login");
}
