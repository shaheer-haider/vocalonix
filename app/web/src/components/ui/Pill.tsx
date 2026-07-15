import { type HTMLAttributes, type ReactNode } from "react";

export type PillVariant = "default" | "solid" | "accent" | "good" | "warn" | "info";

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
  variant?: PillVariant;
}

export function Pill({ children, variant = "default", className = "", ...rest }: PillProps) {
  return (
    <span className={`ui-pill ui-pill--${variant} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}
