# Components and UI

## Entry point

`app/web/src/main.tsx:21` mounts the React tree inside `<QueryClientProvider>` and `<AuthProvider>`, then renders `<RouterProvider router={router} />`.

## Screen inventory

| Screen | Route | Component | Purpose | Layout |
|---|---|---|---|---|
| Landing | `/` | `public.tsx LandingPage` | Marketing, feature list, entry to app/lab | `AuthShell` |
| Log in | `/login` | `public.tsx LoginPage` | Password login | `AuthShell` |
| Sign up | `/signup` | `public.tsx SignupPage` | Account creation | `AuthShell` |
| Magic link request | `/magic` | `public.tsx MagicLinkRequest` | Request a one-time sign-in link | `AuthShell` |
| Magic link callback | `/magic?token=...` | `public.tsx MagicLinkCallback` | Consume token and sign in | `AuthShell` |
| Verify email | `/verify-email?token=...` | `public.tsx VerifyEmailPage` | Verify email address | `AuthShell` |
| App home | `/app` | `account.tsx AppHomePage` | List workspaces | `AuthShell` |
| Create workspace | `/app/onboarding/create` | `business.tsx CreateBusinessPage` | New business workspace form | `AuthShell` |
| Account | `/account` | `account.tsx AccountPage` | Profile, active sessions | `AuthShell` |
| Account security | `/account/security` | `account.tsx SecurityPage` | Same as Account | `AuthShell` |
| Workspace dashboard | `/app/:businessSlug/dashboard` | `business.tsx WorkspaceDashboardPage` | Overview + onboarding action | `WorkspaceFrame` |
| Workspace team | `/app/:businessSlug/team` | `business.tsx TeamPage` | Members, invitations, role edits | `WorkspaceFrame` |
| Workspace account | `/app/:businessSlug/account` | `business.tsx WorkspaceAccountPage` | Same as Account | `WorkspaceFrame` |
| Onboarding steps | `/app/:businessSlug/onboarding/:step` | `tenant.tsx TenantOnboardingPage` | Step-by-step setup | `OnboardingShell` inside `WorkspaceFrame` |
| Settings overview | `/app/:businessSlug/settings` | `tenant.tsx TenantSettingsPage` | Sync status + settings links | `WorkspaceFrame` |
| Settings sub-pages | `/app/:businessSlug/settings/profile|agent|knowledge|hours|widget` | `tenant.tsx TenantSettingsPage` with `section` prop | Form for each settings area | `WorkspaceFrame` |
| Invitation | `/invite/:token` | `business.tsx InvitationPage` | Accept or view invitation | `AuthShell` |
| Design system | `/design-system` | `DesignSystem.tsx` | Component gallery | `PageShell` |
| Test Agent | `/secret/test-agent` | `App.tsx TestAgent` | Browser voice call lab | `App` shell with `SideNav` |
| Knowledge Base | `/secret/knowledge-base` | `App.tsx KnowledgeBase` | Upload/delete documents | `App` shell with `SideNav` |
| Agent Settings | `/secret/agent-settings` | `App.tsx AgentSettingsView` | Configure single workflow | `App` shell with `SideNav` |

## Component hierarchy

### Public/auth shell

```text
AuthShell
├── public.tsx
│   ├── LandingPage
│   ├── LoginPage
│   ├── SignupPage
│   ├── MagicLinkPage
│   │   ├── MagicLinkRequest
│   │   └── MagicLinkCallback
│   └── VerifyEmailPage
│   └── AuthHeader
├── account.tsx
│   ├── AppHomePage
│   ├── AccountContent
│   ├── AccountPage
│   └── SecurityPage
├── business.tsx
│   ├── CreateBusinessPage
│   ├── WorkspaceDashboardPage
│   ├── WorkspaceAccountPage
│   ├── TeamPage
│   │   └── InviteMemberModal
│   └── InvitationPage
└── tenant.tsx
    ├── TenantOnboardingPage
    │   ├── OnboardingShell
    │   ├── ProfileForm
    │   ├── AgentForm
    │   ├── WidgetForm
    │   ├── HoursForm
    │   ├── KnowledgeManager
    │   └── ReviewPublish
    │       ├── SyncStatus
    │       └── BrowserTestCall
    └── TenantSettingsPage
        └── ConfigurationState
```

### Workspace frame

