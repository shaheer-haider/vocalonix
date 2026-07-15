import { type ReactNode } from "react";

interface EmptyStateProps {
  action?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  title: string;
}

export function EmptyState({ action, children, icon, title }: EmptyStateProps) {
  return (
    <div className="ui-empty-state">
      {icon ? <div className="ui-empty-icon">{icon}</div> : null}
      <strong>{title}</strong>
      {children ? <span>{children}</span> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
