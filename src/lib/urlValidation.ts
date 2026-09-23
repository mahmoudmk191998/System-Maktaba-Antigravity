/**
 * URL Validation Utilities
 * Validates direct external image URLs safely, preventing dangerous schemes
 * like javascript:, data:, file:, etc.
 */

export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    // Only permit http: and https: protocols
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    // Hostname must be valid
    if (!parsed.hostname || parsed.hostname.includes(' ')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
