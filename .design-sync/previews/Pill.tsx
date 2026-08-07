import { Pill } from "@vocalonix/web";

const row: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
};

export function Variants() {
  return (
    <div style={row}>
      <Pill>Draft</Pill>
      <Pill variant="solid">Live</Pill>
      <Pill variant="accent">Beta</Pill>
      <Pill variant="good">Connected</Pill>
      <Pill variant="warn">Needs attention</Pill>
      <Pill variant="info">Scheduled</Pill>
    </div>
  );
}

export function InContext() {
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 460 }}>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <strong>Acme Dental — main line</strong>
        <Pill variant="good">Connected</Pill>
      </div>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <strong>Acme Dental — after hours</strong>
        <Pill variant="warn">No voice picked</Pill>
      </div>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <strong>Widget embed</strong>
        <Pill>Draft</Pill>
      </div>
    </div>
  );
}
