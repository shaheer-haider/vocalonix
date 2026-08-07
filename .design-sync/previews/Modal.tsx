import { type ReactNode } from "react";

import { Alert, Button, Modal, TextField } from "@vocalonix/web";

const noop = () => undefined;

// .ui-modal-backdrop is position:fixed, so it would escape the preview card.
// A transformed ancestor becomes the containing block for fixed descendants,
// which pins the real overlay inside the cell without changing the component.
function Stage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        transform: "translateZ(0)",
        height: 420,
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--paper-2)",
      }}
    >
      {children}
    </div>
  );
}

export function Confirmation() {
  return (
    <Stage>
    <Modal open onClose={noop} titleId="publish-title">
      <div className="modal-header">
        <h2 id="publish-title">Publish Acme Dental?</h2>
        <Button variant="ghost" onClick={noop}>
          Close
        </Button>
      </div>
      <p>
        Callers will start hearing the new greeting straight away. You can roll
        back from the History tab.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Button onClick={noop}>Cancel</Button>
        <Button variant="primary" onClick={noop}>
          Publish
        </Button>
      </div>
    </Modal>
    </Stage>
  );
}

export function WithAForm() {
  return (
    <Stage>
    <Modal open onClose={noop} titleId="rename-title" descriptionId="rename-desc">
      <div className="modal-header">
        <h2 id="rename-title">Rename agent</h2>
        <Button variant="ghost" onClick={noop}>
          Close
        </Button>
      </div>
      <p id="rename-desc">This is only visible to your team.</p>
      <TextField label="Agent name" defaultValue="Nova" />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Button onClick={noop}>Cancel</Button>
        <Button variant="primary" onClick={noop}>
          Save
        </Button>
      </div>
    </Modal>
    </Stage>
  );
}

export function Destructive() {
  return (
    <Stage>
    <Modal open onClose={noop} titleId="delete-title">
      <div className="modal-header">
        <h2 id="delete-title">Delete this workspace?</h2>
        <Button variant="ghost" onClick={noop}>
          Close
        </Button>
      </div>
      <Alert variant="error" title="This can't be undone">
        Conversations, contacts and recordings for Acme Dental are removed
        permanently.
      </Alert>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Button onClick={noop}>Keep workspace</Button>
        <Button variant="destructive" onClick={noop}>
          Delete
        </Button>
      </div>
    </Modal>
    </Stage>
  );
}
