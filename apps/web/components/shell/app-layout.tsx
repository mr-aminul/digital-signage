"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TopBar } from "./top-bar";
import { useBreakpoint } from "./use-breakpoint";
import type { AppLayoutConfig, NavItem } from "./types";
import { assets, getBackgroundStyle } from "@/lib/config/assets";

interface AppLayoutProps extends AppLayoutConfig {
  banner?: ReactNode;
  bottomNavItem?: NavItem;
  profileSubtext?: string;
  onSignOut?: () => void;
  getPageTitle?: (pathname: string) => string;
  searchPlaceholder?: string;
  topBarCenterSlot?: ReactNode;
  topBarRightSlot?: ReactNode;
  userName?: string;
  languageLabel?: string;
  onLanguageClick?: () => void;
  children: ReactNode;
}

export function AppLayout({
  navItems,
  brand,
  getPageTitle = () => "",
  fullScreenPaths = [],
  fontFamily = 'var(--font-poppins), Poppins, ui-sans-serif, system-ui, sans-serif',
  outerBg = "#1A3C6E",
  contentCardBg = "#F4F7FB",
  banner,
  bottomNavItem,
  profileSubtext,
  onSignOut,
  searchPlaceholder,
  topBarCenterSlot,
  topBarRightSlot,
  userName,
  languageLabel,
  onLanguageClick,
  children,
}: AppLayoutProps) {
  const pathname = usePathname();
  const { isMobile } = useBreakpoint();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) setIsMobileNavOpen(false);
  }, [isMobile]);

  const isFullScreen = fullScreenPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  const title = getPageTitle(pathname) || pathname || "App";
  const currentNavItem = navItems
    .filter((item) => {
      const end = item.end ?? item.path === "/";
      return end ? pathname === item.path : pathname === item.path || pathname.startsWith(`${item.path}/`);
    })
    .sort((a, b) => b.path.length - a.path.length)[0];
  const titleIcon = currentNavItem?.icon;

  if (isFullScreen) {
    return (
      <div
        style={{
          fontFamily,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {banner}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  const outerStyle = {
    fontFamily,
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    ...getBackgroundStyle(assets.layoutBackgroundValue || outerBg),
  } as const;

  return (
    <div style={outerStyle}>
      {banner}
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          padding: isMobile ? 0 : "0.5rem",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              background: contentCardBg,
              borderRadius: isMobile ? 0 : "0.75rem",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <TopBar
              title={title}
              titleIcon={titleIcon}
              brand={brand}
              navItems={navItems}
              bottomNavItem={bottomNavItem}
              mobileNavOpen={isMobileNavOpen}
              onMobileNavClose={() => setIsMobileNavOpen(false)}
              userName={userName}
              profileSubtext={profileSubtext}
              onSignOut={onSignOut}
              centerSlot={topBarCenterSlot}
              searchPlaceholder={searchPlaceholder}
              rightSlot={topBarRightSlot}
              languageLabel={languageLabel}
              onLanguageClick={onLanguageClick}
              onMobileMenuOpen={() => setIsMobileNavOpen(true)}
              isMobile={isMobile}
            />
            <main
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: isMobile ? "0.875rem" : "1.25rem",
              }}
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
