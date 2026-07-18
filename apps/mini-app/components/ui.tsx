"use client";
/* eslint-disable @typescript-eslint/restrict-template-expressions */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CloudOff,
  LoaderCircle,
  LockKeyhole,
  Moon,
  RefreshCw,
  Smartphone,
  Sun,
  TimerOff,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type JSX,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import type { Collage } from "../lib/schemas";
import { formatMoney, frequencyLabel } from "../lib/format";
import { useTheme, type ThemeChoice } from "./providers";

const join = (...values: readonly (false | null | string | undefined)[]) =>
  values.filter(Boolean).join(" ");

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly variant?: "primary" | "secondary" | "yellow" | "ghost" | "danger";
  }
>(function Button({ className, variant = "primary", ...props }, ref) {
  return (
    <button
      className={join("button", `button--${variant}`, className)}
      ref={ref}
      {...props}
    />
  );
});

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input className={join("input", className)} ref={ref} {...props} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <span className="select-wrap">
      <select className={join("input", className)} ref={ref} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" size={18} />
    </span>
  );
});

export function Field({
  label,
  error,
  hint,
  children,
}: {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {error === undefined ? null : (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
      {error === undefined && hint !== undefined ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </label>
  );
}

export function AsyncButton({
  busy,
  busyLabel,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly busy: boolean;
  readonly busyLabel: string;
}): JSX.Element {
  return (
    <Button aria-busy={busy} disabled={busy || props.disabled} {...props}>
      {busy ? (
        <>
          <LoaderCircle aria-hidden="true" className="spin" size={18} />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function ThemeToggle(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const themes: readonly [ThemeChoice, string, LucideIcon][] = [
    ["light", "Light", Sun],
    ["dark", "Dark", Moon],
    ["system", "System", Smartphone],
    ["telegram", "Telegram", Smartphone],
  ];
  return (
    <details className="theme-menu">
      <summary aria-label={`Theme: ${theme}`}>
        {theme === "dark" ? (
          <Moon aria-hidden="true" size={18} />
        ) : (
          <Sun aria-hidden="true" size={18} />
        )}
        <span>Theme</span>
      </summary>
      <div>
        {themes.map(([value, label, Icon]) => (
          <button
            aria-pressed={theme === value}
            key={value}
            onClick={() => setTheme(value)}
            type="button"
          >
            <Icon aria-hidden="true" size={17} />
            {label}
            {theme === value ? <Check aria-hidden="true" size={16} /> : null}
          </button>
        ))}
      </div>
    </details>
  );
}

export function Brand(): JSX.Element {
  return (
    <span className="brand" aria-label="Collage">
      <span className="brand__mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      collage
    </span>
  );
}

export function AppShell({
  children,
  offline,
}: {
  readonly children: ReactNode;
  readonly offline: boolean;
}): JSX.Element {
  return (
    <main className="mini-shell">
      <div className="app-topbar">
        <Brand />
        <ThemeToggle />
      </div>
      {offline ? (
        <div className="offline-banner" role="status">
          <WifiOff aria-hidden="true" size={18} />
          You’re offline. Financial actions are paused until current server
          state is refreshed.
        </div>
      ) : null}
      <fieldset className="app-content app-content-fieldset" disabled={offline}>
        {children}
      </fieldset>
    </main>
  );
}

export function ContextHeader({
  collage,
  cycle,
  detail,
}: {
  readonly collage: Collage;
  readonly cycle?: number | undefined;
  readonly detail?: string | undefined;
}): JSX.Element {
  return (
    <header className="context">
      <span className="eyebrow">Current Collage</span>
      <h1>{collage.name}</h1>
      <p className="context__group">
        {collage.chat?.title ?? "Telegram group"}
      </p>
      <p className="context__summary">
        {formatMoney(collage.contributionAmountMinor)}{" "}
        {frequencyLabel(collage.frequency, collage.frequencyInterval)}
        {cycle === undefined ? "" : ` · Cycle ${cycle}`}
      </p>
      {detail === undefined ? null : (
        <p className="context__detail">{detail}</p>
      )}
    </header>
  );
}

export function Money({
  minor,
  label,
}: {
  readonly minor: string;
  readonly label: string;
}): JSX.Element {
  return (
    <span aria-label={`${label}: ${formatMoney(minor)}`} className="money">
      {formatMoney(minor)}
    </span>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode;
  readonly tone?:
    "active" | "attention" | "danger" | "neutral" | "provider" | "success";
}): JSX.Element {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function StepIndicator({
  current,
  labels,
}: {
  readonly current: number;
  readonly labels: readonly string[];
}): JSX.Element {
  return (
    <div
      aria-label={`Registration step ${current + 1} of ${labels.length}: ${labels[current] ?? ""}`}
      className="steps"
    >
      <div>
        <span>
          Step {current + 1} of {labels.length}
        </span>
        <strong>{labels[current]}</strong>
      </div>
      <div className="steps__track" aria-hidden="true">
        {labels.map((label, index) => (
          <i className={index <= current ? "is-active" : ""} key={label} />
        ))}
      </div>
    </div>
  );
}

export function PageTransition({
  stepKey,
  children,
}: {
  readonly stepKey: string;
  readonly children: ReactNode;
}): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.section
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: reduce ? 0 : -8 }}
        initial={{ opacity: 0, x: reduce ? 0 : 8 }}
        key={stepKey}
        transition={{ duration: reduce ? 0 : 0.18 }}
      >
        {children}
      </motion.section>
    </AnimatePresence>
  );
}

export function FullPageSkeleton(): JSX.Element {
  return (
    <div className="skeleton-page" aria-label="Loading Collage" role="status">
      <div className="skeleton skeleton--context" />
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--row" />
      <div className="skeleton skeleton--row" />
      <div className="skeleton skeleton--button" />
      <span className="sr-only">Loading Collage…</span>
    </div>
  );
}

type StateVariant =
  "error" | "expired" | "offline" | "pending" | "success" | "unauthorized";

const stateIcon: Record<StateVariant, LucideIcon> = {
  error: AlertCircle,
  expired: TimerOff,
  offline: CloudOff,
  pending: Clock3,
  success: CheckCircle2,
  unauthorized: LockKeyhole,
};

export function StatePage({
  action,
  description,
  title,
  variant,
}: {
  readonly action?: ReactNode;
  readonly description: string;
  readonly title: string;
  readonly variant: StateVariant;
}): JSX.Element {
  const Icon = stateIcon[variant];
  return (
    <section className={`state-page state-page--${variant}`}>
      <span className="state-page__icon">
        <Icon aria-hidden="true" size={25} />
      </span>
      <p className="eyebrow">Collage status</p>
      <h1>{title}</h1>
      <p>{description}</p>
      {action === undefined ? null : (
        <div className="state-page__action">{action}</div>
      )}
    </section>
  );
}

export function ProviderPendingState({
  collage,
  amountMinor,
  cycle,
  lastCheckedAt,
  onRecheck,
  title = "Provider confirmation pending",
}: {
  readonly collage: Collage;
  readonly amountMinor: string;
  readonly cycle?: number | undefined;
  readonly lastCheckedAt?: number | undefined;
  readonly onRecheck: () => void;
  readonly title?: string | undefined;
}): JSX.Element {
  return (
    <>
      <ContextHeader
        collage={collage}
        cycle={cycle}
        detail="Provider verification in progress"
      />
      <section className="provider-state">
        <span className="provider-state__pulse" aria-hidden="true">
          <Clock3 size={22} />
        </span>
        <p className="eyebrow">Monnify verification</p>
        <h2>{title}</h2>
        <p>
          We are confirming this operation with Monnify. Do not pay or authorize
          again while this check is in progress.
        </p>
        <dl className="summary-list">
          <div>
            <dt>Amount</dt>
            <dd>{formatMoney(amountMinor)}</dd>
          </div>
          <div>
            <dt>Last checked</dt>
            <dd>
              {lastCheckedAt === undefined
                ? "Waiting for first check"
                : new Intl.DateTimeFormat("en-NG", {
                    timeStyle: "medium",
                  }).format(lastCheckedAt)}
            </dd>
          </div>
        </dl>
        <Button onClick={onRecheck} type="button" variant="secondary">
          <RefreshCw aria-hidden="true" size={18} />
          Check current status
        </Button>
      </section>
    </>
  );
}

export function StickyActionBar({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  return <div className="sticky-action">{children}</div>;
}

export function OnlineState({
  children,
}: {
  readonly children: (online: boolean) => ReactNode;
}): JSX.Element {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = (): void => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return <>{children(online)}</>;
}
