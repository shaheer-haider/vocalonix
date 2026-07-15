import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";

import { Field } from "./Field";

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  helper?: ReactNode;
  label?: string;
  options: SelectOption[];
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { error, helper, id, label, options, required, ...rest },
  ref,
) {
  return (
    <Field error={error} helper={helper} id={id} label={label} required={required}>
      {({ id: fieldId, descriptionId }) => (
        <span className="ui-select-wrap">
          <select
            ref={ref}
            id={fieldId}
            className="ui-input ui-select"
            required={required}
            aria-describedby={descriptionId}
            aria-invalid={error ? true : undefined}
            {...rest}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span aria-hidden className="ui-select-caret">
            ▾
          </span>
        </span>
      )}
    </Field>
  );
});
