import { useId, type ReactNode } from "react";

interface FieldProps {
  children: (ids: { id: string; descriptionId: string | undefined }) => ReactNode;
  error?: string;
  helper?: ReactNode;
  id?: string;
  label?: string;
  required?: boolean;
}

export function Field({ children, error, helper, id, label, required }: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = error || helper ? `${fieldId}-description` : undefined;

  return (
    <div className="ui-field">
      {label ? (
        <label className="ui-label" htmlFor={fieldId}>
          {label}
          {required ? <span aria-hidden> *</span> : null}
        </label>
      ) : null}
      {children({ id: fieldId, descriptionId })}
      {error ? (
        <p className="ui-field-message ui-field-message--error" id={descriptionId} role="alert">
          {error}
        </p>
      ) : helper ? (
        <p className="ui-field-message" id={descriptionId}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}
