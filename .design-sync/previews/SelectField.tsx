import { SelectField } from "@vocalonix/web";

const stack: React.CSSProperties = {
  display: "grid",
  gap: 16,
  maxWidth: 420,
};

export function Default() {
  return (
    <div style={stack}>
      <SelectField
        label="Retrieval mode"
        defaultValue="full_document"
        options={[
          { label: "Full document", value: "full_document" },
          { label: "Chunked search", value: "chunked" },
        ]}
      />
    </div>
  );
}

export function WithHelperAndError() {
  return (
    <div style={stack}>
      <SelectField
        label="Voice"
        defaultValue="nova"
        helper="You can change this any time without republishing."
        options={[
          { label: "Nova — warm, British", value: "nova" },
          { label: "Ash — neutral, American", value: "ash" },
          { label: "Sage — calm, Irish", value: "sage" },
        ]}
      />
      <SelectField
        label="Timezone"
        defaultValue=""
        required
        error="Pick a timezone so opening hours line up."
        options={[
          { label: "Select a timezone…", value: "" },
          { label: "Europe/London", value: "Europe/London" },
          { label: "America/New_York", value: "America/New_York" },
        ]}
      />
    </div>
  );
}
