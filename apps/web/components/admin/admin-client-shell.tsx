"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Image, LayoutGrid, ListVideo, Monitor, UserRound } from "lucide-react";
import type { AdminUserDirectoryEntry } from "@signage/types";
import { useAdminClientRoutes } from "@/components/admin/admin-client-route-context";
import { cn } from "@/lib/utils";

function AccountStatusBadge({ isDisabled }: { isDisabled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold",
        isDisabled
          ? "bg-red-500/15 text-red-700"
          : "bg-emerald-500/10 text-emerald-800",
      )}
    >
      {isDisabled ? "Disabled" : "Active"}
    </span>
  );
}

const NAV_ITEMS = [
  { segment: "overview", label: "Overview", icon: UserRound, match: (path: string, base: string) => path === base },
  { segment: "devices", label: "Devices", icon: Monitor, match: (path: string, base: string) => path.startsWith(`${base}/devices`) },
  { segment: "playlists", label: "Playlists", icon: ListVideo, match: (path: string, base: string) => path.startsWith(`${base}/playlists`) },
  { segment: "media", label: "Media", icon: Image, match: (path: string, base: string) => path.startsWith(`${base}/media`) },
] as const;

function navHref(basePath: string, segment: (typeof NAV_ITEMS)[number]["segment"]) {
  if (segment === "overview") return basePath;
  return `${basePath}/${segment}`;
}

export function AdminClientShell({
  client,
  children,
}: {
  client: AdminUserDirectoryEntry;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const routes = useAdminClientRoutes();
  const basePath = routes?.basePath ?? `/admin/clients/${client.id}`;
  const displayName = client.full_name?.trim() || client.email.split("@")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-2">
      <div className="space-y-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to clients
        </Link>

        <div className="flex flex-col gap-3 border-b border-border/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Client account
            </p>
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{displayName}</h1>
            <p className="truncate text-sm text-muted-foreground">{client.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AccountStatusBadge isDisabled={client.is_disabled} />
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
              <Monitor className="h-3.5 w-3.5" aria-hidden />
              {client.device_count} screens · {client.online_device_count} online
            </span>
          </div>
        </div>

        <nav
          className="flex gap-1 overflow-x-auto border-b border-border/70 pb-px"
          aria-label="Client sections"
        >
          {NAV_ITEMS.map(({ segment, label, icon: Icon, match }) => {
            const active = match(pathname, basePath);
            return (
              <Link
                key={segment}
                href={navHref(basePath, segment)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition",
                  active
                    ? "border-brand-strong text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}

export function AdminClientOverview({
  client,
  children,
}: {
  client: AdminUserDirectoryEntry;
  children?: React.ReactNode;
}) {
  const routes = useAdminClientRoutes();
  const basePath = routes?.basePath ?? `/admin/clients/${client.id}`;

  const quickLinks = [
    { href: `${basePath}/devices`, label: "Devices", desc: "Screens, pairing, TV controls", icon: Monitor },
    { href: `${basePath}/playlists`, label: "Playlists", desc: "Content schedules", icon: ListVideo },
    { href: `${basePath}/media`, label: "Media", desc: "Images and videos", icon: Image },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {quickLinks.map(({ href, label, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border border-border/90 bg-card p-4 shadow-sm transition hover:border-brand-faint25 hover:shadow-md"
          >
            <div className="mb-3 inline-flex rounded-lg bg-muted/60 p-2 transition group-hover:bg-brand-faint15">
              <Icon className="h-4 w-4 text-brand-strong" aria-hidden />
            </div>
            <p className="font-semibold text-foreground">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-border/90 bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Account details</h2>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Email</dt>
            <dd className="mt-0.5 text-foreground">{client.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Display name</dt>
            <dd className="mt-0.5 text-foreground">{client.full_name?.trim() || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Joined</dt>
            <dd className="mt-0.5 tabular-nums text-foreground">
              {new Date(client.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Status</dt>
            <dd className="mt-1">
              <AccountStatusBadge isDisabled={client.is_disabled} />
            </dd>
          </div>
        </dl>
      </div>

      {children}
    </div>
  );
}
