import { useState } from "react";

import { PageShell } from "../components/shell";
import { Alert, Box, Button, Dropdown, EmptyState, LoadingState, Modal, Pill, SelectField, TextArea, TextField } from "../components/ui";

export function DesignSystemPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [dropdownValue, setDropdownValue] = useState("No action selected");

  return (
    <PageShell>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Vocalonix kit</p>
          <h1>Design system</h1>
          <p>Warm paper, ink-first primitives ported from AestheticsDesk.</p>
        </div>
      </section>

      <div className="design-grid">
        <Box style={{ padding: 22 }}>
          <h2>Buttons and pills</h2>
          <div className="stack-row">
            <Button>Default</Button>
            <Button variant="primary">Primary</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="stack-row">
            <Pill>Default</Pill>
            <Pill variant="accent">Accent</Pill>
            <Pill variant="good">Connected</Pill>
            <Pill variant="warn">Needs attention</Pill>
          </div>
        </Box>

        <Box style={{ padding: 22 }}>
          <h2>Form fields</h2>
          <TextField label="Agent name" value="Nova" onChange={() => undefined} />
          <SelectField
            label="Retrieval mode"
            value="full_document"
            onChange={() => undefined}
            options={[
              { label: "Full document", value: "full_document" },
              { label: "Chunked search", value: "chunked" },
            ]}
          />
          <TextArea label="Greeting" value="Hi, thanks for calling." onChange={() => undefined} />
        </Box>

        <Box style={{ padding: 22 }}>
          <h2>Overlay behavior</h2>
          <div className="stack-row">
            <Dropdown
              label="Actions"
              items={[
                { label: "Use Gemini Live", onSelect: () => setDropdownValue("Gemini Live selected") },
                { label: "Copy snippet", onSelect: () => setDropdownValue("Snippet selected") },
              ]}
            />
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
          </div>
          <p>{dropdownValue}</p>
          <Alert>Dropdown closes on outside click and supports arrow keys/Escape.</Alert>
        </Box>

        <EmptyState title="Empty state" action={<Button>Primary action</Button>}>
          Use this when a list has no real backend data yet.
        </EmptyState>
        <Box style={{ padding: 22 }}>
          <h2>Loading state</h2>
          <LoadingState label="Preparing secure call…" />
        </Box>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} titleId="design-modal-title">
        <div className="modal-header">
          <h2 id="design-modal-title">Accessible modal</h2>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>
            Close
          </Button>
        </div>
        <p>Focus is trapped, Escape closes, and focus returns to the trigger.</p>
        <Button variant="primary" onClick={() => setModalOpen(false)}>
          Done
        </Button>
      </Modal>
    </PageShell>
  );
}
