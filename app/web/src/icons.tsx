interface IconProps {
  size?: number;
}

function IconFrame({
  children,
  size = 20,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function WaveIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
    </IconFrame>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </IconFrame>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </IconFrame>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20h-3v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15.4a1.7 1.7 0 0 0-1.55-1H5v-3h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06L8.36 6.3l.06.06A1.7 1.7 0 0 0 10.3 6a1.7 1.7 0 0 0 1-1.55V4h3v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19 9.3a1.7 1.7 0 0 0 1.55 1H21v3h-.09a1.7 1.7 0 0 0-1.51 1.7Z" />
    </IconFrame>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
    </IconFrame>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
    </IconFrame>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </IconFrame>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </IconFrame>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </IconFrame>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </IconFrame>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </IconFrame>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </IconFrame>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </IconFrame>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M7 4.5v15l12-7.5z" />
    </IconFrame>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M9 5v14M15 5v14" />
    </IconFrame>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </IconFrame>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4.5 12.5l5 5 10-11" />
    </IconFrame>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5 9l7 7 7-7" />
    </IconFrame>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 12h15m-6-7l7 7-7 7" />
    </IconFrame>
  );
}
