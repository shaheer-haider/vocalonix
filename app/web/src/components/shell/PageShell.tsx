import { type ReactNode } from "react";

import { PublicNav } from "./PublicNav";

interface PageShellProps {
  children: ReactNode;
  nav?: boolean;
}

export function PageShell({ children, nav = true }: PageShellProps) {
  return (
    <div className="page-shell">
      {nav ? <PublicNav /> : null}
      <main className="page-shell__main">{children}</main>
    </div>
  );
}
