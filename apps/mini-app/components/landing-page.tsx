"use client";

import { motion, useReducedMotion } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import {
  ArrowDown,
  ArrowUpRight,
  Bot,
  Check,
  Moon,
  Send,
  ShieldCheck,
  Sun,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useEffect, useRef, useState, type JSX } from "react";

const TELEGRAM_BOT_URL = "https://t.me/collage_ajo_bot";

const steps = [
  {
    icon: UsersRound,
    number: "01",
    title: "Create your circle",
    copy: "Bring your fellow contributors together in a Telegram group.",
  },
  {
    icon: Bot,
    number: "02",
    title: "Add Collage",
    copy: "Add the bot, tag it, and turn your group instructions into a structured contribution campaign.",
  },
  {
    icon: UserRoundCheck,
    number: "03",
    title: "Everybody opts in",
    copy: "Each contributor reviews the rules, chooses a position, and joins for themselves.",
  },
  {
    icon: WalletCards,
    number: "04",
    title: "Stay in rhythm",
    copy: "The cycle starts when the group is ready, with timely notifications and transparent progress for everyone.",
  },
] as const;

export function LandingPage(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("collage-theme");
    const resolved =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = resolved;
    const frame = window.requestAnimationFrame(() => setTheme(resolved));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
    const update = (time: number): void => lenis.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    lenis.on("scroll", () => ScrollTrigger.update());

    const context = gsap.context(() => {
      gsap.from("[data-hero-line]", {
        yPercent: 115,
        duration: 0.9,
        ease: "power4.out",
        stagger: 0.08,
      });
      gsap.to("[data-parallax='slow']", {
        yPercent: 22,
        ease: "none",
        scrollTrigger: { scrub: true, start: "top top", end: "bottom top" },
      });
      gsap.utils.toArray<HTMLElement>("[data-step]").forEach((element) => {
        gsap.from(element, {
          opacity: 0,
          x: 48,
          scrollTrigger: { trigger: element, start: "top 78%" },
          duration: 0.55,
          ease: "power2.out",
        });
      });
    }, rootRef);

    return () => {
      context.revert();
      gsap.ticker.remove(update);
      lenis.destroy();
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion || window.matchMedia("(pointer: coarse)").matches) return;
    const move = (event: PointerEvent): void => {
      gsap.to(cursorRef.current, {
        x: event.clientX,
        y: event.clientY,
        duration: 0.16,
        ease: "power2.out",
      });
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [reduceMotion]);

  const toggleTheme = (): void => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("collage-theme", next);
  };

  return (
    <div className="landing" ref={rootRef}>
      <div aria-hidden="true" className="landing-cursor" ref={cursorRef} />
      <header className="landing-nav">
        <a aria-label="Collage home" className="landing-logo" href="#top">
          <span className="landing-logo__mark">
            <i />
            <i />
            <i />
          </span>
          COLLAGE
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <button
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            onClick={toggleTheme}
            type="button"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <a
            className="landing-nav__cta"
            href={TELEGRAM_BOT_URL}
            rel="noreferrer"
            target="_blank"
          >
            Open bot <ArrowUpRight size={17} />
          </a>
        </nav>
      </header>

      <main>
        <section className="landing-hero" id="top">
          <div aria-hidden="true" className="signal-field" data-parallax="slow">
            <div className="signal-field__orbit signal-field__orbit--one" />
            <div className="signal-field__orbit signal-field__orbit--two" />
            <motion.svg
              animate={reduceMotion ? false : { rotate: [0, 2, 0, -2, 0] }}
              className="signal-field__network"
              transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
              viewBox="0 0 1000 700"
            >
              <path d="M140 360 310 155 515 230 705 120 870 350 690 570 455 520 220 600Z" />
              <path d="m310 155 145 365 60-290 175 340M140 360l730-10M220 600l485-480" />
              {[
                [140, 360],
                [310, 155],
                [515, 230],
                [705, 120],
                [870, 350],
                [690, 570],
                [455, 520],
                [220, 600],
              ].map(([x, y], index) => (
                <circle
                  cx={x}
                  cy={y}
                  key={index}
                  r={index % 3 === 0 ? 13 : 9}
                />
              ))}
            </motion.svg>
            <motion.div
              animate={
                reduceMotion ? false : { y: [0, -13, 0], rotate: [-3, -1, -3] }
              }
              className="signal-field__tile signal-field__tile--rules"
              transition={{ duration: 4.8, repeat: Infinity }}
            >
              <Bot size={16} /> Rules set
            </motion.div>
            <motion.div
              animate={
                reduceMotion ? false : { y: [0, 12, 0], rotate: [3, 1, 3] }
              }
              className="signal-field__tile signal-field__tile--clear"
              transition={{ duration: 5.4, repeat: Infinity }}
            >
              <Check size={16} /> Cycle clear
            </motion.div>
            {Array.from({ length: 12 }, (_, index) => (
              <motion.span
                animate={
                  reduceMotion
                    ? false
                    : { y: [0, -16, 0], x: [0, index % 2 === 0 ? 7 : -7, 0] }
                }
                className={`signal-field__particle signal-field__particle--${String(index + 1)}`}
                key={index}
                transition={{
                  duration: 3 + (index % 4),
                  repeat: Infinity,
                  delay: index * -0.31,
                }}
              />
            ))}
          </div>

          <div className="landing-hero__content">
            <div className="landing-kicker">
              <ShieldCheck size={30} /> AI-powered financial operations right in
              your regular chat app
            </div>
            <h1 aria-label="Contributions, kept in rhythm">
              <span>
                <b data-hero-line>Contributions,</b>
              </span>
              <span>
                <b data-hero-line>
                  kept in <em>rhythm.</em>
                </b>
              </span>
            </h1>
            <p>
              Collage is the contribution companion that helps your Telegram
              group turn shared instructions into clear rules, hold and track
              group funds, and keep every cycle transparent.
            </p>
            <div className="landing-hero__actions">
              <a
                className="landing-button landing-button--primary"
                href={TELEGRAM_BOT_URL}
                rel="noreferrer"
                target="_blank"
              >
                Start on Telegram <Send size={19} />
              </a>
              <a
                className="landing-button landing-button--secondary"
                href="#how-it-works"
              >
                See how it works <ArrowDown size={19} />
              </a>
            </div>
            <div className="landing-trust">
              <span>
                <Check size={15} /> Clear group rules
              </span>
              <span>
                <Check size={15} /> Timely reminders
              </span>
              <span>
                <Check size={15} /> Transparent cycles
              </span>
            </div>
          </div>
          <span className="landing-scroll-cue">
            Scroll to contribute <ArrowDown size={15} />
          </span>
        </section>

        <section className="landing-steps" id="how-it-works">
          <div className="landing-steps__intro">
            <span className="landing-kicker">
              <Bot size={16} /> From chat to contribution
            </span>
            <h2>
              Four steps.
              <br />
              One shared rhythm.
            </h2>
            <p>
              Collage keeps the operations moving while your group stays
              informed and in control.
            </p>
          </div>
          <div className="landing-steps__list">
            {steps.map(({ icon: Icon, number, title, copy }) => (
              <article data-step key={number}>
                <div className="landing-step__number">{number}</div>
                <div className="landing-step__icon">
                  <Icon size={26} strokeWidth={2} />
                </div>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
                <ArrowUpRight
                  aria-hidden="true"
                  className="landing-step__arrow"
                  size={24}
                />
              </article>
            ))}
          </div>
        </section>

        <section className="landing-final-cta">
          <Bot size={34} />
          <p>Ready when your group is.</p>
          <a
            className="landing-button landing-button--primary"
            href={TELEGRAM_BOT_URL}
            rel="noreferrer"
            target="_blank"
          >
            Meet Collage bot <ArrowUpRight size={19} />
          </a>
        </section>
      </main>

      <footer className="landing-footer">
        <div>
          <span>© {new Date().getFullYear()} Collage</span>
          <span>Built for contribution circles on Telegram.</span>
        </div>
        <strong aria-hidden="true">COLLAGE</strong>
      </footer>
    </div>
  );
}
