# design-sync notes — @vocalonix/web

Repo-specific gotchas for future `/design-sync` runs. Read this before re-syncing.

## Shape and layout

- This repo is an **app**, not a published component library. There is no library
  `dist/`, so the converter is pointed at a committed barrel:
  `app/web/.design-sync/entry.tsx`, which re-exports `src/components/ui`,
  `src/components/shell`, and the preview-only `PreviewProvider`.
- **The entry has to live inside `app/web/`.** `package-build.mjs` derives `PKG_DIR`
  by walking up from `--entry` to the first `package.json` with a `name`. An entry at
  the repo-root `.design-sync/` resolves `PKG_DIR` to the repo root, which silently
  breaks `srcDir`, `cssEntry`, `tsconfig`, `docsDir`, `@types/react` resolution and
  the `.d.ts` scan. Everything else (config, previews, docs, cache) stays at the
  repo-root `.design-sync/`, which is cwd-relative and unaffected.
- Components are enumerated explicitly in `cfg.componentSrcMap` (18 entries). There is
  no `.d.ts` export tree to discover from, so without the map the build reports
  `[ZERO_MATCH]`. **Adding a component to `src/components/{ui,shell}` will not sync
  until it is added to the map.**

## Install and build

- Package manager is **bun with the isolated linker**: workspace deps live in
  `app/web/node_modules`, and the repo-root `node_modules` holds only
  `concurrently`. Always pass `--node-modules app/web/node_modules`; the repo root
  has no `react` and no `@types/react`.
- `cfg.buildCmd` emits the declarations the prop extractor needs:
  `cd app/web && ./node_modules/.bin/tsc -p tsconfig.json --declaration --emitDeclarationOnly --noEmit false --outDir types`.
  Because `src/api.ts` type-imports `app/api/src/index`, tsc's inferred rootDir is
  `app/`, so declarations land under `app/web/types/web/src/...` — that is expected,
  not a misconfiguration. `app/web/types/` is gitignored and must be regenerated on
  every fresh clone; skipping it makes every `<Name>Props` come out empty
  (`[key: string]: unknown`) with no error.

## Preview context

- `app/web/.design-sync/preview-provider.tsx` supplies what the shell components read.
  Two non-obvious things in it:
  - It uses **`RouterProvider`, not `RouterContextProvider`**. `RouterContextProvider`
    does not populate router state, so `Link`/`useLocation` throw
    `Invariant failed: Could not find a nearest match!` and the card renders empty.
    Card content is therefore passed *through* the route tree via a React context.
  - It patches `window.fetch` for `/api/auth/session` and `/api/dograh/health` so
    `PublicNav` renders its signed-out state and the "Hear it now" link deterministically,
    with no network in the render check.
- `PublicNav` and `PageShell` are pinned to a **1100px viewport**: `styles.css` hides
  `.public-nav nav` below 980px, so a narrower card silently drops the three section
  links.
- `Modal` previews wrap each cell in a `transform: translateZ(0)` stage.
  `.ui-modal-backdrop` is `position: fixed`, and without a transformed ancestor to act
  as its containing block the dialog escapes the card and gets cropped.

## Known render warns

- `[FONT_REMOTE] "Gaegu", "Space Mono", "Gochi Hand"` — expected and correct. The
  fonts come from a Google Fonts `@import` at the top of `src/styles.css`; nothing is
  shipped in `fonts/`. No action.

## Design-system gaps found while authoring previews

These are real gaps in the DS, not preview problems. Worth fixing in the app.

- **Inputs have no `:disabled` styling.** `styles.css` styles `:disabled` for buttons
  only, so a disabled `TextField`/`TextArea`/`SelectField` is visually identical to an
  enabled one. The TextField preview deliberately has no `Disabled` cell because it
  would have been indistinguishable and misleading.
- **Buttons have no focus style.** There is no `.ui-button:focus-visible` rule, so
  focused buttons show the browser default blue ring — visible in the Modal card,
  where the focus trap focuses the first control. Off-brand for this kit.
- **`Dropdown`'s open state cannot be captured.** It opens on click only, with no
  `defaultOpen` prop, so its cards show the trigger. If the open panel should appear
  in the design system, the component needs an open-state prop.

## Re-sync risks

- **`componentSrcMap` and `dtsPropsFor`-shaped drift.** The component list is
  hand-enumerated; a rename in `src/components/` shows up as a missing component, not
  an error. Diff the map against `src/components/{ui,shell}/index.ts` when re-syncing.
- **`app/web/types/` is generated and gitignored.** A re-sync that skips `cfg.buildCmd`
  produces a technically-valid bundle with empty prop contracts. Always run the build
  command first.
- **The preview provider tracks two app internals**: `AuthProvider`'s import path and
  the two API routes it fetches. If auth moves, or the health endpoint changes, the
  shell cards degrade quietly (`PublicNav` falls back to its error state) rather than
  failing the render check.
- **Viewport pins are tied to a CSS breakpoint.** If the 980px `.public-nav` breakpoint
  in `styles.css` moves, the `PublicNav`/`PageShell` viewport overrides need to move
  with it.
- **Fonts are network-fetched at render time.** Cards render in fallback faces if the
  Google Fonts host is unreachable during a render check; that would show up as
  "unstyled-looking" cards rather than an error.
