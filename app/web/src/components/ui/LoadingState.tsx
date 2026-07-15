interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "Loading…" }: LoadingStateProps) {
  return (
    <div className="ui-loading" role="status">
      <span aria-hidden className="ui-spinner" />
      <span>{label}</span>
    </div>
  );
}
