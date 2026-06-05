import type { LucideIcon } from "lucide-react";

export interface NavItemChild {
  path: string;
  label: string;
}

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** De-emphasized link (e.g. bulk media library, not the main workflow). */
  secondary?: boolean;
  children?: NavItemChild[];
}

export interface BrandConfig {
  name: string;
  subtitle?: string;
  icon: LucideIcon;
  logoColor?: string;
  logoUrl?: string;
}

export interface AppLayoutConfig {
  navItems: NavItem[];
  /** Optional extra nav link rendered after primary items (e.g. settings). */
  bottomNavItem?: NavItem;
  brand: BrandConfig;
  getPageTitle?: (pathname: string) => string;
  fullScreenPaths?: string[];
  fontFamily?: string;
  outerBg?: string;
  contentCardBg?: string;
}
