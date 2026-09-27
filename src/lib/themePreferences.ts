import type { AppSettings } from '@/lib/store';

/**
 * Tenant settings are shared business configuration, while light/dark mode is a
 * personal device preference. Strip darkMode before applying remote settings so
 * route-level tenant hydration cannot unexpectedly flip the user's theme.
 */
export function sanitizeRemoteTenantSettings(
  remoteSettings: Partial<AppSettings> | null | undefined
): Partial<AppSettings> {
  if (!remoteSettings) return {};
  const { darkMode: _ignoredRemoteTheme, ...safeSettings } = remoteSettings;
  return safeSettings;
}
