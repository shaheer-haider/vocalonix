# Vocalonix UI/UX & Layout Audit

This audit is organized screen-by-screen and cross-cutting. Each item follows the requested format: **Current → Problem → Proposed change → Why**.

## 1. Cross-cutting navigation & consistency

### 1.1 Internal links use `<a href>` and `window.location`

- **Current**: `WorkspaceFrame` (`business.tsx:276-350`), `WorkspaceDashboardPage` (`business.tsx:507-538`), `TenantSettingsPage` (`tenant.tsx:1131-1147`), `public.tsx` auth success screens (`public.tsx:439-502`), `AppHomePage` workspace list (`account.tsx:72-83`), and the workspace switcher (`business.tsx:281-287`) all trigger full-page reloads.
- **Problem**: Every internal navigation tears down React state, re-fetches the session, and flashes the browser. This defeats the SPA architecture.
- **Proposed change**: Replace all internal anchors with `Link` from `@tanstack/react-router`; use `useNavigate()` (or `window.history`/router APIs) for the workspace switcher.
- **Why**: Proximity + Fitts's law: users expect instant navigation inside an app. Full reloads increase perceived latency and can discard unsaved draft state in onboarding.

### 1.2 Success / "continue" notices use string-suffix matching for color

- **Current**: `ProfileForm`, `AgentForm`, and `WidgetForm` set `variant={notice.endsWith("saved.") ? "success" : "error"}` (`tenant.tsx:205`, `323`, `411`).
- **Problem**: Display logic depends on the exact English sentence ending. A copy change or translation silently breaks success/error coloring.
- **Proposed change**: Use a small state shape `{ message: string; variant: "success" | "error" }` and render `<Alert variant={notice.variant}>`.
- **Why**: Consistency and maintainability; visual state should be explicit, not derived by parsing text.

### 1.3 "Working…" loading text replaces button children entirely

- **Current**: `Button.tsx:35` renders `{loading ? "Working…" : children}`.
- **Problem**: The label of a submitting button changes to a generic word; users lose context (e.g. "Save & publish" becomes "Working…").
- **Proposed change**: Keep the original label visible, add an `aria-label` indicating loading, and show a spinner. Example: `aria-label="Saving widget settings"` with an inline spinner.
- **Why**: Predictability; users should still know which action they triggered.

### 1.4 Empty states are mixed across the app

- **Current**: `EmptyState.tsx` exists and is used in `KnowledgeManager` (`tenant.tsx:728-732`), but `App.tsx:273-278` and `App.tsx:362` roll custom empty-state `div`s.
- **Problem**: Inconsistent iconography, spacing, and typography.
- **Proposed change**: Replace all one-off empty-state markup with `EmptyState` and add an `icon` prop for the call/knowledge/agent cases.
- **Why**: Consistency; users learn the empty-state pattern once and recognize it everywhere.

---

## 2. Public / auth screens

### 2.1 Sign-up success preview link is hard to notice

- **Current**: After local sign-up with verification enabled, the alert shows a plain `<a href={previewUrl}>Verify this local account.</a>` (`public.tsx:270-274`).
- **Problem**: The primary next action (verify email) is inline text inside a warning alert, not a prominent button.
- **Proposed change**: Render the preview link as a primary button below the alert: `<a className="ui-button ui-button--primary" href={previewUrl}>Verify this local account →</a>`.
- **Why**: Visual hierarchy — the most important action on the screen should be the most prominent element.

### 2.2 Magic-link and verification success buttons use `<a>` with un-styled classes

- **Current**: `MagicLinkCallback` and `VerifyEmailPage` render `<a className="ui-button ui-button--primary full-width" href={...}>` (`public.tsx:439-444`, `497-502`).
- **Problem**: These are primary CTAs but are plain `<a>` tags. They work visually, but they cause full reloads and do not respect the disabled/loading state.
- **Proposed change**: Use the `Button` component (or a router-aware `Link` styled as a button) and `navigate` programmatically on success.
- **Why**: Consistency, accessibility, and SPA navigation.

### 2.3 Auth shell vertical rhythm is generous but card width is fixed

- **Current**: `AuthShell` takes a `width` prop and centers the card (`AuthShell.tsx:12`).
- **Problem**: On very small viewports the fixed `width` (e.g. 760 on landing) plus `padding: 48px 20px` can force horizontal overflow.
- **Proposed change**: Use `width: min(100%, ${width}px)` and add a `padding: 20px` media query.
- **Why**: Responsiveness; content should never overflow the viewport on mobile.

