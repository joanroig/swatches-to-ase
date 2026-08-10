# AGENTS Guidelines for This Repository

Palette Studio is a multi-target project:

- **Web GUI** (Vite) lives under `web/`.
- **Desktop app** (Electron) lives under `electron/` and reuses the web UI.
- **CLI/convert tooling** lives under `src/`.
- **Android wrapper** (Capacitor) is configured via `@capacitor/*` and uses the web build.

When working on the project interactively with an agent (e.g. the Codex CLI) please follow
the guidelines below to keep the dev experience smooth.

## 0. Prerequisites

- **Node.js:** `>=22.12.0` (see `package.json` engines).
- **Package manager:** npm (lockfile is `package-lock.json`).

## 1. Use the correct dev entrypoint

- **Web UI (Vite):** `npm run dev:web` (hot reload for `web/`).
- **Desktop (Electron + Vite):** `npm run dev:desktop` (starts Vite + Electron + TS watch).
- **CLI conversion:** `npm run convert` (reads `palette-in/`, writes to `palette-out/`).
- **Android (Capacitor):** `npm run build:android` then `npm run open:android` as needed.

Avoid `npm run build:web`, `npm run build:desktop`, or `npm run dist:desktop` unless you
explicitly need production assets or installers.

## 2. Keep dependencies in sync

If you add or update dependencies:

1. Update `package-lock.json` (this repo uses npm).
2. Re-start the dev server(s) so Vite/Electron pick up changes.

## 3. Testing expectations

After making changes, run both:

- **Unit tests:** `npm test`
- **UI tests:** `npm run test:gui`

Changes should be covered by unit tests whenever feasible.

## 4. Coding conventions

- Prefer TypeScript (`.ts`) for new components and utilities.
- Co-locate component-specific styles with the component when practical.
- Keep Electron main/renderer boundaries explicit when touching `electron/` or `web/`.

## 5. Keep code decoupled

Keep code modular so feature growth does not collapse into one entry file (e.g. `main.ts`).

- **Separate concerns:** isolate UI rendering, event wiring, and domain logic into their own modules; avoid mixing them in the same file.
- **Limit entrypoints:** entry files should bootstrap and delegate, not hold feature logic or large helpers.
- **Keep logic UI-free:** pure logic should not depend on `window`, `document`, or storage APIs; pass data in and return results.
- **Preserve platform boundaries:** shared/core code must stay framework-agnostic; platform layers (web/electron/cli) should depend on core, not the reverse.
- **Prefer clear data flow:** use explicit parameters and shared state modules instead of ad-hoc globals or cross-module DOM references.

## 6. Quality checks

- **Typecheck only:** `npm run typecheck`
- **Lint:** `npm run lint`
- **Format (fix):** `npm run format`

## 7. Firestore contract checks (cloud sync)

When changing cloud sync payloads or published palette schema, keep Firestore rules in sync.

- If you change payload shape/fields in files like `web/src/app/cloud/*`, `web/src/app/preferences.ts`, `web/src/app/types.ts`, or `web/src/app/share.ts`, review and update `firestore.rules` in the same change.
- Treat `permission-denied` during sync as a likely schema/rules mismatch first (before broader debugging).
- After rules changes, deploy rules for the active Firebase project before validating cloud sync in production-like environments.
- Keep `tests/web/cloud-sync.test.ts` and `tests/gui/cloud-sync.spec.ts` aligned with any payload/schema updates.

## 8. Useful commands recap

| Command                 | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `npm run dev:web`       | Start the Vite dev server for the web UI.    |
| `npm run dev:desktop`   | Start Electron + Vite in watch mode.         |
| `npm run convert`       | Run the CLI palette converter.               |
| `npm run build:android` | Build web assets and sync Capacitor Android. |
| `npm run open:android`  | Open the Android project in Android Studio.  |
| `npm run lint`          | Run ESLint checks.                           |
| `npm test`              | Run unit tests (Node test runner).           |
| `npm run test:gui`      | Run Playwright GUI tests.                    |
| `npm run build:web`     | Build static web assets into `dist-web/`.    |
| `npm run build:desktop` | Build desktop bundles into `dist-electron/`. |
| `npm run dist:desktop`  | Build desktop installers into `release/`.    |

---

When in doubt, use the dev commands above and restart the dev server rather than
producing builds during iteration.
