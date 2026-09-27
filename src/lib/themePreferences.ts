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

/**
 * Tailwind semantic colors in this project use hsl(var(--primary)).
 * Appearance settings store the brand color as HEX, so convert it to an HSL
 * triplet before injecting it into the CSS variable.
 */
export function hexToHslTriplet(hex: string): string | null {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
