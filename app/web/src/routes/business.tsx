import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useParams } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  api,
  ApiClientError,
  type BusinessSummary,
  type PendingInvitation,
  type Role,
  type TeamMember,
} from "../api";
import { useAuth } from "../auth/AuthProvider";
import { AuthShell } from "../components/shell";
import {
  Alert,
  Box,
  Button,
  LoadingState,
  Modal,
  Pill,
  SelectField,
  TextField,
} from "../components/ui";
import { can, permissionRows, roles } from "../permissions";

const createBusinessSchema = z.object({
  name: z.string().min(2, "Enter a business name."),
  contactEmail: z.string().email("Enter a valid email.").optional().or(z.literal("")),
  city: z.string().max(120).optional(),
  country: z.string().length(2, "Use a two-letter country code."),
  timezone: z.string().min(1, "Select a timezone."),
  vertical: z.string().min(1, "Select a vertical."),
  locations: z.string().min(1, "Select a location count."),
});

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email."),
  role: z.enum(["Owner", "Admin", "Manager", "Staff", "Viewer"]),
});

type CreateBusinessValues = z.infer<typeof createBusinessSchema>;
type InviteValues = z.infer<typeof inviteSchema>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function useBusinessSlug(): string {
  const params = useParams({ strict: false }) as { businessSlug?: string };
  return params.businessSlug ?? "";
}

function useToken(): string {
  const params = useParams({ strict: false }) as { token?: string };
  return params.token ?? "";
}

function useBusinesses() {
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBusinesses(await api.businesses.list());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load workspaces.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { businesses, error, loading, refresh };
}

function workspaceTarget(pathname: string, targetSlug: string): string {
  const remainder = pathname.replace(/^\/app\/[^/]+/, "");
  const isWorkspaceSection =
    /^\/(dashboard|team|settings|billing)(?:\/|$)/.test(remainder);
  return `/app/${targetSlug}${isWorkspaceSection ? remainder : "/dashboard"}`;
}

function WorkspaceShell({
  children,
  requiredPermission,
}: {
  children: (business: BusinessSummary) => ReactNode;
  requiredPermission?: Parameters<typeof can>[1];
}) {
  const slug = useBusinessSlug();
  const { businesses, error, loading } = useBusinesses();
  const business = useMemo(
    () => businesses.find((candidate) => candidate.slug === slug),
    [businesses, slug],
  );

  if (loading) return <LoadingState label="Loading workspace…" />;

  if (error) {
    return (
      <AuthShell width={620}>
        <Alert variant="error">{error}</Alert>
      </AuthShell>
    );
  }

  if (!business) {
    return (
      <AuthShell width={620}>
        <Box style={{ padding: 24 }}>
          <h1 className="account-title">Workspace not found</h1>
          <p className="auth-card-copy">
            This workspace is unavailable or your membership was removed.
          </p>
          <Link className="ui-button ui-button--primary" to="/app">
            Return to app
          </Link>
        </Box>
      </AuthShell>
    );
  }

  if (requiredPermission && !can(business.role, requiredPermission)) {
    return (
      <WorkspaceFrame business={business} businesses={businesses}>
        <Box style={{ padding: 24 }}>
          <Pill variant="warn">{business.role}</Pill>
          <h1 className="account-title">You do not have access here</h1>
          <p className="auth-card-copy">
            Ask an Owner or Admin to update your workspace role.
          </p>
        </Box>
      </WorkspaceFrame>
    );
  }

  return (
    <WorkspaceFrame business={business} businesses={businesses}>
      {children(business)}
    </WorkspaceFrame>
  );
}

function WorkspaceFrame({
  business,
  businesses,
  children,
}: {
  business: BusinessSummary;
  businesses: BusinessSummary[];
  children: ReactNode;
}) {
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <a className="wordmark" href="/">
          vocalonix
        </a>
        <label className="workspace-switcher">
          <span>Workspace</span>
          <select
            value={business.slug}
            onChange={(event) => {
              window.location.assign(
                workspaceTarget(window.location.pathname, event.target.value),
              );
            }}
          >
            {businesses.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Workspace">
          <a className="nav-item" href={`/app/${business.slug}/dashboard`}>
            Dashboard
          </a>
          {can(business.role, "team.manage") ? (
            <a className="nav-item" href={`/app/${business.slug}/team`}>
              Team
            </a>
          ) : null}
          <a className="nav-item" href="/account">
            Account
          </a>
          <a className="nav-item" href="/secret/test-agent">
            MVP lab
          </a>
        </nav>
      </aside>
      <main className="workspace-main">
        <div className="workspace-topbar">
          <div>
            <p className="eyebrow">{business.role}</p>
            <h1>{business.name}</h1>
          </div>
          <a className="ui-button" href="/app/onboarding/create">
            New workspace
          </a>
        </div>
        {children}
      </main>
    </div>
  );
}

