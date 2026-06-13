/** Read booleans synced to auth.users.raw_app_meta_data (see sync_user_app_metadata). */

export function jwtAppMetadataFlag(
  appMetadata: unknown,
  key: "is_disabled" | "is_platform_staff",
): boolean | undefined {
  if (!appMetadata || typeof appMetadata !== "object") return undefined;
  const value = (appMetadata as Record<string, unknown>)[key];
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
}
