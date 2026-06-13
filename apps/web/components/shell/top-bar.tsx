"use client";

import { useRef, useEffect, useState } from "react";
import { Bell, ChevronDown, LayoutDashboard, LogOut, Menu, Search, Settings, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { setStaffPortalChoice } from "@/lib/auth/staff-portal-choice";
import { useNotifications } from "./notifications-context";
import { useSettings } from "./settings-context";
import { MobileNavDrawer, TopNavBar } from "./top-nav";
import type { BrandConfig, NavItem } from "./types";
import { NavRadialSpinner } from "@/components/ui/nav-radial-spinner";
import { assets } from "@/lib/config/assets";
import { ConfirmModal } from "./confirm-modal";
import { shellChrome } from "./shell-chrome";
import { TrialTopBarPill } from "@/components/console/trial-status";

function formatNotificationTime(ts: number) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}

const HOVER_CLOSE_DELAY_MS = 150;
const SEARCH_EXPANDED_WIDTH = "11.25rem";

export type ProfilePortalSwitch = {
  label: string;
  href: string;
  icon: LucideIcon;
  choice: "admin" | "user";
};

function ExpandableSearch({ placeholder }: { placeholder: string }) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!expanded) return;
    inputRef.current?.focus();
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      const value = inputRef.current?.value ?? "";
      if (!value.trim()) setExpanded(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  const shellStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    background: shellChrome.background,
    border: shellChrome.border,
    borderRadius: "0.5rem",
    flexShrink: 0,
    overflow: "hidden",
  };

  if (!expanded) {
    return (
      <div ref={containerRef}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Search"
          aria-expanded={false}
          className="topbar-expandable-search"
          style={{
            ...shellStyle,
            width: "2rem",
            height: "2rem",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = shellChrome.backgroundHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = shellChrome.background;
          }}
        >
          <Search size={14} color={shellChrome.icon} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="topbar-expandable-search"
      style={{
        ...shellStyle,
        gap: "0.5rem",
        padding: "0 0.75rem",
        height: "2.125rem",
        width: SEARCH_EXPANDED_WIDTH,
      }}
      role="search"
    >
      <Search size={13} color={shellChrome.textMuted} style={{ flexShrink: 0 }} aria-hidden />
      <input
        ref={inputRef}
        placeholder={placeholder}
        className="topbar-shell-search"
        aria-label={placeholder}
        style={{
          border: "none",
          background: "transparent",
          outline: "none",
          fontSize: "0.75rem",
          color: shellChrome.text,
          width: "100%",
          minWidth: 0,
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setExpanded(false);
        }}
      />
    </div>
  );
}

