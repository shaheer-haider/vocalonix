import { Link, type LinkProps } from "@tanstack/react-router";

import { useDograhHealth } from "../hooks/useDograhHealth";

type DemoLinkProps = Omit<LinkProps, "to" | "search"> & {
  className?: string;
  children?: React.ReactNode;
};

export function DemoLink(props: DemoLinkProps) {
  const { turnEnabled } = useDograhHealth();
  if (!turnEnabled) return null;
  return <Link {...props} to="/demo" />;
}
