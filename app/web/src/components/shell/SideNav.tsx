import { Link, useLocation } from "@tanstack/react-router";
import { type ReactNode } from "react";

export interface SideNavItem {
  icon?: ReactNode;
  label: string;
  to: "/secret/test-agent" | "/secret/knowledge-base" | "/secret/agent-settings";
}

interface SideNavProps {
  items: SideNavItem[];
  label: string;
}

export function SideNav({ items, label }: SideNavProps) {
  const location = useLocation();

  return (
    <nav aria-label={label}>
      <p className="nav-label">{label}</p>
      {items.map((item) => {
        const active =
          location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`nav-item ${active ? "nav-item--active" : ""}`.trim()}
            aria-current={active ? "page" : undefined}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
