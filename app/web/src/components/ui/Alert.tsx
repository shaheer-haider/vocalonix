import { type ReactNode } from "react";

export type AlertVariant = "info" | "success" | "warn" | "error";

interface AlertProps {
  children?: ReactNode;
  title?: ReactNode;
  variant?: AlertVariant;
}

export function Alert({ children, title, variant = "info" }: AlertProps) {
  return (
    <div className={`ui-alert ui-alert--${variant}`} role={variant === "error" || variant === "warn" ? "alert" : "status"}>
      {title ? <strong>{title}</strong> : null}
      {children}
    </div>
  );
}
