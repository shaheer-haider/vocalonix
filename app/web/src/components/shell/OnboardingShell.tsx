import { Link } from "@tanstack/react-router";
import { type ReactNode } from "react";

interface Step {
  done?: boolean;
  label: string;
  slug: string;
}

interface OnboardingShellProps {
  children: ReactNode;
  steps: Step[];
  currentSlug: string;
  title: string;
  businessSlug: string;
}

export function OnboardingShell({
  children,
  currentSlug,
  steps,
  title,
  businessSlug,
}: OnboardingShellProps) {
  const completedCount = steps.filter((step) => step.done).length;
  const percent = steps.length
    ? Math.round((completedCount / steps.length) * 100)
    : 0;

  return (
    <div className="onboarding-shell">
      <header className="onboarding-shell__header" style={{ gridColumn: "1 / -1" }}>
        <Link to="/" className="wordmark">
          vocalonix
        </Link>
        <Link to="/app" className="ui-button ui-button--ghost">
          Exit setup
        </Link>
      </header>
      <aside>
        <p className="eyebrow">Setting up</p>
        <h1>{title}</h1>
        <div
          className="progress-bar"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemax={steps.length}
          aria-valuemin={0}
          aria-valuenow={completedCount}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <ol>
          {steps.map((step, index) => {
            const isCurrent = step.slug === currentSlug;
            const isDone = Boolean(step.done);
            const content = (
              <>
                <span>{isDone ? "✓" : index + 1}</span>
                {step.label}
              </>
            );
            return (
              <li
                className={`${isCurrent ? "is-current" : ""} ${isDone ? "is-done" : ""}`.trim()}
                key={step.slug}
              >
                {isDone ? (
                  <a
                    href={`/app/${businessSlug}/onboarding/${step.slug}`}
                    className="onboarding-step-link"
                    aria-current={isCurrent ? "page" : undefined}
                  >
                    {content}
                  </a>
                ) : (
                  <span
                    className="onboarding-step-link"
                    aria-current={isCurrent ? "page" : undefined}
                  >
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </aside>
      <section>{children}</section>
    </div>
  );
}
