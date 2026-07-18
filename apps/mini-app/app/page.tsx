"use client";

import { AsyncStateCard, CollageContextHeader, StatusBadge } from "@collage/ui";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Expand,
  Moon,
  Smartphone,
  Sun,
} from "lucide-react";
import { useEffect, useState, type JSX } from "react";

type ThemeChoice = "light" | "dark" | "system" | "telegram";

interface TelegramWebApp {
  readonly colorScheme?: "light" | "dark";
}

interface TelegramWindow extends Window {
  readonly Telegram?: {
    readonly WebApp?: TelegramWebApp;
  };
}

const themes: readonly {
  readonly icon: typeof Sun;
  readonly label: string;
  readonly value: ThemeChoice;
}[] = [
  { icon: Sun, label: "Light", value: "light" },
  { icon: Moon, label: "Dark", value: "dark" },
  { icon: Smartphone, label: "System", value: "system" },
  { icon: Expand, label: "Telegram", value: "telegram" },
];

const resolveTheme = (choice: ThemeChoice): "light" | "dark" => {
  if (choice === "light" || choice === "dark") {
    return choice;
  }

  if (choice === "telegram") {
    const telegramWindow = window as TelegramWindow;
    if (telegramWindow.Telegram?.WebApp?.colorScheme !== undefined) {
      return telegramWindow.Telegram.WebApp.colorScheme;
    }
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export default function DesignSystemBootPage(): JSX.Element {
  const [theme, setTheme] = useState<ThemeChoice>("system");

  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(theme);
  }, [theme]);

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Collage design system status">
        <a className="brand" href="#main-content" aria-label="Collage home">
          <span className="brand__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>collage</span>
        </a>
        <StatusBadge tone="attention">Milestone 1</StatusBadge>
      </section>

      <div className="content" id="main-content">
        <section className="hero">
          <div>
            <p className="kicker">Operational fintech · Telegram native</p>
            <h2>Financial state should never be a guessing game.</h2>
            <p className="hero__copy">
              A design-system boot page for calm, explicit group-contribution
              operations. No provider call or business flow is active yet.
            </p>
          </div>
          <div className="brand-swatch" aria-label="Collage brand colors">
            <div className="brand-swatch__yellow">
              <span>Collage Yellow</span>
              <strong>#FFD85C</strong>
            </div>
            <div className="brand-swatch__blue">
              <span>Collage Blue</span>
              <strong>#0357EE</strong>
            </div>
          </div>
        </section>

        <section className="workspace">
          <div className="operational-column">
            <CollageContextHeader
              collage="December Builders"
              group="Builders Community"
              summary="₦20,000 weekly · Cycle 3 of 10"
              detail="Recipient: Amaka · Due Friday, 6:00 PM"
            />

            <article className="cycle-panel">
              <div className="cycle-panel__top">
                <div>
                  <span className="eyebrow">Current cycle</span>
                  <p className="amount" aria-label="Twenty thousand naira">
                    ₦20,000
                  </p>
                </div>
                <StatusBadge tone="active">Collecting</StatusBadge>
              </div>
              <dl className="financial-grid">
                <div>
                  <dt>Confirmed</dt>
                  <dd>₦140,000</dd>
                </div>
                <div>
                  <dt>Expected pot</dt>
                  <dd>₦200,000</dd>
                </div>
                <div>
                  <dt>Contributors</dt>
                  <dd>7 of 10 paid</dd>
                </div>
                <div>
                  <dt>Deadline</dt>
                  <dd>Fri · 6:00 PM</dd>
                </div>
              </dl>
              <div
                aria-label="Seven of ten contributions confirmed"
                aria-valuemax={10}
                aria-valuemin={0}
                aria-valuenow={7}
                className="progress"
                role="progressbar"
              >
                <span />
              </div>
              <button className="primary-action" type="button">
                Review contribution
                <ArrowRight aria-hidden="true" size={19} />
              </button>
              <p className="action-note">
                This reference action does not initialize a payment.
              </p>
            </article>
          </div>

          <aside className="system-panel">
            <div className="panel-heading">
              <div>
                <p className="kicker">Environment</p>
                <h2>Theme &amp; viewport</h2>
              </div>
              <StatusBadge tone="success">
                <Check aria-hidden="true" size={13} /> Ready
              </StatusBadge>
            </div>

            <fieldset className="theme-picker">
              <legend>Theme mode</legend>
              <div>
                {themes.map(({ icon: Icon, label, value }) => (
                  <button
                    aria-pressed={theme === value}
                    className="theme-option"
                    key={value}
                    onClick={() => {
                      setTheme(value);
                    }}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={17} />
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="viewport-note">
              <Smartphone aria-hidden="true" size={20} />
              <div>
                <strong>Compact first</strong>
                <p>
                  16px gutters, safe-area padding, 48px actions. Fullscreen
                  remains a focused 720px operational column.
                </p>
              </div>
            </div>
          </aside>
        </section>

        <section className="states-section" aria-labelledby="state-title">
          <div className="section-heading">
            <div>
              <p className="kicker">Asynchronous truth</p>
              <h2 id="state-title">Every waiting state has a name.</h2>
            </div>
            <p>These are visual contracts, not simulated provider outcomes.</p>
          </div>

          <div
            className="skeleton-card"
            aria-label="Structural loading example"
          >
            <div className="skeleton skeleton--label" />
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line-short" />
            <span>Skeleton / loading</span>
          </div>

          <div className="state-grid">
            <AsyncStateCard
              action="Check again"
              description="Confirming with Monnify. Do not pay again. Last checked 12 seconds ago."
              title="Provider confirmation pending"
              tone="provider"
            />
            <AsyncStateCard
              action="Retry safely"
              description="We could not refresh the latest server state. No new payment was created."
              title="Retryable error"
              tone="danger"
            />
            <AsyncStateCard
              description="Money-moving actions stay disabled until the server state is refreshed."
              title="You are offline"
              tone="attention"
              variant="offline"
            />
            <AsyncStateCard
              action="Return to Telegram"
              description="This action link has expired. Open the group’s current pinned Collage status."
              title="Launch link expired"
              tone="neutral"
              variant="expired"
            />
            <AsyncStateCard
              description="Open Collage from the Telegram group where this action belongs."
              title="Telegram access required"
              tone="neutral"
              variant="unauthorized"
            />
            <article className="state-card state-card--attention">
              <AlertTriangle aria-hidden="true" size={20} />
              <div>
                <h3>Provider operation still unresolved</h3>
                <p>
                  A timeout is unknown, not failed. The original reference must
                  be reconciled before another attempt.
                </p>
              </div>
            </article>
          </div>
        </section>
      </div>

      <footer>
        <span>Collage design system · foundation only</span>
        <span>Compact · Fullscreen · Light · Dark · Telegram · System</span>
      </footer>
    </main>
  );
}
