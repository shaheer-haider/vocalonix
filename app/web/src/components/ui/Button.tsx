import { type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "default" | "primary" | "ghost" | "accent" | "destructive";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  default: "ui-button",
  primary: "ui-button ui-button--primary",
  ghost: "ui-button ui-button--ghost",
  accent: "ui-button ui-button--accent",
  destructive: "ui-button ui-button--destructive",
};

export function Button({
  children,
  variant = "default",
  loading = false,
  disabled,
  type = "button",
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${variantClass[variant]} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? "Working…" : children}
    </button>
  );
}