---

## 3. App home (`/app`)

### 3.1 Workspace list items are `<a>` tags without hover affordance

- **Current**: `AppHomePage` renders workspaces as `<a className="session-item" href={`/app/${business.slug}/dashboard`}>` (`account.tsx:72-83`).
- **Problem**: The entire row is clickable but has no hover/focus ring or arrow, so users may not realize it is a link.
- **Proposed change**: Convert to `Link` and add a visible hover state (subtle background shift + right arrow icon).
- **Why**: Discoverability; cards that navigate should look actionable.

### 3.2 "Create workspace" is a secondary button next to "Account settings"

- **Current**: `account.tsx:90-100` shows three ghost/outline buttons in a row.
- **Problem**: For a user with no businesses, "Create workspace" is the primary task but it shares visual weight with secondary actions.
- **Proposed change**: When `businesses.length === 0`, make "Create workspace" the sole primary CTA centered below the empty-state alert; hide or de-emphasize "Account settings" and "MVP lab".
- **Why**: Information hierarchy — the empty state should have one clear next action.

---

## 4. Workspace shell and dashboard (`/app/:slug/dashboard`)

### 4.1 Sidebar uses a native `<select>` for workspace switching

- **Current**: `WorkspaceFrame` has a `<select>` that calls `window.location.assign` on change (`business.tsx:281-287`).
- **Problem**: Native selects are fine for a few items, but they (a) trigger a full reload, (b) cannot show extra context (role, initial), and (c) become unwieldy beyond ~20 workspaces.
- **Proposed change**: Replace with a custom `Dropdown` or a searchable combobox that calls `navigate()` and preserves the route tail.
- **Why**: Frequency of use + discoverability; workspace switching is a core action and should feel instant.

### 4.2 Dashboard cards use `<a className="ui-button">` links

- **Current**: `WorkspaceDashboardPage` renders "Open settings", "Open onboarding", and "Manage team" as `<a>` tags (`business.tsx:507-538`).
- **Problem**: They look like buttons but behave like links, and they cause full reloads.
- **Proposed change**: Use `Button` with `onClick={() => navigate(...)}` or a `Link` component styled as a button.
- **Why**: Consistency; the same visual element should behave the same way everywhere.

### 4.3 Dashboard "Permissions" card is low-value for Viewers

- **Current**: The permissions card (`business.tsx:528-538`) only displays the current role and a disabled explanation for non-managers.
- **Problem**: It consumes prime real estate without actionable value for most roles.
- **Proposed change**: Merge role info into the top-bar pill (`business.tsx:344`) and remove the permissions card for Viewers/Staff, or replace it with a "View widget" / "Test agent" card.
- **Why": Proximity — role is already shown near the business name; duplicating it wastes space.

---

## 5. Team page (`/app/:slug/team`)

### 5.1 Role changes happen instantly with no confirmation

- **Current**: `SelectField` in each row fires `updateRole` on every `onChange` (`business.tsx:686-691`).
- **Problem**: A single mis-click downgrades an Owner to Viewer with no undo or confirmation.
- **Proposed change**: Add a "Save" button per row (or an inline confirm step) for role changes, or at minimum require a `Modal` confirmation when moving from a higher to a lower rank.
- **Why**: Error prevention; destructive/pervasive changes should not be one-click.

### 5.2 "Revoke" member button is `variant="ghost"` and unconfirmed

- **Current**: `business.tsx:699-704` uses a ghost-styled button that immediately calls `removeMember`.
- **Problem**: Revoking a member is destructive and irreversible (membership becomes `status='revoked'`), yet it has the lowest visual prominence and no confirmation.
- **Proposed change**: Use `variant="destructive"` and wrap the call in a `Modal` confirmation with the member's name and role.
- **Why**: Visibility of system status + error prevention; destructive actions should be obvious and require confirmation.

### 5.3 Pending invitations have cramped action buttons

- **Current**: Invitation rows show `Resend` and `Revoke` as small inline buttons (`business.tsx:724-759` truncated). The buttons are not separated by enough whitespace.
- **Problem**: Touch targets may be too close on mobile; accidental taps likely.
- **Proposed change**: Increase gap between row actions (at least 12 px) and use icon-only buttons with `aria-label` for mobile, or text buttons on desktop.
- **Why**: Fitts's law + touch targets; action buttons need adequate spacing.

---

## 6. Onboarding & settings (`/app/:slug/onboarding/*` and `/app/:slug/settings/*`)

### 6.1 Step navigation is full-page reload between steps

