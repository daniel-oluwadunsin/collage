import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CloudOff,
  LockKeyhole,
  TimerOff,
  type LucideIcon,
} from "lucide-react";
import type { JSX, ReactNode } from "react";

export type StatusTone =
  "active" | "attention" | "success" | "danger" | "neutral" | "provider";

export function StatusBadge({
  children,
  tone,
}: {
  readonly children: ReactNode;
  readonly tone: StatusTone;
}): JSX.Element {
  return <span className={`status status--${tone}`}>{children}</span>;
}

export interface CollageContextHeaderProps {
  readonly collage: string;
  readonly group: string;
  readonly summary: string;
  readonly detail: string;
}

export function CollageContextHeader({
  collage,
  group,
  summary,
  detail,
}: CollageContextHeaderProps): JSX.Element {
  return (
    <header className="context-header">
      <span className="eyebrow">Current Collage</span>
      <h1>{collage}</h1>
      <p className="context-header__group">{group}</p>
      <p className="context-header__summary">{summary}</p>
      <p className="context-header__detail">{detail}</p>
    </header>
  );
}

const stateIcons: Readonly<Record<StatusTone, LucideIcon>> = {
  active: Clock3,
  attention: AlertCircle,
  success: CheckCircle2,
  danger: AlertCircle,
  neutral: TimerOff,
  provider: Clock3,
};

export interface AsyncStateCardProps {
  readonly action?: string;
  readonly description: string;
  readonly title: string;
  readonly tone: StatusTone;
  readonly variant?: "default" | "offline" | "expired" | "unauthorized";
}

export function AsyncStateCard({
  action,
  description,
  title,
  tone,
  variant = "default",
}: AsyncStateCardProps): JSX.Element {
  const fallbackIcon =
    variant === "offline"
      ? CloudOff
      : variant === "expired"
        ? TimerOff
        : variant === "unauthorized"
          ? LockKeyhole
          : stateIcons[tone];
  const Icon = fallbackIcon;

  return (
    <article className={`state-card state-card--${tone}`}>
      <Icon aria-hidden="true" size={20} strokeWidth={1.9} />
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {action === undefined ? null : (
          <button className="text-action" type="button">
            {action}
          </button>
        )}
      </div>
    </article>
  );
}
