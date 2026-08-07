import { Field } from "@vocalonix/web";

const stack: React.CSSProperties = {
  display: "grid",
  gap: 16,
  maxWidth: 420,
};

export function WrappingACustomControl() {
  return (
    <div style={stack}>
      <Field label="Call routing" helper="Applies to the main line only." required>
        {({ id, descriptionId }) => (
          <div
            id={id}
            aria-describedby={descriptionId}
            style={{ display: "flex", gap: 8 }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="radio" name="routing" defaultChecked /> Agent first
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="radio" name="routing" /> Ring team first
            </label>
          </div>
        )}
      </Field>
    </div>
  );
}

export function HelperVsError() {
  return (
    <div style={stack}>
      <Field label="Forwarding number" helper="Digits only, including country code.">
        {({ id, descriptionId }) => (
          <input
            id={id}
            aria-describedby={descriptionId}
            className="ui-input"
            defaultValue="442079460912"
          />
        )}
      </Field>
      <Field label="Forwarding number" error="That number isn't reachable.">
        {({ id, descriptionId }) => (
          <input
            id={id}
            aria-describedby={descriptionId}
            className="ui-input"
            aria-invalid
            defaultValue="0207"
          />
        )}
      </Field>
    </div>
  );
}