- **Current**: `ProfileForm`, `AgentForm`, `WidgetForm` call `window.location.assign(nextHref)` after save (`tenant.tsx:151`, `247`, `369`).
- **Problem**: Each step transition reloads the entire app, resetting scroll and any local UI state.
- **Proposed change**: Use `navigate(nextHref)` and store the current step completion in `business_onboarding` before navigating.
- **Why**: Flow continuity; onboarding should feel like a single coherent journey.

### 6.2 Settings overview links are plain `<a>` tags in a grid

- **Current**: `TenantSettingsPage` overview renders five `<a>` tags (`tenant.tsx:1131-1135`) and a "Resume onboarding" button (`tenant.tsx:1143-1148`).
- **Problem**: The links cause full reloads, and the cards do not summarize the current state (e.g. whether profile/agent/widget are filled in).
- **Proposed change**: Render a dashboard-style list with status pills (`Incomplete` / `Complete`) and use `Link` for navigation. Show a disabled or "Already published" state for onboarding once `publishedAt` is set.
- **Why**: Progress visibility; users should see at a glance which settings still need attention.

### 6.3 "Resume onboarding" button is shown even after publishing

- **Current**: `TenantSettingsPage` overview always builds the onboarding URL from `data.onboarding.currentStep` (`tenant.tsx:1143-1148`).
- **Problem**: Once published, `currentStep` is still `"review"`, so the CTA says "Resume onboarding" and sends users back to review.
- **Proposed change**: If `data.onboarding.publishedAt` is set, show "Re-publish" or "Review configuration" instead.
- **Why**: Accurate labeling; the label should describe the actual destination.

### 6.4 Timezone is a free-text field

- **Current**: `ProfileForm` uses a `TextField` for timezone with helper text "Use an IANA timezone such as America/New_York" (`tenant.tsx:193-198`).
- **Problem**: Users can enter invalid timezones; no validation feedback until server returns an error.
- **Proposed change**: Replace with a searchable select populated from `Intl.supportedValuesOf('timeZone')` or a curated list, falling back to validation.
- **Why**: Error prevention; free-text IANA strings are error-prone.

### 6.5 Widget color hex text input lacks validation styling

- **Current**: `ColorField` text input has no `aria-invalid` and no visible error border (`ColorField.tsx:29-34`).
- **Problem**: When `widgetColor` is invalid, only the color picker is marked invalid; the text field does not communicate its error state.
- **Proposed change**: Pass `aria-invalid={error ? true : undefined}` and an `aria-describedby` pointing to the `Field` error message to the text input; add a red border class when `error` is present.
- **Why**: Accessibility; the text input is an equal participant in the field and should expose its error state to screen readers.

---

## 7. Knowledge management

### 7.1 Knowledge type selector is a dropdown with only three options

- **Current**: `SelectField` with "Text section", "Document", "Website reference" (`tenant.tsx:651-664`).
- **Problem**: Three mutually exclusive options are better shown as radio buttons or segmented control; the dropdown hides the choices.
- **Proposed change**: Use a radio group or three toggle buttons with icons.
- **Why**: Discoverability; all options should be visible for infrequent decisions.

### 7.2 Delete knowledge item has no confirmation

- **Current**: `KnowledgeManager` delete button immediately calls `api.businesses.deleteKnowledge` (`tenant.tsx:776-790` truncated).
- **Problem**: Deleting knowledge is destructive and triggers a Dograh-side cleanup via outbox; there is no confirmation.
- **Proposed change**: Add a `Modal` confirmation that explains the document will be removed from the agent's context.
- **Why**: Error prevention; destructive actions should be deliberate.

### 7.3 "Replace" action scrolls but does not highlight the form

- **Current**: Clicking "Replace" on a text item sets form state and calls `window.scrollTo({ top: 0, behavior: "smooth" })` (`tenant.tsx:770-770`).
- **Problem**: On long pages the form may already be visible; there is no focus ring or banner indicating the user is now editing a replacement.
- **Proposed change**: Move focus to the title field, add a non-dismissible banner "Replacing: {title}", and scroll only if needed.
- **Why**: Visibility of system status; users need clear feedback that the form context changed.

### 7.4 Document processing status uses raw state strings

- **Current**: `KnowledgeManager` shows `{item.kind.replaceAll("_", " ")} · {item.state.replaceAll("_", " ")}` (`tenant.tsx:747-748`).
- **Problem**: States like "delete_pending" and "website_reference" are humanized by string replacement, which is fragile and untranslatable.
- **Proposed change**: Add a `displayState` map (`pending: "Queued"`, `processing: "Processing"`, etc.) and a `Pill` with color coding.
- **Why": Representation; status should use color + icon + stable labels, not string manipulation.

