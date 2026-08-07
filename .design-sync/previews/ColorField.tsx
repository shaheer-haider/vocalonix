import { useState } from "react";

import { Box, ColorField } from "@vocalonix/web";

export function Default() {
  const [value, setValue] = useState("#b2544e");
  return (
    <div style={{ maxWidth: 420 }}>
      <ColorField label="Widget accent" value={value} onChange={setValue} />
    </div>
  );
}

export function WithHelper() {
  const [value, setValue] = useState("#4e7a48");
  return (
    <div style={{ maxWidth: 420 }}>
      <ColorField
        label="Bubble colour"
        helper="Used for the chat bubble and the call button on your site."
        value={value}
        onChange={setValue}
        required
      />
    </div>
  );
}

export function InAppearancePanel() {
  const [accent, setAccent] = useState("#b2544e");
  const [surface, setSurface] = useState("#f7f3eb");
  return (
    <Box style={{ padding: 22, display: "grid", gap: 16, maxWidth: 440 }}>
      <h2 style={{ margin: 0 }}>Appearance</h2>
      <ColorField label="Accent" value={accent} onChange={setAccent} />
      <ColorField label="Surface" value={surface} onChange={setSurface} />
    </Box>
  );
}
