"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppRouter } from "@/hooks/use-app-router";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavRadialSpinner } from "@/components/ui/nav-radial-spinner";
import { BrandMark } from "@/components/brand-mark";
import type { BrandConfig, NavItem } from "./types";

const HOME_PATH = "/dashboard";
const NAV_ICON_SIZE = 15;
const NAV_ICON_STROKE = 1.75;
const NAV_SLIDE_MS = 220;
const NAV_SLIDE_TRANSITION = `left ${NAV_SLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), width ${NAV_SLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;

function getNavHighlightIndex(
  items: NavItem[],
  pathname: string,
  pendingPath: string | null | undefined,
): number {
  if (pendingPath) {
    const pendingIndex = items.findIndex((item) => navItemMatchesDestination(item, pendingPath));
    if (pendingIndex >= 0) return pendingIndex;
  }
  return items.findIndex((item) => navMatches(item.path, pathname, item.end ?? item.path === "/"));
}

function navMatches(path: string, pathname: string, end?: boolean): boolean {
  const useEnd = end ?? path === "/";
  if (useEnd) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** True if `destinationPath` is the route for this nav item (e.g. /playlists/foo → Playlists tab). */
export function navItemMatchesDestination(
  item: { path: string; end?: boolean },
  destinationPath: string | null | undefined,
): boolean {
  if (!destinationPath) return false;
  const useEnd = item.end ?? item.path === "/";
  if (useEnd) return destinationPath === item.path;
  return destinationPath === item.path || destinationPath.startsWith(`${item.path}/`);
}

interface TopNavBarProps {
  brand: BrandConfig;
  navItems: NavItem[];
  bottomNavItem?: NavItem;
  pendingPath?: string | null;
  /** Center nav links in the header bar (parent should be `position: relative`). */
  centerNav?: boolean;
}

export function TopNavBar({ brand, navItems, bottomNavItem, pendingPath, centerNav = false }: TopNavBarProps) {
  const pathname = usePathname();
  const { name, subtitle, icon: BrandIcon, logoColor = "var(--theme)" } = brand;
  const items = useMemo(
    () => (bottomNavItem ? [...navItems, bottomNavItem] : navItems),
    [navItems, bottomNavItem],
  );
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const slideLockRef = useRef(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number; height: number } | null>(
    null,
  );

  const highlightIndex = getNavHighlightIndex(items, pathname, pendingPath);

  const measureIndicator = useCallback(() => {
    const nav = navRef.current;
    if (!nav || highlightIndex < 0) {
      setIndicator(null);
      return;
    }
    const link = linkRefs.current[highlightIndex];
    if (!link) {
      setIndicator(null);
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    setIndicator({
      left: linkRect.left - navRect.left + nav.scrollLeft,
      width: linkRect.width,
      height: linkRect.height,
    });
  }, [highlightIndex]);

  const updateIndicator = useCallback(
    (force = false) => {
      if (slideLockRef.current && !force) return;
      measureIndicator();
    },
    [measureIndicator],
  );

  useLayoutEffect(() => {
    measureIndicator();
  }, [items, measureIndicator]);

  useLayoutEffect(() => {
    slideLockRef.current = true;
    measureIndicator();
    const unlockTimer = window.setTimeout(() => {
      slideLockRef.current = false;
      measureIndicator();
    }, NAV_SLIDE_MS);
    return () => window.clearTimeout(unlockTimer);
  }, [highlightIndex, measureIndicator]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const ro = new ResizeObserver(() => updateIndicator());
    ro.observe(nav);
    for (const link of linkRefs.current) {
      if (link) ro.observe(link);
    }
    const onScroll = () => updateIndicator(true);
    nav.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      ro.disconnect();
      nav.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [updateIndicator, items, highlightIndex]);

  const linkStyle = (active: boolean) =>
    ({
      position: "relative",
      zIndex: 1,
      display: "flex",
      alignItems: "center",
      gap: "0.375rem",
      padding: "0 0.875rem",
      minHeight: "2.5rem",
      borderRadius: "0.5rem",
      textDecoration: "none",
      fontSize: "0.8125rem",
      fontWeight: active ? 600 : 500,
      color: active ? "#fff" : "rgba(255,255,255,0.72)",
      background: "transparent",
      whiteSpace: "nowrap",
      flexShrink: 0,
      transition: "color 0.15s",
    }) as const;

  const brandLink = (
    <Link
      prefetch
      href={HOME_PATH}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        textDecoration: "none",
        flexShrink: 0,
        paddingRight: centerNav ? 0 : "0.25rem",
      }}
    >
      <BrandMark icon={BrandIcon} logoColor={logoColor} iconSize={17} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: "#fff",
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
              color: "rgba(255,255,255,0.45)",
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
  );

  const navLinks = (
    <nav
      ref={navRef}
      style={{
        position: centerNav ? "absolute" : "relative",
        display: "flex",
        alignItems: "center",
        gap: "0.125rem",
        minWidth: 0,
        flex: centerNav ? "none" : 1,
        overflowX: centerNav ? "visible" : "auto",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        ...(centerNav
          ? {
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 1,
            }
          : {}),
      }}
      className="top-nav-scroll"
      aria-label="Main"
    >
        {indicator && (
          <div
            aria-hidden
            className="top-nav-slide-indicator"
            style={{
              position: "absolute",
              top: 0,
              left: indicator.left,
              width: indicator.width,
              height: indicator.height,
              borderRadius: "0.5rem",
              background: logoColor,
              transition: NAV_SLIDE_TRANSITION,
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
        )}
        {items.map((item, index) => {
          const { icon: Icon, label, path, end } = item;
          const active = index === highlightIndex;
          const showLoader = navItemMatchesDestination(item, pendingPath);
          return (
            <Link
              prefetch
              href={path}
              key={path}
              ref={(el) => {
                linkRefs.current[index] = el;
              }}
              style={linkStyle(active)}
              title={label}
            >
              <span
                style={{
                  position: "relative",
                  width: NAV_ICON_SIZE,
                  height: NAV_ICON_SIZE,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                aria-hidden={showLoader}
              >
                <Icon
                  size={NAV_ICON_SIZE}
                  strokeWidth={NAV_ICON_STROKE}
                  style={{ visibility: showLoader ? "hidden" : "visible" }}
                />
                {showLoader && (
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <NavRadialSpinner
                      size={NAV_ICON_SIZE}
                      style={{ color: "rgba(255,255,255,0.95)" }}
                      aria-hidden
                    />
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
    </nav>
  );

  if (centerNav) {
    return (
      <>
        {brandLink}
        {navLinks}
      </>
    );
  }

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
      {brandLink}
      <div
        style={{
          width: "0.0625rem",
          height: "1.5rem",
          background: "rgba(255,255,255,0.15)",
          flexShrink: 0,
        }}
        aria-hidden
      />
      {navLinks}
    </div>
  );
}

interface MobileNavDrawerProps {
  brand: BrandConfig;
  navItems: NavItem[];
  bottomNavItem?: NavItem;
  open: boolean;
  onClose: () => void;
  pendingPath?: string | null;
}

export function MobileNavDrawer({ brand, navItems, bottomNavItem, open, onClose, pendingPath }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const router = useAppRouter();
  const { name, subtitle, icon: BrandIcon, logoColor = "var(--theme)" } = brand;

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
      background: active ? logoColor : "transparent",
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
            <BrandMark icon={BrandIcon} logoColor={logoColor} iconSize={18} />
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
            const showLoader = navItemMatchesDestination(item, pendingPath);
            return (
              <Link prefetch key={path} href={path} style={rowStyle(active)} onClick={onClose}>
                {showLoader ? (
                  <NavRadialSpinner
                    size={18}
                    style={{ color: "rgba(255,255,255,0.95)" }}
                    aria-hidden
                  />
                ) : (
                  <Icon size={18} strokeWidth={NAV_ICON_STROKE} style={{ flexShrink: 0 }} />
                )}
                {label}
              </Link>
            );
          })}
          {bottomNavItem && (
            <Link
              prefetch
              href={bottomNavItem.path}
              style={rowStyle(
                navMatches(bottomNavItem.path, pathname, bottomNavItem.end ?? bottomNavItem.path === "/"),
              )}
              onClick={onClose}
            >
              {navItemMatchesDestination(bottomNavItem, pendingPath) ? (
                <NavRadialSpinner size={18} style={{ color: "rgba(255,255,255,0.95)" }} aria-hidden />
              ) : (
                <bottomNavItem.icon size={18} strokeWidth={NAV_ICON_STROKE} style={{ flexShrink: 0 }} />
              )}
              {bottomNavItem.label}
            </Link>
          )}
        </nav>
      </aside>
    </>
  );
}
