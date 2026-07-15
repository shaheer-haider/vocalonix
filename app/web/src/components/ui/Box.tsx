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
        border: "1.5px solid var(--line)",
        borderRadius: 8,
        boxShadow: "var(--shadow-sketch)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
