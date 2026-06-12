import { redirect } from "next/navigation";

export default function AdminStaffRedirectPage() {
  redirect("/admin/admins");
}