export function CreateBusinessPage() {
  const form = useForm<CreateBusinessValues>({
    resolver: zodResolver(createBusinessSchema),
    defaultValues: {
      name: "",
      contactEmail: "",
      city: "",
      country: "US",
      timezone: "America/New_York",
      vertical: "Beauty",
      locations: "1",
    },
  });
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <AuthShell width={560}>
      <div className="auth-header">
        <Link to="/" className="wordmark">
          vocalonix
        </Link>
      </div>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setNotice(null);
          const baseSlug = slugify(values.name) || "workspace";
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
            try {
              const business = await api.businesses.create({
                ...values,
                contactEmail: values.contactEmail || undefined,
                city: values.city || undefined,
                slug,
              });
              window.location.replace(`/app/${business.slug}/dashboard`);
              return;
            } catch (caught) {
              if (
                caught instanceof ApiClientError &&
                caught.code === "SLUG_TAKEN" &&
                attempt < 4
              ) {
                continue;
              }
              setNotice(
                caught instanceof Error
                  ? caught.message
                  : "Unable to create this workspace.",
              );
              return;
            }
          }
        })}
      >
        <Box style={{ padding: 24 }}>
          <p className="eyebrow">Step 1 of 1</p>
          <h1 className="account-title">Create a business workspace</h1>
          <p className="auth-card-copy">
            This creates the business, your Owner membership, and a pending
            Dograh workflow mapping in one transaction.
          </p>
          <div className="form-grid">
            <TextField
              label="Business name"
              error={form.formState.errors.name?.message}
              required
              {...form.register("name")}
            />
            <TextField
              label="Contact email"
              type="email"
              error={form.formState.errors.contactEmail?.message}
              {...form.register("contactEmail")}
            />
            <TextField
              label="City"
              error={form.formState.errors.city?.message}
              {...form.register("city")}
            />
            <TextField
              label="Country"
              error={form.formState.errors.country?.message}
              required
              {...form.register("country")}
            />
            <SelectField
              label="Timezone"
              error={form.formState.errors.timezone?.message}
              options={[
                { label: "Eastern", value: "America/New_York" },
                { label: "Central", value: "America/Chicago" },
                { label: "Mountain", value: "America/Denver" },
                { label: "Pacific", value: "America/Los_Angeles" },
              ]}
              {...form.register("timezone")}
            />
            <SelectField
              label="Vertical"
              error={form.formState.errors.vertical?.message}
              options={[
                { label: "Beauty", value: "Beauty" },
                { label: "Med spa", value: "Med spa" },
                { label: "Wellness", value: "Wellness" },
                { label: "Other", value: "Other" },
              ]}
              {...form.register("vertical")}
            />
            <SelectField
              label="Locations"
              error={form.formState.errors.locations?.message}
              options={[
                { label: "1", value: "1" },
                { label: "2", value: "2" },
                { label: "3–5", value: "3-5" },
                { label: "6+", value: "6+" },
              ]}
              {...form.register("locations")}
            />
          </div>
          {notice ? <Alert variant="error">{notice}</Alert> : null}
          <Button
            type="submit"
            variant="primary"
            className="full-width"
            loading={form.formState.isSubmitting}
          >
            Create workspace →
          </Button>
        </Box>
      </form>
    </AuthShell>
  );
}

export function WorkspaceDashboardPage() {
  return (
    <WorkspaceShell>
      {(business) => (
        <div className="workspace-grid">
          <Box style={{ padding: 20 }}>
            <Pill variant="good">Workspace active</Pill>
            <h2>Business control plane</h2>
            <p>
              {business.name} is ready for tenant-scoped onboarding and Dograh
              synchronization in the next phase.
            </p>
          </Box>
          <Box style={{ padding: 20 }}>
            <h2>Next setup step</h2>
            <p>
              Configure agent settings and knowledge from the existing MVP lab
              while tenant-scoped Dograh sync is being added.
            </p>
            <a className="ui-button" href="/secret/agent-settings">
              Open agent settings
            </a>
          </Box>
          <Box style={{ padding: 20 }}>
            <h2>Permissions</h2>
            <p>Your role is {business.role}.</p>
            <a className="ui-button" href={`/app/${business.slug}/team`}>
              Manage team
            </a>
          </Box>
        </div>
      )}
    </WorkspaceShell>
  );
}

