# API Versioning & Lifecycle Strategy

The RMS API adheres to standard URI versioning to ensure backward compatibility and smooth upgrades.

## Current Version
- Base Path: `/api/v1` (Current Stable)
- Future Version: `/api/v2` (Supported with active migration paths)

## Backward Compatibility Policy
- Existing fields are never removed or renamed within a major version.
- New fields and non-breaking optional query parameters may be added to `/api/v1`.
- When a major version is deprecated, a minimum 6-month deprecation grace period is provided with warnings returned in HTTP headers.
