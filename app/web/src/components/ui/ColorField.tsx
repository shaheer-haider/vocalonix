import { forwardRef, type ReactNode } from "react";

import { Field } from "./Field";

interface ColorFieldProps {
  error?: string;
  helper?: ReactNode;
  label?: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}

export const ColorField = forwardRef<HTMLInputElement, ColorFieldProps>(
  function ColorField({ error, helper, label, onChange, required, value }, ref) {
    return (
      <Field error={error} helper={helper} label={label} required={required}>
        {({ id: fieldId, descriptionId }) => (
          <div className="color-field">
            <input
              ref={ref}
              id={fieldId}
              type="color"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              aria-describedby={descriptionId}
              aria-invalid={error ? true : undefined}
            />
            <input
              aria-label={`${label} hex value`}
              type="text"
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
        )}
      </Field>
    );
  },
);