---

## 8. Secret MVP lab (`/secret/*`)

### 8.1 Test Agent status badge is far from the call control

- **Current**: `StatusBadge` lives in the sidebar footer (`App.tsx:536-539`), while the actual call widget renders in the main panel (`App.tsx:121-124`).
- **Problem**: Connection state is not co-located with the action it describes.
- **Proposed change**: Move the status badge inside the `call-card` near the "Ready when you are" heading.
- **Why**: Proximity; status should be next to the object it describes.

### 8.2 Knowledge Base delete uses native `window.confirm`

- **Current**: `App.tsx:198-199` calls `window.confirm("Delete \"${document.filename}\"?")`.
- **Problem**: Native confirms are unstyled, block the main thread, and are inconsistent with the polished Modal component used elsewhere.
- **Proposed change**: Replace with the `Modal` component and a destructive action.
- **Why**: Consistency; the design system has a modal specifically for this purpose.

### 8.3 Agent Settings uses custom alert `div`s

- **Current**: `App.tsx:120`, `258`, `378-379`, `486`, `494` use `<div className="alert alert--error">` or `<div className="alert alert--success">`.
- **Problem**: These bypass the `Alert` component, so `role="alert"` and variant props are not guaranteed.
- **Proposed change**: Use the `Alert` component everywhere.
- **Why**: Consistency and accessibility; the component already provides the right ARIA attributes.

---

## 9. Account settings (`/account`)

### 9.1 Active sessions list has no per-session logout action

- **Current**: `AccountContent` lists sessions with "This browser" / "Another session" and a timestamp (`account.tsx:181-195`).
- **Problem**: Users cannot revoke a single suspicious session; they must use "Log out everywhere".
- **Proposed change**: Add a "Revoke" button for each non-current session (and optionally the current one) that calls a new `DELETE /api/auth/sessions/:id` endpoint.
- **Why": User control; per-session revocation is a standard security feature.

### 9.2 "Log out everywhere" has no confirmation

- **Current**: `account.tsx:207-213` is a destructive `Button variant="destructive"` that immediately signs the user out of all sessions.
- **Problem**: No confirmation; a mis-click logs the user out everywhere.
- **Proposed change**: Wrap in a `Modal` confirmation or require typing the account email for extra-sensitive accounts.
- **Why**: Error prevention; destructive and security-sensitive actions should require intent.

---

## 10. Responsiveness

### 10.1 Workspace sidebar remains fixed at 260 px down to 720 px

- **Current**: `.workspace-shell { grid-template-columns: 260px minmax(0, 1fr); }` (`styles.css:374-377`) and only collapses at `max-width: 720px` (`styles.css:1714`).
- **Problem**: On tablets in the 720–980 px range, the 260 px sidebar plus padding leaves only ~500 px for the main content, causing the data table and forms to feel cramped.
- **Proposed change**: Collapse or transform the sidebar into a topbar / hamburger menu at `max-width: 980px` (matching `.workspace-grid` and `.settings-grid` breakpoints) instead of 720 px.
- **Why**: Consistent breakpoints; the main content grid already stacks at 980 px, so the chrome should adapt then too.

### 10.2 Secret lab sidebar has no horizontal scroll protection on very small screens

- **Current**: `.app-shell { grid-template-columns: 238px minmax(0, 1fr); }` (`styles.css:1110-1113`) collapses at 720 px, but the sidebar contains a status footer that can wrap awkwardly.
- **Problem**: Long status text ("Unprotected MVP lab · Dograh starting") can force the sidebar wider than 238 px on narrow viewports before the breakpoint hits.
- **Proposed change**: Add `word-break: break-word` to `.sidebar-footer p` and a `minmax(0,1fr)` constraint on the main area.
- **Why**: Responsiveness; fixed sidebars need overflow protection.

### 10.3 Landing feature grid stays 3-column until 720 px

- **Current**: `.feature-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }` (`styles.css:235-237`) only collapses at 720 px (`styles.css:1757`).
- **Problem**: On tablets (e.g. 768 px width), three equal columns produce very narrow cards with small text.
- **Proposed change**: Collapse to 2 columns at 980 px and 1 column at 640 px.
- **Why**: Readability; line length and tap targets should remain comfortable on tablets.

---

## 11. Accessibility