export function TeamPage() {
  const slug = useBusinessSlug();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const team = await api.businesses.team(slug);
      setMembers(team.members);
      setInvitations(team.invitations);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load team.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function updateRole(userId: string, role: Role) {
    setError(null);
    try {
      await api.businesses.updateMemberRole(slug, userId, role);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to update this role.",
      );
    }
  }

  async function removeMember(userId: string) {
    setError(null);
    try {
      await api.businesses.removeMember(slug, userId);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to remove this member.",
      );
    }
  }

  async function revokeInvitation(invitationId: string) {
    setError(null);
    try {
      await api.businesses.revokeInvitation(slug, invitationId);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to revoke this invitation.",
      );
    }
  }

  async function resendInvitation(invitationId: string) {
    setError(null);
    try {
      const result = await api.businesses.resendInvitation(slug, invitationId);
      setPreviewUrl(result.previewUrl);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to resend this invitation.",
      );
    }
  }

  return (
    <WorkspaceShell requiredPermission="team.manage">
      {(business) => (
        <>
          <div className="account-heading">
            <div>
              <p className="eyebrow">Team</p>
              <h2>{business.name} members</h2>
            </div>
            <Button variant="primary" onClick={() => setInviteOpen(true)}>
              Invite member
            </Button>
          </div>
          {error ? <Alert variant="error">{error}</Alert> : null}
          {previewUrl ? (
            <Alert variant="warn">
              Email delivery is disabled locally.{" "}
              <a href={previewUrl}>Open the latest invite preview.</a>
            </Alert>
          ) : null}
          {loading ? (
            <LoadingState label="Loading team…" />
          ) : (
            <>
              <Box style={{ padding: 0, overflow: "hidden" }}>
                <div className="data-table">
                  <div className="data-table__row data-table__row--head">
                    <span>Member</span>
                    <span>Role</span>
                    <span>Joined</span>
                    <span>Actions</span>
                  </div>
                  {members.map((member) => (
                    <div className="data-table__row" key={member.userId}>
                      <span>
                        <strong>{member.name}</strong>
                        <small>{member.email}</small>
                      </span>
                      {business.role === "Owner" ||
                      (member.role !== "Owner" && member.role !== "Admin") ? (
                        <SelectField
                          aria-label={`Role for ${member.email}`}
                          value={member.role}
                          options={(business.role === "Owner"
                            ? roles
                            : roles.filter(
                                (role) =>
                                  role !== "Owner" && role !== "Admin",
                              )
                          ).map((role) => ({
                            label: role,
                            value: role,
                          }))}
                          onChange={(event) =>
                            void updateRole(
                              member.userId,
                              event.target.value as Role,
                            )
                          }
                        />
                      ) : (
                        <Pill>{member.role}</Pill>
                      )}
                      <span>{formatDate(member.joinedAt)}</span>
                      {business.role === "Owner" ||
                      (member.role !== "Owner" && member.role !== "Admin") ? (
                        <Button
                          variant="ghost"
                          onClick={() => void removeMember(member.userId)}
                        >
                          Revoke
                        </Button>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  ))}
                </div>
              </Box>

              <section className="account-section">
                <div className="account-section__heading">
                  <div>
                    <h2>Pending invitations</h2>
                    <p>Invites expire after seven days and are email-bound.</p>
                  </div>
                  <Pill>{invitations.length}</Pill>
                </div>
                {invitations.length === 0 ? (
                  <p className="auth-card-copy">No pending invitations.</p>
                ) : (
                  <div className="session-list">
                    {invitations.map((invitation) => (
                      <div className="session-item" key={invitation.id}>
                        <div>
                          <strong>{invitation.email}</strong>
                          <span>
                            {invitation.role} · expires{" "}
                            {formatDate(invitation.expiresAt)}
                          </span>
                        </div>
                        <div className="stack-row">
                          <Button
                            variant="ghost"
                            onClick={() => void resendInvitation(invitation.id)}
                          >
                            Resend
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => void revokeInvitation(invitation.id)}
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
          <InviteMemberModal
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            onCreated={async (url) => {
              setPreviewUrl(url);
              setInviteOpen(false);
              await refresh();
            }}
            roles={
              business.role === "Owner"
                ? roles
                : roles.filter((role) => role !== "Owner" && role !== "Admin")
            }
            slug={slug}
          />
        </>
      )}
    </WorkspaceShell>
  );
}

function InviteMemberModal({
  onClose,
  onCreated,
  open,
  roles,
  slug,
}: {
  onClose: () => void;
  onCreated: (previewUrl: string | null) => Promise<void>;
  open: boolean;
  roles: Role[];
  slug: string;
}) {
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "Staff" },
  });
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal open={open} onClose={onClose} titleId="invite-member-title">
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          try {
            const result = await api.businesses.invite(slug, values);
            await onCreated(result.invitation.previewUrl);
            form.reset();
          } catch (caught) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Unable to send this invitation.",
            );
          }
        })}
      >
        <h2 id="invite-member-title">Invite a teammate</h2>
        <TextField
          label="Email"
          type="email"
          error={form.formState.errors.email?.message}
          required
          {...form.register("email")}
        />
        <SelectField
          label="Role"
          error={form.formState.errors.role?.message}
          options={roles.map((role) => ({ label: role, value: role }))}
          {...form.register("role")}
        />
        {error ? <Alert variant="error">{error}</Alert> : null}
        <div className="stack-row">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={form.formState.isSubmitting}
          >
            Send invite →
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function InvitationPage() {
  const auth = useAuth();
  const token = useToken();
  const [lookup, setLookup] = useState<Awaited<
    ReturnType<typeof api.invitations.get>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailMismatch, setEmailMismatch] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const redirect = encodeURIComponent(`/invite/${token}`);

  useEffect(() => {
    let cancelled = false;
    void api.invitations
      .get(token)
      .then((result) => {
        if (!cancelled) setLookup(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLookup({ state: "invalid" });
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load this invitation.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function acceptInvitation() {
    setAccepting(true);
    setError(null);
    setEmailMismatch(false);
    try {
      const result = await api.invitations.accept(token);
      window.location.replace(`/app/${result.businessSlug}/dashboard`);
    } catch (caught) {
      setEmailMismatch(
        caught instanceof ApiClientError &&
          caught.code === "INVITATION_EMAIL_MISMATCH",
      );
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to accept this invitation.",
      );
      setAccepting(false);
    }
  }

  if (!lookup || auth.status === "loading") {
    return <LoadingState label="Loading invitation…" />;
  }

  const invitation = lookup.invitation;
  const stateCopy: Record<typeof lookup.state, { title: string; body: string }> = {
    invalid: {
      title: "Invalid invitation",
      body: "This invitation link is invalid or no longer exists.",
    },
    expired: {
      title: "Invitation expired",
      body: "Ask the workspace owner to resend your invitation.",
    },
    revoked: {
      title: "Invitation revoked",
      body: "This invitation was revoked by the workspace team.",
    },
    accepted: {
      title: "Invitation already accepted",
      body: "This invitation has already been used.",
    },
    valid: {
      title: `Join ${invitation?.businessName ?? "this workspace"}`,
      body: invitation
        ? `${invitation.inviterName} invited ${invitation.email} as ${invitation.role}.`
        : "This invitation is ready to accept.",
    },
  };

  return (
    <AuthShell width={520}>
      <div className="auth-header">
        <Link to="/" className="wordmark">
          vocalonix
        </Link>
      </div>
      <Box style={{ padding: 24, textAlign: "center" }}>
        <Pill variant={lookup.state === "valid" ? "accent" : "warn"}>
          {lookup.state}
        </Pill>
        <h1 className="account-title">{stateCopy[lookup.state].title}</h1>
        <p className="auth-card-copy">{stateCopy[lookup.state].body}</p>
        {invitation ? (
          <div className="invite-summary">
            <strong>{invitation.businessName}</strong>
            <span>Role · {invitation.role}</span>
            <span>Expires · {formatDate(invitation.expiresAt)}</span>
          </div>
        ) : null}
        {error ? (
          <Alert variant="error">
            {emailMismatch ? <strong>Email mismatch. </strong> : null}
            {error}
          </Alert>
        ) : null}
        {lookup.state === "valid" ? (
          auth.session ? (
            <Button
              variant="primary"
              className="full-width"
              loading={accepting}
              onClick={() => void acceptInvitation()}
            >
              Accept invitation →
            </Button>
          ) : (
            <div className="stack-row">
              <a
                className="ui-button ui-button--primary"
                href={`/login?redirect=${redirect}`}
              >
                Log in to accept
              </a>
              <a className="ui-button" href={`/signup?redirect=${redirect}`}>
                Create account
              </a>
            </div>
          )
        ) : (
          <Link className="ui-button full-width" to="/app">
            Return to Vocalonix
          </Link>
        )}
      </Box>
    </AuthShell>
  );
}
