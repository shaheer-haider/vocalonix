import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  tone?: "default" | "tinted" | "accent";
  style?: CSSProperties;
}

export function Box({ children, tone = "default", style, ...rest }: BoxProps) {
  const background =
    tone === "accent"
      ? "var(--accent-soft)"
      : tone === "tinted"
        ? "var(--paper-2)"
        : "var(--paper)";

  return (
    <div
      style={{
        background,
        border: "1px solid var(--line-2)",
        borderRadius: 12,
        boxShadow: "var(--shadow-sketch)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
