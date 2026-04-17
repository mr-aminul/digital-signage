import type { CSSProperties } from "react";

/**
 * Central place for image/logo URLs and theme colors (aligned with Auth Basement template).
 */
export const assets = {
  logoUrl: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/webp/microsoft-365.webp" as string,
  loginBackgroundValue:
    "https://i.pinimg.com/736x/21/16/59/21165977ebcdc14db9ac23044c721820.jpg",
  layoutBackgroundValue: "#040D31",
  themePrimary: "#040D31",
  themePrimaryContrast: "#FFFFFF",
} as const;

export type AssetsConfig = typeof assets;

const isImageUrl = (v: string) => /^(https?:|\/)/.test(v.trim());

export function getBackgroundStyle(value: string): CSSProperties {
  if (!value) return {};
  if (isImageUrl(value)) {
    return {
      backgroundImage: `url('${value}')`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }
  return { background: value };
}