function NotificationBellDropdown() {
  const [open, setOpen] = useState(false);
  const [iconHovered, setIconHovered] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { notifications, unreadCount, markAsRead, markAllRead, addNotification } = useNotifications();
  const { settings } = useSettings();

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearCloseTimeout();
    setOpen(true);
    setIconHovered(true);
  };

  const handleMouseLeave = () => {
    setIconHovered(false);
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  const bellButtonStyle: React.CSSProperties = {
    position: "relative",
    width: "2rem",
    height: "2rem",
    borderRadius: "0.4375rem",
    border: shellChrome.border,
    background: shellChrome.background,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  };

  const badgeStyle: React.CSSProperties = {
    position: "absolute",
    top: "0.4375rem",
    right: "0.4375rem",
    width: "0.375rem",
    height: "0.375rem",
    borderRadius: "50%",
    background: "#EF4444",
    border: "0.09375rem solid rgba(255,255,255,0.25)",
  };

  const panelStyle: React.CSSProperties = {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: "0.25rem",
    width: "20rem",
    maxHeight: "22rem",
    overflowY: "auto",
    background: "#fff",
    border: "0.0625rem solid #E8ECF0",
    borderRadius: "0.5rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    zIndex: 1000,
  };

  const showPanel = open && settings.notifications;

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        style={bellButtonStyle}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        aria-expanded={open}
      >
        <Bell
          size={14}
          color={iconHovered || open ? "#fff" : shellChrome.icon}
          strokeWidth={iconHovered || open ? 2.5 : 1.75}
          fill={iconHovered || open ? assets.themePrimary : "none"}
        />
        {unreadCount > 0 && <span style={badgeStyle} aria-hidden />}
      </button>
      {showPanel && (
        <div style={panelStyle} role="dialog" aria-label="Notifications">
          <div
            style={{
              padding: "0.5rem 0.75rem",
              borderBottom: "0.0625rem solid #E8ECF0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#111827" }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: "#6B7280",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0.25rem",
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div style={{ padding: "0.25rem 0" }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: "1.5rem 0.75rem",
                  fontSize: "0.8125rem",
                  color: "#6B7280",
                  textAlign: "center",
                }}
              >
                No notifications yet
                <button
                  type="button"
                  onClick={() => addNotification("Welcome", "Click the bell to see notifications here.")}
                  style={{
                    display: "block",
                    margin: "0.5rem auto 0",
                    fontSize: "0.75rem",
                    color: assets.themePrimary,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Send test notification
                </button>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="topbar-dropdown-item"
                  onClick={() => markAsRead(n.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.625rem 0.75rem",
                    border: "none",
                    background: n.read ? "transparent" : "#F9FAFB",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "0.8125rem",
                    borderBottom: "0.0625rem solid #F3F4F6",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#111827" }}>{n.title}</span>
                  {n.message && (
                    <div style={{ marginTop: "0.25rem", color: "#6B7280", fontWeight: 400 }}>{n.message}</div>
                  )}
                  <div style={{ marginTop: "0.25rem", fontSize: "0.6875rem", color: "#9CA3AF" }}>
                    {formatNotificationTime(n.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {open && !settings.notifications && (
        <div style={panelStyle} role="dialog" aria-label="Notifications">
          <div
            style={{
              padding: "1rem 0.75rem",
              fontSize: "0.8125rem",
              color: "#6B7280",
              textAlign: "center",
            }}
          >
            In-app notifications are off.
          </div>
        </div>
      )}
    </div>
  );
}

export interface TopBarProps {
  title: string | ((pathname: string) => string);
  titleIcon?: LucideIcon;
  /** Destination pathname while a client navigation is in flight (shows loaders on matching nav icons). */
  pendingPath?: string | null;
  brand: BrandConfig;
  navItems: NavItem[];
  bottomNavItem?: NavItem;
  mobileNavOpen: boolean;
  onMobileNavClose: () => void;
  userName?: string;
  profileSubtext?: string;
  onSignOut?: () => void;
  portalSwitch?: ProfilePortalSwitch;
  centerSlot?: React.ReactNode;
  searchPlaceholder?: string;
  rightSlot?: React.ReactNode;
  /** Placed before notifications / profile (e.g. Sync). */
  syncControl?: React.ReactNode;
  languageLabel?: string;
  onLanguageClick?: () => void;
  onMobileMenuOpen: () => void;
  isMobile?: boolean;
}

function ProfileDropdown({
  userName,
  profileSubtext,
  onSignOut,
  portalSwitch,
  isMobile,
}: {
  userName?: string;
  profileSubtext?: string;
  onSignOut?: () => void;
  portalSwitch?: ProfilePortalSwitch;
  isMobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    if (isMobile) return;
    clearCloseTimeout();
    setOpen(true);
  };

  const handleMouseLeave = () => {
    if (isMobile) return;
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  useEffect(() => {
    if (!open || isMobile) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, isMobile]);

  const handleSignOutClick = () => {
    setOpen(false);
    setShowSignOutConfirm(true);
  };

  const handleSignOutConfirm = () => {
    setShowSignOutConfirm(false);
    onSignOut?.();
  };

  const triggerStyle: React.CSSProperties = isMobile
    ? {
        width: "2rem",
        height: "2rem",
        borderRadius: "0.5rem",
        background: assets.themePrimary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.625rem",
        fontWeight: 700,
        color: assets.themePrimaryContrast,
        flexShrink: 0,
        letterSpacing: "0.02em",
        cursor: "pointer",
        border: "none",
      }
    : {
        display: "flex",
        alignItems: "center",
        gap: "0.4375rem",
        cursor: "pointer",
        padding: "0.1875rem 0.5rem 0.1875rem 0.1875rem",
        borderRadius: "0.5rem",
        border: shellChrome.border,
        background: shellChrome.background,
        height: "2rem",
      };

  const panelStyle: React.CSSProperties = {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: "0.25rem",
    minWidth: "12rem",
    background: "#fff",
    border: "0.0625rem solid #E8ECF0",
    borderRadius: "0.5rem",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    zIndex: 1000,
    overflow: "hidden",
  };

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    width: "100%",
    padding: "0.5rem 0.75rem",
    border: "none",
    background: "none",
    fontSize: "0.8125rem",
    color: "#374151",
    cursor: "pointer",
    textAlign: "left",
  };

  const linkItemStyle: React.CSSProperties = {
    ...itemStyle,
    textDecoration: "none",
    color: "#374151",
    boxSizing: "border-box",
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={isMobile ? () => setOpen((o) => !o) : undefined}
        style={triggerStyle}
        aria-label="Profile menu"
        aria-expanded={open}
      >
        {isMobile ? (
          (userName ? userName.slice(0, 2).toUpperCase() : "?")
        ) : (
          <>
            <div
              style={{
                width: "1.625rem",
                height: "1.625rem",
                borderRadius: "0.375rem",
                background: assets.themePrimary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.625rem",
                fontWeight: 700,
                color: assets.themePrimaryContrast,
                flexShrink: 0,
                letterSpacing: "0.02em",
              }}
            >
              {userName ? userName.slice(0, 2).toUpperCase() : "?"}
            </div>
            {userName != null && (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: shellChrome.text,
                  whiteSpace: "nowrap",
                }}
              >
                {userName}
              </span>
            )}
            <ChevronDown
              size={12}
              color={shellChrome.textMuted}
              strokeWidth={2}
              style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none" }}
            />
          </>
        )}
      </button>
      {open && (
        <div style={panelStyle} role="menu" aria-label="Profile menu">
          <div
            style={{
              padding: "0.625rem 0.75rem",
              borderBottom: "0.0625rem solid #E8ECF0",
            }}
          >
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#111827" }}>{userName ?? "User"}</div>
            {profileSubtext && (
              <div style={{ fontSize: "0.75rem", color: "#6B7280", marginTop: "0.125rem" }}>{profileSubtext}</div>
            )}
          </div>
          <Link
            prefetch
            href="/profile"
            className="topbar-dropdown-item"
            style={linkItemStyle}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <UserRound size={14} color="#6B7280" strokeWidth={2} />
            Profile
          </Link>
          <Link
            prefetch
            href="/settings"
            className="topbar-dropdown-item"
            style={linkItemStyle}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Settings size={14} color="#6B7280" strokeWidth={2} />
            Settings
          </Link>
          {portalSwitch ? (
            <Link
              prefetch
              href={portalSwitch.href}
              className="topbar-dropdown-item"
              style={linkItemStyle}
              role="menuitem"
              onClick={() => {
                setStaffPortalChoice(portalSwitch.choice);
                setOpen(false);
              }}
            >
              <portalSwitch.icon size={14} color="#6B7280" strokeWidth={2} />
              {portalSwitch.label}
            </Link>
          ) : null}
          <div style={{ height: "0.0625rem", background: "#E8ECF0", margin: "0.25rem 0" }} aria-hidden />
          <button
            type="button"
            className="topbar-dropdown-item topbar-dropdown-item--signout"
            style={{ ...itemStyle, color: "#DC2626" }}
            onClick={handleSignOutClick}
            role="menuitem"
          >
            <LogOut size={14} color="#DC2626" strokeWidth={2} />
            Sign out
          </button>
        </div>
      )}
      <ConfirmModal
        open={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        onConfirm={handleSignOutConfirm}
        title="Sign out?"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}

export function TopBar({
  title,
  titleIcon: TitleIcon,
  pendingPath = null,
  brand,
  navItems,
  bottomNavItem,
  mobileNavOpen,
  onMobileNavClose,
  userName,
  profileSubtext,
  onSignOut,
  portalSwitch,
  centerSlot,
  searchPlaceholder,
  rightSlot,
  syncControl,
  languageLabel,
  onLanguageClick,
  onMobileMenuOpen,
  isMobile = false,
}: TopBarProps) {
  const pathname = usePathname();
  const titleText = typeof title === "function" ? title(pathname) : title;

  if (isMobile) {
    return (
      <>
        <MobileNavDrawer
          brand={brand}
          navItems={navItems}
          bottomNavItem={bottomNavItem}
          open={mobileNavOpen}
          onClose={onMobileNavClose}
          pendingPath={pendingPath}
        />
      <header
        style={{
          background: "transparent",
          height: "3.25rem",
          display: "flex",
          alignItems: "center",
          padding: "0 1rem",
          gap: "0.625rem",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onMobileMenuOpen}
          style={{
            width: "2.125rem",
            height: "2.125rem",
            borderRadius: "0.5rem",
            border: "0.0625rem solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Menu size={16} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <span
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "1rem",
            fontWeight: 700,
            color: "#fff",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {pendingPath != null ? (
            <NavRadialSpinner
              size={18}
              style={{ color: "rgba(255,255,255,0.85)" }}
              aria-label="Loading page"
              aria-hidden={false}
            />
          ) : (
            TitleIcon && <TitleIcon size={18} strokeWidth={1.75} style={{ flexShrink: 0, color: "rgba(255,255,255,0.85)" }} />
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleText}</span>
        </span>
        {languageLabel != null && onLanguageClick && (
          <button
            type="button"
            onClick={onLanguageClick}
            style={{
              height: "2rem",
              padding: "0 0.5rem",
              borderRadius: "0.4375rem",
              border: shellChrome.border,
              background: shellChrome.background,
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: shellChrome.text,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            🌐 {languageLabel}
          </button>
        )}
        {rightSlot ?? (
          <>
            {searchPlaceholder != null && <ExpandableSearch placeholder={searchPlaceholder} />}
            <TrialTopBarPill />
            {syncControl}
            <NotificationBellDropdown />
            <ProfileDropdown
              userName={userName}
              profileSubtext={profileSubtext}
              onSignOut={onSignOut}
              portalSwitch={portalSwitch}
              isMobile
            />
          </>
        )}
      </header>
      </>
    );
  }

  return (
    <header
      style={{
        position: "relative",
        background: "transparent",
        minHeight: "3.5rem",
        display: "flex",
        alignItems: "center",
        padding: "0.375rem 1.25rem",
        gap: "0.75rem",
        flexShrink: 0,
      }}
    >
      <TopNavBar
        brand={brand}
        navItems={navItems}
        bottomNavItem={bottomNavItem}
        pendingPath={pendingPath}
        centerNav
      />
      {centerSlot}
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexShrink: 0,
        }}
      >
        {languageLabel != null && onLanguageClick && (
          <button
            type="button"
            onClick={onLanguageClick}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              height: "2rem",
              padding: "0 0.625rem",
              borderRadius: "0.4375rem",
              border: shellChrome.border,
              background: shellChrome.background,
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: shellChrome.text,
              cursor: "pointer",
            }}
          >
            🌐 {languageLabel}
          </button>
        )}
        {rightSlot ?? (
          <>
            {searchPlaceholder != null && <ExpandableSearch placeholder={searchPlaceholder} />}
            <TrialTopBarPill />
            {syncControl}
            <NotificationBellDropdown />
            <ProfileDropdown
              userName={userName}
              profileSubtext={profileSubtext}
              onSignOut={onSignOut}
              portalSwitch={portalSwitch}
            />
          </>
        )}
      </div>
    </header>
  );
}
