"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PlatformStaff } from "@signage/types";
import { isStaffWriter } from "@/lib/auth/staff-utils";

type AdminStaffContextValue = {
  staff: PlatformStaff;
  canWrite: boolean;
};

const AdminStaffContext = createContext<AdminStaffContextValue | null>(null);

export function AdminStaffProvider({
  staff,
  children,
}: {
  staff: PlatformStaff;
  children: ReactNode;
}) {
  return (
    <AdminStaffContext.Provider value={{ staff, canWrite: isStaffWriter(staff) }}>
      {children}
    </AdminStaffContext.Provider>
  );
}

export function useAdminStaff(): AdminStaffContextValue {
  const ctx = useContext(AdminStaffContext);
  if (!ctx) {
    throw new Error("useAdminStaff must be used within AdminStaffProvider");
  }
  return ctx;
}

export function useOptionalAdminStaff(): AdminStaffContextValue | null {
  return useContext(AdminStaffContext);
}