### 11.1 `SelectField` uses a native `<select>` without associating label

- **Current**: `SelectField.tsx` renders `<select {...props}>` after spreading `register()`.
- **Problem**: If the `id` generated by `Field` is not forwarded through the spread, the `<label>` may not point to the `<select>`. The file is small but the spread makes it hard to verify.
- **Proposed change**: Explicitly pass `id={fieldId}` to the `<select>` and `aria-describedby={descriptionId}`.
- **Why**: Screen-reader users rely on `label[for]` or `aria-labelledby` to understand the field.

### 11.2 Loading states do not announce to screen readers

- **Current**: `LoadingState` has `role="status"` (`LoadingState.tsx:7`), which is good, but many route-level loading states are not marked.
- **Problem**: During initial route load (e.g. `WorkspaceShell` waiting for `useBusinesses`), there is no `aria-live` announcement.
- **Proposed change**: Wrap route-level loaders in `role="status" aria-live="polite"`.
- **Why**: Users on screen readers need to know that content is loading.

### 11.3 `Data table` rows lose semantic table structure

- **Current**: The team table is built with CSS grid `div`s (`business.tsx:657-710`, `styles.css:451-468`).
- **Problem**: Grid `div`s are not exposed as a table to assistive technologies; column headers are not associated with cells.
- **Proposed change**: Use `<table>`, `<thead>`, `<tbody>`, `<th scope="col">`, and `<td>` for tabular data, then style with CSS.
- **Why": Screen readers announce row/column relationships only for semantic tables.

---

## 12. Representation / data display

### 12.1 Role names are plain text instead of `Pill` + color

- **Current**: Team member roles are shown inside a `SelectField` or as `<Pill>{member.role}</Pill>` (`business.tsx:694`).
- **Problem**: No color/icon distinction between Owner (red/important), Admin, Manager, Staff, Viewer (read-only).
- **Proposed change**: Introduce a `rolePillVariant` map and render `Owner` as `warn`, `Viewer` as `info`, etc.
- **Why**: Preattentive processing; color + label helps users quickly understand permission levels.

### 12.2 Invitation status/state is not shown for accepted/revoked/expired

- **Current**: `TeamPage` only lists pending invitations (`business.tsx:721-759` truncated).
- **Problem": Users cannot see historical invitations (accepted, revoked, expired) to audit access changes.
- **Proposed change**: Add a "History" tab or expandable section with all invitations and their final state, using color-coded pills.
- **Why": Auditability and trust; users need to see who was invited and what happened.

### 12.3 Sync status is buried in settings overview

- **Current**: `SyncStatus` is rendered only in `TenantSettingsPage` overview (`tenant.tsx:1127`).
- **Problem": The Dograh sync state (pending / synced / failed) is the most important operational signal for the workspace, but it is not shown on the Dashboard.
- **Proposed change**: Surface `SyncStatus` on `WorkspaceDashboardPage` and the workspace sidebar footer.
- **Why": Frequency of use + visibility; sync health is a core system status, not a settings detail.

---

## 13. Flows

### 13.1 Sign-up → verification → dashboard flow has a dead-end preview

- **Current**: With verification enabled locally, the user lands on a success alert with a preview link and no automatic redirect (`public.tsx:220-228`).
- **Problem**: After clicking the preview and verifying, the user must manually navigate to `/app`.
- **Proposed change**: After successful verification, `VerifyEmailPage` should call `auth.refresh()` and `navigate('/app')` automatically.
- **Why**: Flow completion; remove the final dead-end step.

### 13.2 Onboarding has five steps but no "skip" or "save & exit" option

- **Current**: Each onboarding form has "Save and continue →" but no way to exit and resume later without finishing the step.
- **Problem": Users may need to leave mid-onboarding; currently they must complete or abandon the step.
- **Proposed change**: Add a secondary "Save draft" button that persists the current form and returns to `/app/:slug/dashboard`.
- **Why": User control; long forms should allow partial progress.

### 13.3 Invitation accept flow does not surface email mismatch clearly

- **Current**: The `InvitationPage` (not shown in full, inferred from routes and workspace routes) handles `INVITATION_EMAIL_MISMATCH`.
- **Problem**: If the logged-in user's email differs from the invited email, the error may be a generic alert with no clear next action.
- **Proposed change**: Show a dedicated card explaining the mismatch, offering to "Log out and create a new account with {invitedEmail}" or "Continue to {businessName}".
- **Why**: Clarity; email-bound invitations require a clear mismatch path.
