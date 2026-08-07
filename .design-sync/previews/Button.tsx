import { Button } from "@vocalonix/web";

const row: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "center",
};

export function Variants() {
  return (
    <div style={row}>
      <Button>Default</Button>
      <Button variant="primary">Save changes</Button>
      <Button variant="accent">Hear it now</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="destructive">Delete workspace</Button>
    </div>
  );
}

export function States() {
  return (
    <div style={row}>
      <Button variant="primary">Enabled</Button>
      <Button variant="primary" disabled>
        Disabled
      </Button>
      <Button variant="primary" loading>
        Publishing
      </Button>
      <Button variant="default" disabled>
        Disabled default
      </Button>
    </div>
  );
}

export function InAToolbar() {
  return (
    <div style={{ ...row, justifyContent: "flex-end" }}>
      <Button variant="ghost">Discard</Button>
      <Button>Save draft</Button>
      <Button variant="primary">Publish agent</Button>
    </div>
  );
}