```text
WorkspaceShell
└── WorkspaceFrame
    ├── workspace sidebar (switcher + nav)
    ├── workspace-topbar (business name + role)
    └── children:
        ├── WorkspaceDashboardPage
        ├── TeamPage
        ├── WorkspaceAccountPage
        ├── TenantOnboardingPage
        └── TenantSettingsPage
```

### MVP lab shell

```text
App (default export)
├── sidebar
│   ├── brand
│   ├── SideNav
│   └── Dograh status badge
└── <Outlet />
    ├── TestAgent
    ├── KnowledgeBase
    └── AgentSettingsView
```

## Shared/reusable components

All reusable components live in `app/web/src/components/`. Props are defined in their source files.

### Shell components (`app/web/src/components/shell/`)

| Component | Props | Used by |
|---|---|---|
| `AuthShell` | `children`, `width?`, `style?` | `public.tsx`, `account.tsx`, `business.tsx` |
| `PageShell` | `children`, `nav?` | `DesignSystem.tsx` |
| `OnboardingShell` | `children`, `steps`, `currentSlug`, `title` | `tenant.tsx TenantOnboardingPage` |
| `PublicNav` / `TopNav` | none | `PageShell`, `LandingPage` |
| `SideNav` | `items`, `label` | `App.tsx` |
| `WorkspaceFrame` | `business`, `businesses`, `children` | `business.tsx WorkspaceShell` |

### UI primitives (`app/web/src/components/ui/`)

| Component | Props | Behavior |
|---|---|---|
| `Alert` | `children`, `title?`, `variant?: "info"\|"success"\|"warn"\|"error"` | Coloured status block; `error`/`warn` use `role="alert"` (`Alert.tsx:11`) |
| `Box` | `children`, `tone?`, `style?` | Rounded card with background/border/shadow (`Box.tsx:9`) |
| `Button` | `variant?`, `loading?`, standard button props | Disabled when loading, shows `Working…` (`Button.tsx:18`) |
| `ColorField` | `value`, `onChange`, `label?`, `error?`, `helper?`, `required?` | Native `<input type="color">` plus hex text input (`ColorField.tsx:14`) |
| `Dropdown` | `items`, `label` | Keyboard navigable, closes on outside click or Escape, returns focus to trigger (`Dropdown.tsx:14`) |
| `EmptyState` | `title`, `children?`, `icon?`, `action?` | Empty list placeholder (`EmptyState.tsx:10`) |
| `Field` | `children`, `label?`, `error?`, `helper?`, `required?` | Accessibility wrapper generating `id` and `descriptionId` (`Field.tsx:12`) |
| `LoadingState` | `label?` | Spinner + label (`LoadingState.tsx:5`) |
| `Modal` | `open`, `onClose`, `titleId`, `descriptionId?`, `children` | Focus trap, Escape/backdrop close, restores focus (`Modal.tsx:14`) |
| `Pill` | `variant?`, `children` | Status/tag chip (`Pill.tsx:10`) |
| `SelectField` | `options`, `label?`, `error?`, `helper?`, `required?` | Native `<select>` with caret (`SelectField.tsx:17`) |
| `TextArea` | `autoResize?` (default true), `label?`, `error?`, `helper?` | Auto-resizing textarea (`TextArea.tsx:18`) |
| `TextField` | `label?`, `error?`, `helper?`, `mono?` | Wrapped `<input>` (`TextField.tsx:12`) |

## Navigation and routing

`app/web/src/router.tsx:315` exports the router and `app/web/src/router.tsx:317` sets `defaultPreload: "intent"` and `scrollRestoration: true`.

### Route guards

Protected routes use `beforeLoad` to call `api.auth.session()` and redirect to `/login` with `?redirect=<full url>`:

- `/app` (`router.tsx:92`)
- `/app/onboarding/create` (`router.tsx:107`)
- `/app/$businessSlug` and children (`router.tsx:122`)
- `/account` and `/account/security` (`router.tsx:208`, `223`)

### Redirects

- `/app` → user chooses workspace from list.
- `/app/$businessSlug` → `/app/$businessSlug/dashboard` (`router.tsx:137`).
- `/secret` → `/secret/test-agent` (`router.tsx:259`).

### Not found

- Root not found shows `This page does not exist` with a link to `/secret/test-agent` (`router.tsx:42`).
- `/secret/*` not found shows the same with the same link (`router.tsx:245`).

### Deep linking

`app/web/nginx.conf:8` serves `index.html` for all unknown paths, so a direct refresh of `/app/:slug/settings` works in the Docker web container.

