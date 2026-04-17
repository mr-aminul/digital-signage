"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { BrandConfig, NavItem } from "./types";
import { assets } from "@/lib/config/assets";

const HOME_PATH = "/dashboard";
const NAV_ICON_SIZE = 15;
const NAV_ICON_STROKE = 1.75;

function navMatches(path: string, pathname: string, end?: boolean): boolean {
  const useEnd = end ?? path === "/";
  if (useEnd) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

interface TopNavBarProps {
  brand: BrandConfig;
  navItems: NavItem[];
  bottomNavItem?: NavItem;
}

export function TopNavBar({ brand, navItems, bottomNavItem }: TopNavBarProps) {
  const pathname = usePathname();
  const { name, subtitle, icon: BrandIcon, logoColor = "#2CA85A", logoUrl } = brand;

  const linkStyle = (active: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: "0.375rem",
      padding: "0.375rem 0.625rem",
      borderRadius: "0.5rem",
      textDecoration: "none",
      fontSize: "0.8125rem",
      fontWeight: active ? 600 : 500,
      color: active ? assets.themePrimary : "#4B5563",
      background: active ? "rgba(4, 13, 49, 0.06)" : "transparent",
      whiteSpace: "nowrap",
      flexShrink: 0,
      transition: "background 0.12s, color 0.12s",
    }) as const;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        minWidth: 0,
        flex: 1,
      }}
    >
      <Link
        href={HOME_PATH}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          textDecoration: "none",
          flexShrink: 0,
          paddingRight: "0.25rem",
        }}
      >
        <div
          style={{
            background: logoUrl ? "transparent" : logoColor,
            borderRadius: "0.5rem",
            width: "2rem",
            height: "2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {logoUrl ? (
            <Image src={logoUrl} alt="" width={32} height={32} className="object-contain" unoptimized />
          ) : (
            <BrandIcon size={17} color="#fff" strokeWidth={2.5} />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: "#111827",
              fontSize: "0.9375rem",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </div>
          {subtitle && (
            <div
              style={{
                color: "#9CA3AF",
                fontSize: "0.5625rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginTop: "0.0625rem",
                whiteSpace: "nowrap",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </Link>
      <div
        style={{
          width: "0.0625rem",
          height: "1.5rem",
          background: "#E8ECF0",
          flexShrink: 0,
        }}
        aria-hidden
      />
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.125rem",
          minWidth: 0,
          flex: 1,
          overflowX: "auto",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
        className="top-nav-scroll"
        aria-label="Main"
      >
        {navItems.map((item) => {
          const { icon: Icon, label, path, end } = item;
          const active = navMatches(path, pathname, end ?? path === "/");
          return (
            <Link key={path} href={path} style={linkStyle(active)} title={label}>
              <Icon size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} style={{ flexShrink: 0 }} />
              {label}
            </Link>
          );
        })}
        {bottomNavItem && (
          <Link
            href={bottomNavItem.path}
            style={linkStyle(
              navMatches(bottomNavItem.path, pathname, bottomNavItem.end ?? bottomNavItem.path === "/"),
            )}
            title={bottomNavItem.label}
          >
            <bottomNavItem.icon size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} style={{ flexShrink: 0 }} />
            {bottomNavItem.label}
          </Link>
        )}
      </nav>
    </div>
  );
}

interface MobileNavDrawerProps {
  brand: BrandConfig;
  navItems: NavItem[];
  bottomNavItem?: NavItem;
  open: boolean;
  onClose: () => void;
}

export function MobileNavDrawer({ brand, navItems, bottomNavItem, open, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { name, subtitle, icon: BrandIcon, logoColor = "#2CA85A", logoUrl } = brand;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rowStyle = (active: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: "0.625rem",
      padding: "0.625rem 0.875rem",
      borderRadius: "0.5rem",
      textDecoration: "none",
      fontSize: "0.875rem",
      fontWeight: active ? 600 : 500,
      color: active ? "#fff" : "rgba(255,255,255,0.72)",
      background: active ? "rgba(255,255,255,0.14)" : "transparent",
    }) as const;

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 49,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s",
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          width: "min(18.5rem, 88vw)",
          zIndex: 50,
          background: "#0c1740",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: open ? "0.25rem 0 1.5rem rgba(0,0,0,0.35)" : "none",
        }}
        aria-hidden={!open}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.875rem 1rem",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => {
              router.push(HOME_PATH);
              onClose();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
            }}
          >
            <div
              style={{
                background: logoUrl ? "transparent" : logoColor,
                borderRadius: "0.5rem",
                width: "2.125rem",
                height: "2.125rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {logoUrl ? (
                <Image src={logoUrl} alt="" width={34} height={34} className="object-contain" unoptimized />
              ) : (
                <BrandIcon size={18} color="#fff" strokeWidth={2.5} />
              )}
            </div>
            <div>
              <div style={{ color: "#fff", fontSize: "0.9375rem", fontWeight: 700 }}>{name}</div>
              {subtitle && (
                <div
                  style={{
                    color: "rgba(255,255,255,0.45)",
                    fontSize: "0.5625rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginTop: "0.125rem",
                  }}
                >
                  {subtitle}
                </div>
              )}
            </div>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: "2rem",
              height: "2rem",
              borderRadius: "0.4375rem",
              border: "0.0625rem solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.07)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "rgba(255,255,255,0.75)",
            }}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>
        <div style={{ height: "0.0625rem", background: "rgba(255,255,255,0.1)", marginInline: "1rem" }} />
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
          aria-label="Main"
        >
          {navItems.map((item) => {
            const { icon: Icon, label, path, end } = item;
            const active = navMatches(path, pathname, end ?? path === "/");
            return (
              <Link key={path} href={path} style={rowStyle(active)} onClick={onClose}>
                <Icon size={18} strokeWidth={NAV_ICON_STROKE} style={{ flexShrink: 0 }} />
                {label}
              </Link>
            );
          })}
          {bottomNavItem && (
            <Link
              href={bottomNavItem.path}
              style={rowStyle(
                navMatches(bottomNavItem.path, pathname, bottomNavItem.end ?? bottomNavItem.path === "/"),
              )}
              onClick={onClose}
            >
              <bottomNavItem.icon size={18} strokeWidth={NAV_ICON_STROKE} style={{ flexShrink: 0 }} />
              {bottomNavItem.label}
            </Link>
          )}
        </nav>
      </aside>
    </>
  );
}
