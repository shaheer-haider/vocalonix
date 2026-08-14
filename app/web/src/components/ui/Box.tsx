import { type HTMLAttributes, type ReactNode } from "react";

export type BoxPadding = "none" | "sm" | "md" | "lg" | "xl";
export type BoxTone = "default" | "tinted" | "accent";

interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  padding?: BoxPadding;
  tone?: BoxTone;
}

/**
 * Box used to write its own chrome — background, border, radius, shadow — as an
 * inline style object on every instance, which put the product's most-used
 * surface outside the token layer: it could not be themed, overridden by a
 * media query, or restyled without touching TSX. Padding then had to come in
 * through `style` too, which is how the codebase ended up with seven different
 * card paddings (16/18/20/22/24/28/32) and no scale.
 *
 * Note for dead-CSS scans: `ui-box--*` classes are composed at runtime from the
 * `tone` and `padding` props, so they never appear as literals in the TSX.
 */
export function Box({
  children,
  className,
  padding = "none",
  tone = "default",
  ...rest
}: BoxProps) {
  return (
    <div
      className={[`ui-box`, `ui-box--${tone}`, `ui-box--pad-${padding}`, className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
