import { type ReactNode } from "react";

interface OnboardingShellProps {
  children: ReactNode;
  steps: Array<{ done?: boolean; label: string; slug: string }>;
  currentSlug: string;
  title: string;
}

export function OnboardingShell({ children, currentSlug, steps, title }: OnboardingShellProps) {
  const completedCount = steps.filter((step) => step.done).length;
  const percent = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="onboarding-shell">
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
          {steps.map((step, index) => (
            <li className={step.slug === currentSlug ? "is-current" : ""} key={step.slug}>
              <span>{step.done ? "✓" : index + 1}</span>
              {step.label}
            </li>
          ))}
        </ol>
      </aside>
      <section>{children}</section>
    </div>
  );
}
