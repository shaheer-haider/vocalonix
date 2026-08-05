import "./contacts.css";

import { useEffect, useMemo, useRef, useState } from "react";

import { api, type Contact } from "../api";
import {
  Alert,
  Box,
  Button,
  EmptyState,
  TextArea,
  TextField,
} from "../components/ui";
import { WorkspaceShell } from "./business";

type Filter = "all" | "unnamed" | "tagged";

const CSV_TEMPLATE = "name,phone,email\nJane Smith,+44 7700 900123,jane@example.com\n";

function initials(contact: Contact): string {
  if (!contact.name) return "?";
  const parts = contact.name
    .split(" ")
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase());
  return parts.join("") || "?";
}

function sourceChip(source: Contact["source"]) {
  switch (source) {
    case "call":
      return { class: "contacts-source--warn", label: "HEARD ON A CALL" };
    case "import":
      return { class: "contacts-source--sync", label: "FROM AN IMPORT" };
    default:
      return { class: "contacts-source--good", label: "ADDED BY HAND" };
  }
}

function tagClass(tag: string): string {
  if (tag === "Blocked") return "contacts-tag--blocked";
  if (tag === "Complaint") return "contacts-tag--complaint";
  if (tag === "New") return "contacts-tag--new";
  return "contacts-tag--default";
}

function displayName(contact: Contact): string {
  return contact.name ?? contact.phone ?? contact.email ?? "Unknown";
}

function whenLabel(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function parseCsv(text: string): { name?: string; phone?: string; email?: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase().split(",").map((cell) => cell.trim());
  const nameIdx = header.indexOf("name");
  const phoneIdx = header.indexOf("phone");
  const emailIdx = header.indexOf("email");
  const hasHeader = nameIdx >= 0 || phoneIdx >= 0 || emailIdx >= 0;
  const rows = hasHeader ? lines.slice(1) : lines;
  return rows.map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    if (hasHeader) {
      return {
        name: nameIdx >= 0 ? cells[nameIdx] : undefined,
        phone: phoneIdx >= 0 ? cells[phoneIdx] : undefined,
        email: emailIdx >= 0 ? cells[emailIdx] : undefined,
      };
    }
    return { name: cells[0], phone: cells[1], email: cells[2] };
  });
}

