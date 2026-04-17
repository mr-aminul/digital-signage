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
  brand: BrandConfig;
  getPageTitle?: (pathname: string) => string;
  fullScreenPaths?: string[];
  fontFamily?: string;
  outerBg?: string;
  contentCardBg?: string;
}
