# Official SDK Publishing & Automated Release Pipeline

This document details the automated CI/CD and release architecture for the official **`@rms/sdk`** package on npm.

---

## 1. Release Architecture

The `@rms/sdk` package follows strict **Semantic Versioning (SemVer)** and an **Intentional Release Model**:
- Pushes to `main` do **NOT** publish to npm.
- Pull requests run verification quality gates (`.github/workflows/sdk-ci.yml`) across Node.js 18.x, 20.x, and 22.x.
- Releases are triggered exclusively by pushing a SemVer Git tag (e.g. `v1.0.0` or `sdk-v1.0.0`) or via manual workflow dispatch with dry-run protection.

---

## 2. CI/CD Quality Gates & Security Controls

Every release must pass 7 automated quality gates:

```
Tag Pushed (v1.0.0)
       │
       ▼
1. Version Alignment Check (Tag matches package.json)
       │
       ▼
2. Duplicate Version Protection (Prevents overwriting published versions)
       │
       ▼
3. TypeScript Lint & Typecheck (`tsc --noEmit`)
       │
       ▼
4. Vitest Unit & Integration Test Suite
       │
       ▼
5. TypeScript Build (`tsc` -> .js, .d.ts, .d.ts.map)
       │
       ▼
6. Credential & Secret Scanner (`audit:secrets`)
       │
       ▼
7. Package Content Audit (`audit:package` via `npm pack --dry-run`)
       │
       ▼
8. npm Publish with Provenance (`npm publish --provenance --access public`)
       │
       ▼
9. GitHub Release Creation
```

---

## 3. Trusted Publishing (OIDC) & Least Privilege

The publishing workflow uses **GitHub Actions OIDC Trusted Publishing**:
- Uses short-lived OIDC tokens generated via `id-token: write`.
- Embeds cryptographic build provenance (`--provenance`) directly in the published npm package metadata.
- Avoids storing long-lived npm tokens when configured with npm Trusted Publishers.

---

## 4. Release Step-by-Step Checklist

When preparing a new release of `@rms/sdk`:

- [ ] **1. Bump Version**: Update `"version"` in `packages/rms-sdk/package.json` according to SemVer rules:
  - `PATCH` (`1.0.1`): Bug fixes and non-breaking improvements.
  - `MINOR` (`1.1.0`): New backward-compatible features and endpoints.
  - `MAJOR` (`2.0.0`): Breaking changes to the public SDK API.
- [ ] **2. Update Changelog**: Document all additions, modifications, and fixes in `packages/rms-sdk/CHANGELOG.md`.
- [ ] **3. Local Verification**:
  ```bash
  cd packages/rms-sdk
  npm run prepublishOnly
  ```
- [ ] **4. Commit & Tag**:
  ```bash
  git add packages/rms-sdk/package.json packages/rms-sdk/CHANGELOG.md
  git commit -m "chore(sdk): release v1.0.0"
  git tag v1.0.0
  git push origin main --tags
  ```
- [ ] **5. Monitor Workflow**: Check GitHub Actions under `SDK Release & Publish Pipeline`.
- [ ] **6. Post-Publish Verification**:
  ```bash
  npm view @rms/sdk version
  npm install @rms/sdk@latest
  ```

---

## 5. Rollback & Deprecation Strategy

npm registry packages are immutable once published. Never attempt to force overwrite an existing version.

If a critical issue is identified in a published version:
1. **Publish a Patch**: Immediately release a corrected version (e.g. `v1.0.1`).
2. **Deprecate the Broken Version**:
   ```bash
   npm deprecate @rms/sdk@1.0.0 "Critical issue in order submission; please upgrade to @rms/sdk@1.0.1"
   ```
