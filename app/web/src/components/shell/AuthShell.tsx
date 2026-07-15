import { type CSSProperties, type ReactNode } from "react";

interface AuthShellProps {
  children: ReactNode;
  style?: CSSProperties;
  width?: number;
}

export function AuthShell({ children, style, width = 480 }: AuthShellProps) {
  return (
    <div className="auth-shell">
      <div className="auth-shell__card" style={{ maxWidth: width, ...style }}>
        {children}
      </div>
    </div>
  );
}
