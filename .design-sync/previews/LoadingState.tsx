import { Box, LoadingState } from "@vocalonix/web";

export function Default() {
  return (
    <div style={{ maxWidth: 420 }}>
      <LoadingState />
    </div>
  );
}

export function WithLabel() {
  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 420 }}>
      <LoadingState label="Preparing secure call…" />
      <LoadingState label="Indexing your knowledge base…" />
    </div>
  );
}

export function InAPanel() {
  return (
    <Box style={{ padding: 22, display: "grid", gap: 12, maxWidth: 420 }}>
      <h2 style={{ margin: 0 }}>Conversations</h2>
      <LoadingState label="Loading the last 30 days…" />
    </Box>
  );
}
