import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { Field } from "./Field";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  error?: string;
  helper?: ReactNode;
  label?: string;
  mono?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { error, helper, id, label, mono = false, required, ...rest },
  ref,
) {
  return (
    <Field error={error} helper={helper} id={id} label={label} required={required}>
      {({ id: fieldId, descriptionId }) => (
        <input
          ref={ref}
          id={fieldId}
          className={`ui-input ${mono ? "ui-input--mono" : ""}`.trim()}
          required={required}
          aria-describedby={descriptionId}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      )}
    </Field>
  );
});