function ContactsPage({ slug }: { slug: string }) {
  const [contactList, setContactList] = useState<Contact[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const toastRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const say = (msg: string) => {
    setToast(msg);
    if (toastRef.current) window.clearTimeout(toastRef.current);
    toastRef.current = window.setTimeout(() => setToast(""), 2400);
  };

  useEffect(() => {
    return () => {
      if (toastRef.current) window.clearTimeout(toastRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.businesses
      .contacts(slug)
      .then((result) => {
        if (cancelled) return;
        setContactList(result.contacts);
        setCanManage(result.canManage);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setLoadError(
          caught instanceof Error ? caught.message : "Unable to load contacts.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const pool = contactList ?? [];

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((c) => {
      if (q) {
        const hay = `${c.name ?? ""} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === "unnamed") return !c.name;
      if (filter === "tagged") return c.tags.length > 0;
      return true;
    });
  }, [pool, query, filter]);

  const selected = pool.find((c) => c.id === selectedId);
  const selectedVisible =
    selected && list.some((c) => c.id === selected.id)
      ? selected
      : list[0] ?? null;

  const unnamedCount = pool.filter((c) => !c.name).length;
  const countLabel =
    list.length === pool.length
      ? `${pool.length} PEOPLE`
      : `${list.length} OF ${pool.length}`;

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "Everyone" },
    { key: "unnamed", label: `No name ${unnamedCount}` },
    { key: "tagged", label: "Tagged" },
  ];

  function replaceContact(updated: Contact) {
    setContactList((prev) =>
      prev ? prev.map((c) => (c.id === updated.id ? updated : c)) : prev,
    );
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    setEditing(false);
    setNoteDraft(null);
    setAddingTag(false);
    setConfirmDelete(false);
  }

  async function handleCreate() {
    if (busy) return;
    setBusy(true);
    try {
      const { contact } = await api.businesses.createContact(slug, {
        name: newName,
        phone: newPhone,
        email: newEmail,
      });
      setContactList((prev) => (prev ? [contact, ...prev] : [contact]));
      setSelectedId(contact.id);
      setCreating(false);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      say(`${displayName(contact)} added`);
    } catch (caught) {
      say(caught instanceof Error ? caught.message : "Could not add the contact.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(file: File) {
    if (busy) return;
    const rows = parseCsv(await file.text());
    if (rows.length === 0) {
      say("No rows found in that file.");
      return;
    }
    setBusy(true);
    try {
      const { contacts: imported } = await api.businesses.importContacts(slug, rows);
      setContactList((prev) => (prev ? [...imported, ...prev] : imported));
      say(`Imported ${imported.length} ${imported.length === 1 ? "person" : "people"}`);
    } catch (caught) {
      say(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function patchContact(
    contactId: string,
    update: Parameters<typeof api.businesses.updateContact>[2],
    message: string,
  ) {
    if (busy) return;
    setBusy(true);
    try {
      const { contact } = await api.businesses.updateContact(slug, contactId, update);
      replaceContact(contact);
      say(message);
    } catch (caught) {
      say(caught instanceof Error ? caught.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(contact: Contact) {
    if (busy) return;
    setBusy(true);
    try {
      await api.businesses.deleteContact(slug, contact.id);
      setContactList((prev) => (prev ? prev.filter((c) => c.id !== contact.id) : prev));
      if (selectedId === contact.id) setSelectedId(null);
      setConfirmDelete(false);
      say(`${displayName(contact)} deleted`);
    } catch (caught) {
      say(caught instanceof Error ? caught.message : "Could not delete the contact.");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "contacts-template.csv";
    link.click();
    URL.revokeObjectURL(url);
    say("Template downloaded");
  }

  function renderCreateForm() {
    return (
      <div className="contacts-prompt">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          <TextField
            label="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Jane Smith"
          />
          <TextField
            label="Phone"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="+44 7700 900123"
          />
          <TextField
            label="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="jane@example.com"
          />
          <div className="contacts-prompt__actions">
            <Button
              variant="primary"
              disabled={busy || !(newName.trim() || newPhone.trim() || newEmail.trim())}
              onClick={() => void handleCreate()}
            >
              Add them
            </Button>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  }

  function renderImportFooter() {
    if (!canManage) return null;
    return (
      <div className="contacts-import">
        <div className="contacts-import__text">
          <span className="contacts-import__title">A CSV takes about a minute</span>
          <span className="contacts-import__blurb">
            Two columns are enough: a name and a phone number. The agent then
            greets returning callers by name instead of asking twice.
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <button
            className="contacts-link contacts-link--accent"
            onClick={() => fileRef.current?.click()}
          >
            Import a CSV
          </button>
          <button className="contacts-link" onClick={downloadTemplate}>
            Download the template
          </button>
        </div>
      </div>
    );
  }

  function renderList() {
    if (contactList === null) {
      return (
        <Box tone="default">
          <EmptyState title="Loading contacts…">One moment.</EmptyState>
        </Box>
      );
    }

    if (pool.length === 0) {
      return (
        <Box tone="default" style={{ padding: 0 }}>
          <div className="contacts-first-run">
            <EmptyState
              title="No names in here yet"
              icon={<span className="contacts-avatar contacts-avatar--large">?</span>}
              action={
                canManage ? (
                  <div className="contacts-detail__actions">
                    <Button onClick={() => fileRef.current?.click()}>
                      Import a CSV
                    </Button>
                    <Button variant="default" onClick={() => setCreating(true)}>
                      Add someone by hand
                    </Button>
                  </div>
                ) : undefined
              }
            >
              The agent adds a person the moment a caller gives a name or a
              number — you don&apos;t have to build this list. Bring your
              existing one over if you&apos;d rather not wait.
            </EmptyState>
            {creating && canManage ? renderCreateForm() : null}
            {renderImportFooter()}
          </div>
        </Box>
      );
    }

    return (
      <div className="contacts-list">
        <div className="contacts-list__header">
          <div className="contacts-list__title">
            <h2 className="contacts-list__heading">Contacts</h2>
            <span className="contacts-list__count">{countLabel}</span>
            {canManage ? (
              <Button variant="primary" onClick={() => setCreating((v) => !v)}>
                {creating ? "Close" : "Add someone"}
              </Button>
            ) : null}
          </div>
          <div className="contacts-list__search">
            <svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="14" cy="14" r="8.4" />
              <path d="M20.4 20.6l6 6" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, number or email"
            />
          </div>
          <div className="contacts-list__chips">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`contacts-chip ${filter === c.key ? "contacts-chip--active" : ""}`.trim()}
                onClick={() => setFilter(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
          {creating && canManage ? renderCreateForm() : null}
        </div>

        <div className="contacts-list__scroll">
          {list.length === 0 ? (
            <EmptyState
              title="Nobody here"
              action={
                <Button onClick={() => { setQuery(""); setFilter("all"); }}>
                  Clear filters
                </Button>
              }
            >
              Nothing matches that. Try a number, or clear the filter.
            </EmptyState>
          ) : (
            <>
              {list.map((c) => {
                const active = selectedVisible?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`contacts-row ${active ? "contacts-row--active" : ""}`.trim()}
                    onClick={() => handleSelect(c.id)}
                  >
                    <span className="contacts-avatar contacts-avatar--small">
                      {initials(c)}
                    </span>
                    <span className="contacts-row__body">
                      <span className="contacts-row__line">
                        <span
                          className={`contacts-row__name ${c.name ? "" : "contacts-row__name--muted"}`.trim()}
                        >
                          {displayName(c)}
                        </span>
                        <span className="contacts-row__when">
                          {whenLabel(c.updatedAt)}
                        </span>
                      </span>
                      <span className="contacts-row__sub">
                        {[c.phone, c.email].filter(Boolean).join(" \u00b7 ") ||
                          "No contact details yet"}
                      </span>
                      {c.tags.includes("Blocked") ? (
                        <span className="contacts-row__badge contacts-row__badge--blocked">
                          BLOCKED
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
              {renderImportFooter()}
            </>
          )}
        </div>
      </div>
    );
  }

  function renderDetail() {
    if (!selectedVisible) {
      return (
        <div className="contacts-detail contacts-detail__empty">
          <EmptyState title="Pick somebody">
            Every person your agent has heard from lives in this list, named or
            not.
          </EmptyState>
        </div>
      );
    }

    const c = selectedVisible;
    const src = sourceChip(c.source);
    const noteValue = noteDraft !== null && selectedId === c.id ? noteDraft : c.note;

    const channels = [
      { kind: "phone", value: c.phone },
      { kind: "email", value: c.email },
    ].filter((ch) => ch.value);

    return (
      <div className="contacts-detail">
        <div className="contacts-detail__header">
          <div className="contacts-detail__head">
            <div className="contacts-detail__person">
              <span className="contacts-avatar contacts-avatar--large">
                {initials(c)}
              </span>
              <div>
                <div className="contacts-detail__title">
                  <h2 className="contacts-detail__name">{displayName(c)}</h2>
                  <span className={`contacts-source ${src.class}`}>
                    {src.label}
                  </span>
                </div>
                <p className="contacts-detail__summary">
                  Added {whenLabel(c.createdAt)} · last updated{" "}
                  {whenLabel(c.updatedAt)}
                </p>
              </div>
            </div>
            {canManage ? (
              <div className="contacts-detail__actions">
                <Button
                  onClick={() => {
                    setEditing((v) => !v);
                    setEditName(c.name ?? "");
                    setEditPhone(c.phone ?? "");
                    setEditEmail(c.email ?? "");
                  }}
                >
                  {editing ? "Close" : "Edit"}
                </Button>
              </div>
            ) : null}
          </div>

          {editing && canManage ? (
            <div className="contacts-prompt">
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                <TextField
                  label="Name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <TextField
                  label="Phone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
                <TextField
                  label="Email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
                <div className="contacts-prompt__actions">
                  <Button
                    variant="primary"
                    disabled={
                      busy ||
                      !(editName.trim() || editPhone.trim() || editEmail.trim())
                    }
                    onClick={() => {
                      void patchContact(
                        c.id,
                        { name: editName, phone: editPhone, email: editEmail },
                        "Contact saved",
                      ).then(() => setEditing(false));
                    }}
                  >
                    Save
                  </Button>
                  <Button onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="contacts-detail__main">
          <div className="contacts-detail__body">
            <div className="contacts-section__head">
              <span className="contacts-section__label">Calls</span>
              <span className="contacts-section__count">Coming soon</span>
            </div>
            <div className="contacts-card">
              <span className="contacts-timeline__empty">
                Call history will appear here once calls are linked to contacts.
              </span>
            </div>
          </div>

          <div className="contacts-detail__rail">
            <div className="contacts-rail__section">
              <span className="contacts-rail__label">Ways to reach them</span>
              {channels.length === 0 ? (
                <span className="contacts-timeline__empty">
                  No number or email yet.
                </span>
              ) : (
                channels.map((ch, i) => (
                  <div className="contacts-channel" key={i}>
                    <span className="contacts-channel__kind">{ch.kind}</span>
                    <span className="contacts-channel__value">{ch.value}</span>
                  </div>
                ))
              )}
            </div>

            <div className="contacts-rail__section">
              <span className="contacts-rail__label">Tags</span>
              <div className="contacts-tags">
                {c.tags.map((tag) => (
                  <span key={tag} className={`contacts-tag ${tagClass(tag)}`}>
                    {tag}
                    {canManage ? (
                      <button
                        type="button"
                        className="contacts-tag__remove"
                        aria-label={`Remove ${tag}`}
                        onClick={() =>
                          void patchContact(
                            c.id,
                            { tags: c.tags.filter((t) => t !== tag) },
                            "Tag removed",
                          )
                        }
                      >
                        {"\u00d7"}
                      </button>
                    ) : null}
                  </span>
                ))}
                {canManage ? (
                  addingTag ? (
                    <input
                      autoFocus
                      className="contacts-tag-input"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tagDraft.trim()) {
                          void patchContact(
                            c.id,
                            { tags: [...c.tags, tagDraft.trim()] },
                            "Tag added",
                          );
                          setTagDraft("");
                          setAddingTag(false);
                        }
                        if (e.key === "Escape") setAddingTag(false);
                      }}
                      onBlur={() => setAddingTag(false)}
                      placeholder="New tag"
                    />
                  ) : (
                    <button
                      type="button"
                      className="contacts-tag contacts-tag--add"
                      onClick={() => setAddingTag(true)}
                    >
                      + tag
                    </button>
                  )
                ) : null}
              </div>
            </div>

            <div className="contacts-rail__section">
              <span className="contacts-rail__label">Note the agent can read</span>
              <TextArea
                value={noteValue}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Anything it should know before it answers"
                style={{ minHeight: 96, fontSize: 16 }}
                readOnly={!canManage}
              />
              {canManage ? (
                <Button
                  disabled={busy || noteDraft === null || noteDraft === c.note}
                  onClick={() => {
                    void patchContact(
                      c.id,
                      { note: noteValue },
                      "Note saved — the agent will read it next time",
                    ).then(() => setNoteDraft(null));
                  }}
                >
                  Save note
                </Button>
              ) : null}
            </div>

            {canManage ? (
              <div className="contacts-footer">
                <span className="contacts-provenance">
                  {c.source === "import"
                    ? "Imported from a CSV"
                    : c.source === "call"
                      ? "Created from a call"
                      : "Added by hand"}
                </span>
                <div className="contacts-footer__actions">
                  {confirmDelete ? (
                    <>
                      <button
                        className="contacts-link contacts-link--accent"
                        onClick={() => void handleDelete(c)}
                      >
                        Yes, delete them
                      </button>
                      <button
                        className="contacts-link"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Keep them
                      </button>
                    </>
                  ) : (
                    <button
                      className="contacts-link contacts-link--accent"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete contact
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {loadError ? <Alert variant="warn">{loadError}</Alert> : null}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
          e.target.value = "";
        }}
      />

      {contactList === null || pool.length === 0 ? (
        renderList()
      ) : (
        <div className="contacts-shell">
          {renderList()}
          {renderDetail()}
        </div>
      )}

      {toast ? <div className="contacts-toast">{toast}</div> : null}
    </>
  );
}

export function WorkspaceContactsPage() {
  return (
    <WorkspaceShell>
      {(business) => <ContactsPage slug={business.slug} />}
    </WorkspaceShell>
  );
}
