import { Box, Button, EmptyState } from "@vocalonix/web";

export function WithAction() {
  return (
    <Box style={{ padding: 8, maxWidth: 520 }}>
      <EmptyState
        title="No conversations yet"
        action={<Button variant="primary">Make a test call</Button>}
      >
        Calls appear here as soon as your agent picks up.
      </EmptyState>
    </Box>
  );
}

export function WithIcon() {
  return (
    <Box style={{ padding: 8, maxWidth: 520 }}>
      <EmptyState
        title="Nothing in the callback queue"
        icon={<span style={{ fontSize: 28 }}>☎</span>}
        action={<Button>View past callbacks</Button>}
      >
        When a caller asks to be rung back, the request lands here.
      </EmptyState>
    </Box>
  );
}

export function TitleOnly() {
  return (
    <Box style={{ padding: 8, maxWidth: 520 }}>
      <EmptyState title="No documents uploaded" />
    </Box>
  );
}
