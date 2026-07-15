import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";

import { Field } from "./Field";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  helper?: ReactNode;
  label?: string;
  autoResize?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { autoResize = true, error, helper, id, label, onInput, required, value, ...rest },
  forwardedRef,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    if (!autoResize || !localRef.current) return;
    localRef.current.style.height = "auto";
    localRef.current.style.height = `${localRef.current.scrollHeight}px`;
  }, [autoResize, value]);

  return (
    <Field error={error} helper={helper} id={id} label={label} required={required}>
      {({ id: fieldId, descriptionId }) => (
        <textarea
          ref={(node) => {
            localRef.current = node;
            if (typeof forwardedRef === "function") {
              forwardedRef(node);
            } else if (forwardedRef) {
              forwardedRef.current = node;
            }
          }}
          id={fieldId}
          className="ui-input ui-textarea"
          value={value}
          required={required}
          aria-describedby={descriptionId}
          aria-invalid={error ? true : undefined}
          onInput={(event) => {
            if (autoResize) {
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
            }
            onInput?.(event);
          }}
          {...rest}
        />
      )}
    </Field>
  );
});
