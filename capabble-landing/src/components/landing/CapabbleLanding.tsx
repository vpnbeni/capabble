"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import "./landing.css";
import { Avatar, Badge, Button, Icon, Progress, StatCard, type IconName } from "./primitives";
import { legalFacts } from "@/content/legalFacts";
import {
  devPlan,
  erpBars,
  impSteps,
  implMini,
  itBottom,
  itTop,
  leadAlerts,
  licFacts,
  logos,
  parentItems,
  payments,
  periods,
  phoneModules,
  roles,
  solutions,
  stats,
  steps,
  stories,
  suite,
  uptime,
} from "./data";

type Props = {
  /** School OS sign-in page */
  loginUrl: string;
  /** School OS self-service registration */
  signupUrl: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const container: CSSProperties = {
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
  boxSizing: "border-box",
};
const gutter = "clamp(20px, 4vw, 48px)";

const eyebrow: CSSProperties = {
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 14px",
  border: "1px dashed var(--border-strong)",
  borderRadius: 9999,
  background: "var(--surface)",
  fontSize: 13,
  lineHeight: "18px",
  fontWeight: 600,
  letterSpacing: "0.12em",
  color: "var(--accent-strong)",
};

const h2Style: CSSProperties = {
  margin: 0,
  maxWidth: 720,
  fontSize: "clamp(32px, 4vw, 52px)",
  lineHeight: 1.08,
  fontWeight: 800,
  letterSpacing: "-0.035em",
};

const introStyle: CSSProperties = {
  flex: "0 1 400px",
  margin: 0,
  fontSize: 17,
  lineHeight: "27px",
  color: "var(--ink-muted)",
};

const panelCard: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  overflow: "hidden",
};
const panelHead: CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid var(--border)",
  fontSize: 14,
  lineHeight: "20px",
  fontWeight: 700,
};
const rowBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 16px",
  borderBottom: "1px solid var(--border)",
};
const statGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 14,
};
const softIcon = (w: number, r: number): CSSProperties => ({
  flex: "0 0 auto",
  display: "inline-flex",
  width: w,
  height: w,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: r,
  background: "var(--accent-soft)",
  color: "var(--accent-strong)",
});

function Wordmark({ size }: { size: number }) {
  return (
    <span className="cb-wordmark" style={{ fontSize: size, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.03em" }}>
      Capa<span style={{ color: "var(--accent-strong)" }}>bb</span>le
    </span>
  );
}

function Check({ children, size = 14, gap = 10, top = 2 }: { children: string; size?: number; gap?: number; top?: number }) {
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap, fontSize: size, lineHeight: 1.5, color: "var(--ink)" }}>
      <span style={{ flex: "0 0 auto", marginTop: top, color: "var(--success)" }}>
        <Icon name="circle-check" size={16} />
      </span>
      <span>{children}</span>
    </li>
  );
}

function PhotoOrPlaceholder({
  src,
  className,
  alt,
  pos,
  icon,
  lazy,
  style,
}: {
  src: string | null;
  className: string;
  alt: string;
  pos?: string;
  icon: IconName;
  lazy?: boolean;
  style?: CSSProperties;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={src} alt={alt} loading={lazy ? "lazy" : undefined} style={{ objectPosition: pos, ...style }} />;
  }
  return (
    <div className={`${className} cb-hs-ph`} role="img" aria-label={alt} style={style}>
      <span style={{ ...softIcon(72, 9999), background: "var(--surface)", boxShadow: "var(--shadow-overlay)" }}>
        <Icon name={icon} size={32} />
      </span>
    </div>
  );
}

export function CapabbleLanding({ loginUrl, signupUrl }: Props) {
  const [role, setRole] = useState(0);
  const [menu, setMenu] = useState<null | "sol" | "plat">(null);
  const [menuSol, setMenuSol] = useState(0);
  const [menuRole, setMenuRole] = useState(0);
  const [hs, setHs] = useState(false);
  const [t, setT] = useState(0);
  const [rolled, setRolled] = useState(true);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [perView, setPerView] = useState(3);

  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const toTopRef = useRef<HTMLAnchorElement>(null);
  const hsSecRef = useRef<HTMLElement>(null);
  const hsTrackRef = useRef<HTMLDivElement>(null);
  const hsFillRef = useRef<HTMLDivElement>(null);
  const lastY = useRef(0);
  const hsRef = useRef(false);

  const motionOk = useCallback(() => {
    try {
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  }, []);

  const update = useCallback(() => {
    const doc = document.documentElement;
    const y = window.scrollY || doc.scrollTop || 0;
    const vh = window.innerHeight || 900;
    const moving = motionOk();

    const hd = headerRef.current;
    if (hd) {
      if (y > 500 && y > lastY.current + 2) hd.setAttribute("data-hide", "");
      else if (y < lastY.current - 2 || y <= 500) hd.removeAttribute("data-hide");
    }
    lastY.current = y;

    const top = toTopRef.current;
    if (top) {
      const max = Math.max(1, doc.scrollHeight - vh);
      const pct = Math.min(100, Math.round((y / max) * 100));
      if (y > 100) top.setAttribute("data-show", "");
      else top.removeAttribute("data-show");
      top.style.background = `conic-gradient(var(--accent-strong) ${pct}%, var(--border) ${pct}%)`;
    }

    // How we work: pin the section and turn vertical scroll into sideways progress
    const hsOn = moving && window.innerWidth >= 960 && vh >= 520 && vh <= 1300;
    if (hsOn !== hsRef.current) {
      hsRef.current = hsOn;
      setHs(hsOn);
      return;
    }
    const sec = hsSecRef.current;
    const track = hsTrackRef.current;
    if (!sec || !track) return;
    const panels = sec.querySelectorAll<HTMLElement>("[data-hs-panel]");
    const labs = sec.querySelectorAll<HTMLElement>("[data-hs-step]");
    if (!hsOn) {
      track.style.transform = "";
      panels.forEach((el) => (el.style.opacity = ""));
      return;
    }
    const rr = sec.getBoundingClientRect();
    const span = Math.max(1, rr.height - vh);
    const prog = Math.max(0, Math.min(1, -rr.top / span));
    const n = panels.length - 1;
    const raw = prog * n;
    const i = Math.min(n - 1, Math.floor(raw));
    let e = Math.max(0, Math.min(1, (raw - i - 0.15) / 0.7));
    e = e * e * (3 - 2 * e);
    const x = i + e;
    track.style.transform = `translate3d(${(-x * 100).toFixed(3)}%, 0, 0)`;
    if (hsFillRef.current) hsFillRef.current.style.transform = `scaleX(${(x / n).toFixed(4)})`;
    const on = Math.round(x);
    labs.forEach((el) => {
      if (Number(el.dataset.hsStep) <= on) el.setAttribute("data-on", "");
      else el.removeAttribute("data-on");
    });
    panels.forEach((el) => {
      const d = Math.abs(x - Number(el.dataset.hsPanel));
      el.style.opacity = (1 - Math.min(1, d) * 0.7).toFixed(3);
    });
  }, [motionOk]);

  // Scroll / resize wiring
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    };
    const onResize = () => {
      const w = window.innerWidth;
      setPerView(w < 640 ? 1 : w < 960 ? 2 : 3);
      onScroll();
    };
    onResize();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [update]);

  // Re-run layout maths once the pinned layout has been switched on or off
  useEffect(() => {
    const id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
  }, [hs, update]);

  // Escape or a press outside the header closes mega menus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    const onDown = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  // Entrance reveals + stats roll
  useEffect(() => {
    if (!motionOk() || typeof IntersectionObserver === "undefined") return;
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target as HTMLElement;
          if (el.hasAttribute("data-stats")) setRolled(true);
          else el.setAttribute("data-in", "");
          io.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    // Hide not-yet-seen content only once JS is running, so SSR output stays visible
    const id = requestAnimationFrame(() => {
      setRolled(false);
      setReady(true);
      root.querySelectorAll("[data-reveal], [data-stats]").forEach((el) => io.observe(el));
    });
    return () => {
      cancelAnimationFrame(id);
      io.disconnect();
    };
  }, [motionOk]);

  // Testimonials autoplay
  const maxT = Math.max(0, stories.length - perView);
  const tIdx = Math.min(t, maxT);
  const stepT = useCallback(
    (dir: number) => {
      setT((cur0) => {
        const cur = Math.min(cur0, maxT);
        if (dir > 0) return cur >= maxT ? 0 : cur + 1;
        return cur <= 0 ? maxT : cur - 1;
      });
    },
    [maxT]
  );
  useEffect(() => {
    const id = setInterval(() => {
      if (paused || !motionOk() || document.visibilityState === "hidden") return;
      stepT(1);
    }, 3000);
    return () => clearInterval(id);
  }, [paused, motionOk, stepT]);

  const closeMenu = () => setMenu(null);
  const msCur = solutions[menuSol];
  const mrCur = roles[menuRole];
  const screen = roles[role].screen;
  const gen = roles[role].gen;

  return (
    <div
      ref={rootRef}
      className="cb-app"
      data-theme="light"
      data-anim={ready ? "ready" : "off"}
      data-hs={hs ? "on" : "off"}
    >
      {/* Top navigation */}
      <header
        ref={headerRef}
        className="cb-nav"
        onMouseLeave={closeMenu}
        style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <div
          style={{
            ...container,
            padding: `12px ${gutter}`,
            display: "flex",
            alignItems: "center",
            gap: "12px 24px",
            flexWrap: "wrap",
          }}
        >
          <a
            href="#top"
            aria-label="Capabble Platforms home"
            style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--ink)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cb-logo-img" src="/landing/logo.png" alt="" style={{ display: "block", width: 44, height: 44, objectFit: "contain" }} />
            <Wordmark size={34} />
          </a>
          <nav
            aria-label="Main"
            className="cb-nav-links"
            style={{
              flex: "1 1 auto",
              display: "flex",
              justifyContent: "center",
              gap: 26,
              flexWrap: "wrap",
              fontSize: 15,
              lineHeight: "22px",
              fontWeight: 500,
            }}
          >
            <button
              type="button"
              className="cb-navbtn"
              aria-expanded={menu === "sol"}
              aria-controls="cb-menu-sol"
              onMouseEnter={() => setMenu("sol")}
              onClick={() => setMenu("sol")}
            >
              Solutions
              <span className="cb-chev">
                <Icon name="chevron-down" size={16} />
              </span>
            </button>
            <button
              type="button"
              className="cb-navbtn"
              aria-expanded={menu === "plat"}
              aria-controls="cb-menu-plat"
              onMouseEnter={() => setMenu("plat")}
              onClick={() => setMenu("plat")}
            >
              Platform
              <span className="cb-chev">
                <Icon name="chevron-down" size={16} />
              </span>
            </button>
            <a className="cb-link" href="#how" onMouseEnter={closeMenu}>
              How we work
            </a>
            <a className="cb-link" href="#platform" onMouseEnter={closeMenu}>
              For schools
            </a>
            <a className="cb-link" href="/pricing" onMouseEnter={closeMenu}>
              Pricing
            </a>
            <a className="cb-link" href="#contact" onMouseEnter={closeMenu}>
              Contact
            </a>
          </nav>
          <div className="cb-nav-actions" style={{ display: "flex", gap: 8, alignItems: "center" }} onMouseEnter={closeMenu}>
            <Button
              variant="tertiary"
              icon="log-in"
              href={loginUrl}
              className="cb-nav-login"
              title="Log in to School OS"
              aria-label="Log in to School OS"
            >
              Log in
            </Button>
            <Button variant="secondary" href={signupUrl} title="Register your school on School OS">
              Register school
            </Button>
            <Button variant="primary" iconRight="arrow-right" href="/request-demo" className="cb-nav-demo">
              Request a demo
            </Button>
          </div>
        </div>

        {menu === "sol" ? (
          <div
            id="cb-menu-sol"
            className="cb-menu"
            style={{ position: "absolute", left: 0, right: 0, top: "100%", background: "var(--surface)", borderBottom: "1px solid var(--border)", boxShadow: "var(--shadow-overlay)" }}
          >
            <div style={{ ...container, padding: `24px ${gutter} 28px`, display: "flex", flexWrap: "wrap", gap: 32 }}>
              <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: 600, letterSpacing: "0.12em", color: "var(--ink-subtle)" }}>
                  OUR SOLUTIONS
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 4 }}>
                  {solutions.map((c, i) => (
                    <a
                      key={c.title}
                      className="cb-mitem"
                      href="#solutions"
                      data-on={menuSol === i ? "" : undefined}
                      onMouseEnter={() => setMenuSol(i)}
                      onFocus={() => setMenuSol(i)}
                      onClick={closeMenu}
                    >
                      <span className="cb-mico" style={{ flex: "0 0 auto", display: "inline-flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 }}>
                        <Icon name={c.icon} size={20} />
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 15, lineHeight: "22px", fontWeight: 600 }}>{c.title}</span>
                        <span style={{ fontSize: 13, lineHeight: "19px", color: "var(--ink-muted)" }}>{c.text}</span>
                      </span>
                    </a>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: "14px 14px 0", borderTop: "1px solid var(--border)", fontSize: 14, lineHeight: "20px", fontWeight: 600 }}>
                  <a href="#solutions" onClick={closeMenu} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                    All solutions <Icon name="arrow-right" size={16} />
                  </a>
                  <a href="#contact" onClick={closeMenu} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", color: "var(--ink-muted)" }}>
                    <Icon name="phone" size={16} /> Talk to our team
                  </a>
                </div>
              </div>

              <div
                aria-hidden="true"
                style={{ flex: "0 1 420px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14, padding: 20, background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: 18 }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 15, lineHeight: "22px", fontWeight: 700 }}>{msCur.title}</span>
                  <Badge tone="accent">{msCur.menuTag}</Badge>
                </div>
                <div
                  key={menuSol}
                  className="cb-fade"
                  style={{ minHeight: 176, display: "flex", flexDirection: "column", justifyContent: "center", padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14 }}
                >
                  {menuSol === 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                      {suite.map((m) => (
                        <div key={m.code} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 8px", background: "var(--bg)", borderRadius: 10 }}>
                          <span style={{ color: "var(--accent-strong)" }}>
                            <Icon name={m.icon} size={18} />
                          </span>
                          <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: 600 }}>{m.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {menuSol === 1 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ display: "inline-flex", width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 9999, background: "var(--accent-strong)", color: "var(--on-accent)" }}>
                          <Icon name="sparkles" size={16} />
                        </span>
                        <span style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600 }}>Capabble AI</span>
                      </div>
                      <span style={{ alignSelf: "flex-end", maxWidth: "88%", padding: "8px 12px", borderRadius: "12px 12px 4px 12px", background: "var(--accent-soft)", color: "var(--accent-soft-ink)", fontSize: 13, lineHeight: "18px" }}>
                        Draft report-card remarks for 8B Maths
                      </span>
                      <span style={{ maxWidth: "92%", padding: "8px 12px", borderRadius: "12px 12px 12px 4px", background: "var(--bg)", fontSize: 13, lineHeight: "18px" }}>
                        Done: 34 remarks drafted from this term&apos;s marks. Review them before publishing?
                      </span>
                    </div>
                  ) : null}
                  {menuSol === 2 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink-muted)" }}>Fee collection · this term</span>
                        <span style={{ fontSize: 18, lineHeight: "24px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>₹18.4L</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 96 }}>
                        {erpBars.map((b) => (
                          <div key={b.m} style={{ flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
                            <span style={{ display: "block", width: "100%", height: b.h, borderRadius: "6px 6px 2px 2px", background: b.c }} />
                            <span style={{ fontSize: 11, lineHeight: "14px", color: "var(--ink-subtle)" }}>{b.m}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {menuSol === 3 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {implMini.map((im) => (
                        <div key={im.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ flex: "0 0 auto", display: "inline-flex", width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 9999, background: im.bg, color: im.ink }}>
                            <Icon name={im.icon} size={16} />
                          </span>
                          <span style={{ flex: "1 1 auto", fontSize: 13, lineHeight: "18px", fontWeight: 500 }}>{im.label}</span>
                          <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--ink-subtle)" }}>{im.when}</span>
                        </div>
                      ))}
                      <Progress value={75} size="sm" label="Go-live readiness" />
                    </div>
                  ) : null}
                  {menuSol === 4 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gridTemplateRows: "auto auto auto", alignItems: "center", justifyItems: "center", gap: "8px 10px" }}>
                      {[...itTop.map((it) => ({ ...it, k: "t" })), { k: "hub", icon: "plug" as IconName, label: "Capabble", col: "1 / 4" }, ...itBottom.map((it) => ({ ...it, k: "b" }))].map((it) =>
                        it.k === "hub" ? (
                          <span key="hub" style={{ gridColumn: "1 / 4", display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, background: "var(--accent-strong)", color: "var(--on-accent)", fontSize: 14, lineHeight: "20px", fontWeight: 700 }}>
                            <Icon name="plug" size={18} />
                            Capabble
                          </span>
                        ) : (
                          <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 9999, background: "var(--bg)", fontSize: 12, lineHeight: "16px", fontWeight: 600, gridColumn: it.col }}>
                            <span style={{ color: "var(--accent-strong)", display: "inline-flex" }}>
                              <Icon name={it.icon} size={16} />
                            </span>
                            {it.label}
                          </span>
                        )
                      )}
                    </div>
                  ) : null}
                </div>
                <span style={{ fontSize: 13, lineHeight: "19px", color: "var(--ink-muted)" }}>{msCur.menuText}</span>
              </div>
            </div>
          </div>
        ) : null}

        {menu === "plat" ? (
          <div
            id="cb-menu-plat"
            className="cb-menu"
            style={{ position: "absolute", left: 0, right: 0, top: "100%", background: "var(--surface)", borderBottom: "1px solid var(--border)", boxShadow: "var(--shadow-overlay)" }}
          >
            <div style={{ ...container, padding: `24px ${gutter} 28px`, display: "flex", flexWrap: "wrap", gap: 32 }}>
              <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: 600, letterSpacing: "0.12em", color: "var(--ink-subtle)" }}>
                  SCHOOL OS · ONE PLATFORM FOR EVERY ROLE
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 4 }}>
                  {roles.map((r, i) => (
                    <a
                      key={r.title}
                      className="cb-mitem"
                      href="#platform"
                      data-on={menuRole === i ? "" : undefined}
                      onMouseEnter={() => setMenuRole(i)}
                      onFocus={() => setMenuRole(i)}
                      onClick={() => {
                        setRole(i);
                        setMenu(null);
                      }}
                    >
                      <span className="cb-mico" style={{ flex: "0 0 auto", display: "inline-flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 }}>
                        <Icon name={r.icon} size={20} />
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 15, lineHeight: "22px", fontWeight: 600 }}>{r.title}</span>
                        <span style={{ fontSize: 13, lineHeight: "19px", color: "var(--ink-muted)" }}>{r.text}</span>
                      </span>
                    </a>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20, padding: "14px 14px 0", borderTop: "1px solid var(--border)", fontSize: 14, lineHeight: "20px", fontWeight: 600 }}>
                  <a href="#platform" onClick={closeMenu} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                    Take the product tour <Icon name="arrow-right" size={16} />
                  </a>
                  <a href={loginUrl} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                    <Icon name="log-in" size={16} /> Log in to School OS
                  </a>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-muted)", fontWeight: 500 }}>
                    <Icon name="smartphone" size={16} /> Web, Android and iOS
                  </span>
                </div>
              </div>

              <div
                aria-hidden="true"
                style={{ flex: "0 1 380px", minWidth: 0, display: "flex", flexDirection: "column", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden" }}
              >
                <div key={menuRole} className="cb-fade" style={{ position: "relative" }}>
                  <PhotoOrPlaceholder
                    src={mrCur.menuPhoto.src}
                    className=""
                    alt=""
                    pos={mrCur.menuPhoto.pos}
                    icon={mrCur.icon}
                    style={{ display: "flex", width: "100%", height: 170, objectFit: "cover", borderRadius: 0 }}
                  />
                  <span style={{ position: "absolute", left: 12, bottom: 12, display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px 6px 6px", background: "var(--surface)", borderRadius: 10, boxShadow: "var(--shadow-overlay)", fontSize: 13, lineHeight: "18px", fontWeight: 700 }}>
                    <span style={{ display: "inline-flex", width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 7, background: "var(--accent-strong)", color: "var(--on-accent)" }}>
                      <Icon name={mrCur.screen.icon} size={16} />
                    </span>
                    {mrCur.screen.title}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px 18px" }}>
                  <span style={{ fontSize: 15, lineHeight: "22px", fontWeight: 700 }}>{mrCur.title}</span>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                    {mrCur.points.map((pt) => (
                      <Check key={pt} size={13} gap={8} top={1}>
                        {pt}
                      </Check>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      {/* Hero */}
      <section id="top" className="cb-hero" style={{ position: "relative", overflow: "hidden", background: "var(--bg)" }}>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "repeating-linear-gradient(135deg, var(--border) 0px, var(--border) 1px, transparent 1px, transparent 26px)",
            opacity: 0.5,
            WebkitMaskImage: "linear-gradient(90deg, #000 0%, transparent 45%)",
            maskImage: "linear-gradient(90deg, #000 0%, transparent 45%)",
          }}
        />
        <div
          style={{
            ...container,
            position: "relative",
            zIndex: 1,
            padding: `clamp(48px, 6vw, 72px) ${gutter} clamp(40px, 6vw, 80px)`,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 48,
          }}
        >
          <div className="cb-hero-text" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div className="cb-down cb-d2" style={{ display: "flex" }}>
              <span style={{ ...eyebrow, letterSpacing: "0.08em" }}>
                <Icon name="sparkles" size={16} />
                SOFTWARE · SAAS · AI · ERP
              </span>
            </div>
            <h1
              className="cb-title cb-d1"
              style={{ margin: 0, fontSize: "clamp(44px, 5.4vw, 70px)", lineHeight: 1.02, fontWeight: 800, letterSpacing: "-0.04em", color: "var(--ink)" }}
            >
              Assurance of <span style={{ color: "var(--accent-strong)" }}>capability.</span>
            </h1>
            <p className="cb-rise cb-d5" style={{ margin: 0, maxWidth: 520, fontSize: 19, lineHeight: "30px", color: "var(--ink-muted)" }}>
              Capabble develops, licenses, implements and maintains SaaS platforms, AI applications and ERP for schools and the
              organisations around them.
            </p>
            <div className="cb-rise cb-d6" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Button variant="primary" size="lg" iconRight="arrow-right" href="/request-demo">
                Request a demo
              </Button>
              <Button variant="secondary" size="lg" href="#solutions">
                Explore solutions
              </Button>
            </div>
            <div className="cb-rise cb-d7" style={{ display: "flex", gap: 28, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              {(
                [
                  ["school", "Built for CBSE schools"],
                  ["shield-check", "Secure and reliable"],
                  ["smartphone", "Works on any phone"],
                ] as const
              ).map(([icon, label]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--accent-strong)" }}>
                  <Icon name={icon} size={22} />
                  <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500, color: "var(--ink)" }}>{label}</span>
                </div>
              ))}
            </div>
            <a
              className="cb-down cb-d9 cb-scroll"
              href="#solutions"
              style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 13, lineHeight: "18px", fontWeight: 600, letterSpacing: "0.12em" }}
            >
              <Icon name="arrow-down" size={16} />
              SCROLL DOWN
            </a>
          </div>

          {/* Phone and people, between the text and the student (wide screens) */}
          <div className="cb-hero-cluster" aria-hidden="true">
            <div
              className="cb-down cb-d8 cb-hand"
              style={{ position: "absolute", left: 4, top: -24, width: 210, transform: "rotate(-6deg)", fontSize: 36, lineHeight: "34px", fontWeight: 600, color: "var(--accent-strong)" }}
            >
              Join Capabble,
              <br />
              Become Capable
            </div>

            {/* Phone */}
            <div className="cb-rise cb-d5" style={{ position: "absolute", left: 110, top: 118, width: 200 }}>
              <div
                style={{ boxSizing: "border-box", width: 200, height: 420, display: "flex", flexDirection: "column", border: "7px solid var(--ink)", borderRadius: 34, background: "var(--surface)", boxShadow: "var(--shadow-overlay)", overflow: "hidden" }}
              >
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 6 }}>
                  <span style={{ display: "block", width: 52, height: 6, borderRadius: 9999, background: "var(--ink)" }} />
                </div>
                <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 10, padding: "8px 12px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/landing/logo.png" alt="" style={{ display: "block", width: 20, height: 20, objectFit: "contain" }} />
                      <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 800, letterSpacing: "-0.03em" }}>
                        Capa<span style={{ color: "var(--accent-strong)" }}>bb</span>le
                      </span>
                    </span>
                    <span style={{ color: "var(--ink-muted)" }}>
                      <Icon name="bell" size={16} />
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, background: "var(--accent-soft)", borderRadius: 12 }}>
                    <Avatar name="Aarav Sharma" size="sm" />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 10, lineHeight: "13px", color: "var(--accent-soft-ink)" }}>Welcome back,</span>
                      <span style={{ fontSize: 13, lineHeight: "17px", fontWeight: 700, color: "var(--accent-soft-ink)" }}>Aarav</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                    {phoneModules.map((m) => (
                      <div key={m.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 2px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10 }}>
                        <span style={{ color: "var(--accent-strong)" }}>
                          <Icon name={m.icon} size={18} />
                        </span>
                        <span style={{ fontSize: 9, lineHeight: "11px", fontWeight: 500, color: "var(--ink-muted)" }}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-around", padding: "10px 8px 12px", borderTop: "1px solid var(--border)", color: "var(--ink-subtle)" }}>
                  <span style={{ color: "var(--accent-strong)" }}>
                    <Icon name="house" size={18} />
                  </span>
                  <Icon name="book-open" size={18} />
                  <Icon name="bell" size={18} />
                  <Icon name="menu" size={18} />
                </div>
              </div>
            </div>

            {/* Teacher and parent cards */}
            {(
              [
                { cls: "cb-left cb-d6", float: "cb-float", left: -28, top: 64, width: 172, img: "/landing/teacher.jpg", pos: "center 20%", icon: "presentation", title: "For teachers", sub: "Simplify teaching" },
                { cls: "cb-left cb-d7", float: "cb-float2", left: -44, top: 344, width: 180, img: "/landing/parents.jpg", pos: "center 30%", icon: "users", title: "For parents", sub: "Stay connected" },
              ] as const
            ).map((c) => (
              <div key={c.title} className={c.cls} style={{ position: "absolute", left: c.left, top: c.top, width: c.width }}>
                <div className={c.float} style={{ padding: 6, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "var(--shadow-overlay)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.img} alt="" style={{ display: "block", width: "100%", height: 132, objectFit: "cover", objectPosition: c.pos, borderRadius: 13 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "-24px 8px 2px", padding: "8px 10px", position: "relative", background: "var(--surface)", borderRadius: 12, boxShadow: "var(--shadow-overlay)" }}>
                    <span style={softIcon(28, 8)}>
                      <Icon name={c.icon} size={16} />
                    </span>
                    <span style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: 700 }}>{c.title}</span>
                      <span style={{ fontSize: 11, lineHeight: "14px", color: "var(--ink-muted)" }}>{c.sub}</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Student photo: full-height on the right on wide screens, below the text otherwise */}
        <div className="cb-hero-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="cb-hero-img cb-imgin cb-desk-only"
            src="/landing/hero-student.jpg"
            alt="A smiling schoolboy rests his chin on a stack of books and looks up, imagining his future, with hand-drawn doodles of a lightbulb, rocket and rising chart around him"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="cb-hero-img cb-imgin cb-mob-only"
            loading="lazy"
            src="/landing/hero-student-mobile.jpg"
            alt="A smiling schoolboy rests his chin on a stack of books and looks up, imagining his future, with hand-drawn doodles of a lightbulb, rocket and rising chart around him"
          />
          <div
            className="cb-hero-chip cb-rise cb-d7"
            style={{ position: "absolute", right: "12%", bottom: 72, alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-overlay)" }}
          >
            <span style={softIcon(32, 9)}>
              <Icon name="graduation-cap" size={18} />
            </span>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 13, lineHeight: "17px", fontWeight: 700 }}>For students</span>
              <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--ink-muted)" }}>Discover capability</span>
            </span>
          </div>
        </div>
      </section>

      {/* Client logos */}
      <section
        aria-label="Institutions using Capabble"
        data-reveal="up"
        style={{ transitionDelay: ".4s", background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
      >
        <div style={{ ...container, padding: `28px ${gutter}`, display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <span style={{ flex: "0 0 auto", fontSize: 13, lineHeight: "18px", fontWeight: 600, letterSpacing: "0.08em", color: "var(--ink-subtle)" }}>TRUSTED BY</span>
          <div
            style={{
              flex: "1 1 600px",
              minWidth: 0,
              overflow: "hidden",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%)",
              maskImage: "linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%)",
            }}
          >
            <div className="cb-marquee" style={{ display: "flex", gap: 56, width: "max-content" }}>
              {[...logos, ...logos].map((l, i) => (
                <div key={i} aria-hidden={i >= logos.length || undefined} style={{ height: 44, display: "flex", alignItems: "center", gap: 8, color: "var(--ink-subtle)", whiteSpace: "nowrap" }}>
                  <Icon name={l.icon} size={20} />
                  <span style={{ fontFamily: l.font, fontSize: l.size, lineHeight: "18px", fontWeight: l.weight, letterSpacing: l.track, textTransform: l.upper ? "uppercase" : "none" }}>
                    {l.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Solutions */}
      <section id="solutions" style={{ position: "relative", overflow: "hidden", background: "var(--bg)", color: "var(--ink)" }}>
        <div style={{ ...container, position: "relative", padding: `clamp(72px, 9vw, 120px) ${gutter} 160px`, display: "flex", flexDirection: "column", gap: 48 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "24px 48px" }}>
            <div style={{ flex: "1 1 560px", display: "flex", flexDirection: "column", gap: 18 }}>
              <span data-reveal="up" style={{ ...eyebrow, transitionDelay: ".3s" }}>
                <Icon name="boxes" size={16} />
                <span>OUR SOLUTIONS</span>
              </span>
              <h2 data-reveal="title" style={h2Style}>
                One partner for the software that runs your <span style={{ color: "var(--accent-strong)" }}>institution.</span>
              </h2>
            </div>
            <p data-reveal="up" style={{ ...introStyle, transitionDelay: ".5s" }}>
              Five ways we work with schools and organisations. Most clients start with one and add the rest as they grow.
            </p>
          </div>

          <div className="cb-bento">
            {solutions.map((c, i) => (
              <div
                key={c.title}
                className={c.featured ? "cb-span2" : undefined}
                data-reveal="up"
                style={{ transitionDelay: `${(0.1 + i * 0.1).toFixed(1)}s`, display: "flex", minWidth: 0 }}
              >
                <a
                  className="cb-card"
                  href={c.featured ? "#platform" : "#contact"}
                  style={{ flex: "1 1 auto", minWidth: 0, boxSizing: "border-box", display: "flex", flexWrap: "wrap", gap: 32, padding: 32, borderRadius: 20 }}
                >
                  <div style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span className="cb-ico" style={{ display: "inline-flex", width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 14 }}>
                        <Icon name={c.icon} size={24} />
                      </span>
                      <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600, letterSpacing: "0.06em", color: "var(--ink-subtle)", fontVariantNumeric: "tabular-nums" }}>
                        0{i + 1}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <span style={{ fontSize: 24, lineHeight: "31px", fontWeight: 700, letterSpacing: "-0.02em" }}>{c.title}</span>
                      <span style={{ fontSize: 15, lineHeight: "23px", color: "var(--ink-muted)" }}>{c.text}</span>
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                      {c.points.map((pt) => (
                        <Check key={pt}>{pt}</Check>
                      ))}
                    </ul>
                    <span style={{ flex: "1 1 auto" }} />
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 12, paddingTop: 16, borderTop: "1px dashed var(--border-strong)", fontSize: 15, lineHeight: "22px", fontWeight: 600 }}>
                      <span style={{ flex: "1 1 auto" }}>Learn more</span>
                      <span className="cb-arrow" style={{ display: "inline-flex", width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 9999 }}>
                        <Icon name="arrow-right" size={18} />
                      </span>
                    </span>
                  </div>
                  {c.featured ? (
                    <div aria-hidden="true" style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12, padding: 20, borderRadius: 16, background: "var(--surface-sunken)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, color: "var(--ink)" }}>School OS · modules</span>
                        <Badge tone="accent">16+</Badge>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                        {suite.map((m) => (
                          <div key={m.code} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                            <span style={{ color: "var(--accent-strong)" }}>
                              <Icon name={m.icon} size={18} />
                            </span>
                            <span style={{ fontSize: 11, lineHeight: "14px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--ink-subtle)" }}>{m.code}</span>
                            <span style={{ fontSize: 13, lineHeight: "17px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats band, overlapping the Solutions section */}
      <section aria-label="Capabble in numbers" style={{ position: "relative", zIndex: 2, marginTop: -96 }}>
        <div style={{ ...container, padding: `0 ${gutter}` }}>
          <div data-reveal="up" style={{ position: "relative", overflow: "hidden", borderRadius: 20, background: "var(--accent-strong)", color: "var(--on-accent)", boxShadow: "var(--shadow-overlay)" }}>
            <div
              aria-hidden="true"
              style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 22px)" }}
            />
            <div
              data-stats=""
              style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", padding: "clamp(36px, 5vw, 56px) clamp(20px, 3vw, 40px)", rowGap: 32 }}
            >
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 6, padding: "0 16px", borderLeft: i === 0 ? "0" : "1px dashed rgba(255,255,255,0.35)" }}
                >
                  <span className="cb-visually-hidden">{s.v}</span>
                  <span
                    aria-hidden="true"
                    style={{ display: "inline-flex", alignItems: "flex-start", height: "1em", overflow: "hidden", fontSize: "clamp(44px, 5vw, 68px)", lineHeight: 1, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
                  >
                    {s.v.split("").map((ch, k) =>
                      /[0-9]/.test(ch) ? (
                        <span key={k} style={{ display: "inline-block", height: "1em", overflow: "hidden" }}>
                          <span style={{ display: "flex", flexDirection: "column", transform: `translateY(${rolled ? -10 * Number(ch) : 0}%)`, transition: "transform 2s ease" }}>
                            {DIGITS.map((d) => (
                              <span key={d} style={{ display: "block", height: "1em", lineHeight: 1 }}>
                                {d}
                              </span>
                            ))}
                          </span>
                        </span>
                      ) : (
                        <span key={k} style={{ display: "inline-block", height: "1em", lineHeight: 1 }}>
                          {ch}
                        </span>
                      )
                    )}
                  </span>
                  <span style={{ fontSize: 16, lineHeight: "24px", color: "var(--on-accent)", opacity: 0.92 }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Platform: one screen per role */}
      <section id="platform" style={{ background: "var(--bg)" }}>
        <div style={{ ...container, padding: `clamp(72px, 9vw, 120px) ${gutter}`, display: "flex", flexDirection: "column", gap: 48 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "24px 48px" }}>
            <div style={{ flex: "1 1 560px", display: "flex", flexDirection: "column", gap: 18 }}>
              <span data-reveal="up" style={{ ...eyebrow, transitionDelay: ".3s" }}>
                <Icon name="layout-grid" size={16} />
                <span>THE PLATFORM</span>
              </span>
              <h2 data-reveal="title" style={h2Style}>
                One platform. <span style={{ color: "var(--accent-strong)" }}>Every role</span> in your school.
              </h2>
            </div>
            <p data-reveal="up" style={{ ...introStyle, transitionDelay: ".5s" }}>
              School OS gives leadership, office staff, teachers and parents their own view of the same live data. Pick a role to see what
              they get.
            </p>
          </div>

          <div
            data-reveal="up"
            style={{ transitionDelay: ".3s", display: "flex", flexWrap: "wrap", gap: 24, padding: "clamp(16px, 2.4vw, 28px)", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: 28 }}
          >
            <div role="tablist" aria-label="Roles" aria-orientation="vertical" style={{ flex: "1 1 300px", maxWidth: "100%", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                className="cb-rolelist"
                style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 520, overflowY: "auto", overscrollBehavior: "contain", margin: "-4px -8px -4px -4px", padding: "4px 8px 4px 4px" }}
              >
                {roles.map((r, i) => {
                  const on = role === i;
                  return (
                    <button
                      key={r.title}
                      type="button"
                      role="tab"
                      id={`cb-role-tab-${i}`}
                      aria-selected={on}
                      aria-controls="cb-role-panel"
                      onClick={() => setRole(i)}
                      style={{
                        display: "flex",
                        gap: 14,
                        alignItems: "flex-start",
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "16px 18px",
                        textAlign: "left",
                        fontFamily: "inherit",
                        color: "var(--ink)",
                        cursor: "pointer",
                        borderRadius: 16,
                        border: `1px solid ${on ? "var(--accent)" : "transparent"}`,
                        background: on ? "var(--surface)" : "transparent",
                        boxShadow: on ? "var(--shadow-overlay)" : "none",
                        transition: "background-color .3s ease-in-out, border-color .3s ease-in-out, box-shadow .3s ease-in-out",
                      }}
                    >
                      <span
                        style={{
                          flex: "0 0 auto",
                          display: "inline-flex",
                          width: 44,
                          height: 44,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 12,
                          background: on ? "var(--accent-strong)" : "var(--surface)",
                          color: on ? "var(--on-accent)" : "var(--accent-strong)",
                          transition: "background-color .3s ease-in-out, color .3s ease-in-out",
                        }}
                      >
                        <Icon name={r.icon} size={20} />
                      </span>
                      <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 17, lineHeight: "24px", fontWeight: 700 }}>{r.title}</span>
                        <span style={{ fontSize: 14, lineHeight: "21px", color: "var(--ink-muted)" }}>{r.text}</span>
                        {on ? (
                          <span className="cb-fade" style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                            {r.points.map((pt) => (
                              <span key={pt} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, lineHeight: "20px" }}>
                                <span style={{ flex: "0 0 auto", marginTop: 2, color: "var(--success)" }}>
                                  <Icon name="circle-check" size={16} />
                                </span>
                                <span>{pt}</span>
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, lineHeight: "18px", color: "var(--ink-subtle)" }}>
                <Icon name="arrow-down" size={16} />
                <span>{roles.length} roles · scroll for more</span>
              </div>
              <span style={{ flex: "1 1 auto" }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingTop: 8 }}>
                <Button variant="primary" size="lg" iconRight="arrow-right" href={signupUrl} title="Register your school on School OS">
                  Get School OS
                </Button>
                <Button variant="secondary" size="lg" icon="log-in" href={loginUrl} title="Log in to School OS">
                  Log in
                </Button>
              </div>
            </div>

            <div
              id="cb-role-panel"
              role="tabpanel"
              aria-labelledby={`cb-role-tab-${role}`}
              style={{ flex: "2 1 560px", minWidth: 0, display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "var(--shadow-overlay)", overflow: "hidden" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ display: "inline-flex", width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, background: "var(--accent-strong)", color: "var(--on-accent)" }}>
                    <Icon name={screen.icon} size={18} />
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 700 }}>{screen.title}</span>
                    <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--ink-subtle)" }}>{screen.meta}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink-muted)" }}>{screen.user}</span>
                  <Avatar name={screen.user} size="sm" />
                </div>
              </div>

              <div key={role} style={{ flex: "1 1 auto", padding: "clamp(16px, 2vw, 24px)", background: "var(--bg)", minHeight: 420, boxSizing: "border-box" }}>
                {role === 0 ? (
                  <div className="cb-fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={statGrid}>
                      <StatCard label="Attendance today" value="94.2" unit="%" icon="calendar-check" progress={94} progressTone="success" />
                      <StatCard label="Fees collected" value="₹18.4L" hint="This term" icon="wallet" delta="12% vs last term" />
                      <StatCard label="Syllabus covered" value="68" unit="%" icon="book-open" progress={68} />
                    </div>
                    <div style={panelCard}>
                      <div style={panelHead}>Needs your attention</div>
                      {leadAlerts.map((al) => (
                        <div key={al.text} style={{ ...rowBase, padding: "12px 16px" }}>
                          <span style={{ flex: "0 0 auto", color: "var(--ink-subtle)" }}>
                            <Icon name={al.icon} size={18} />
                          </span>
                          <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: 14, lineHeight: "20px" }}>{al.text}</span>
                          <Badge tone={al.tone}>{al.badge}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {role === 1 ? (
                  <div className="cb-fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={panelCard}>
                      <div style={panelHead}>Today&apos;s classes</div>
                      {periods.map((pd) => (
                        <div key={pd.time} style={{ ...rowBase, gap: 14, padding: "12px 16px" }}>
                          <span style={{ flex: "0 0 64px", fontSize: 13, lineHeight: "18px", fontWeight: 600, color: "var(--ink-subtle)", fontVariantNumeric: "tabular-nums" }}>{pd.time}</span>
                          <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600 }}>{pd.cls}</span>
                            <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink-muted)" }}>{pd.subject}</span>
                          </span>
                          <Badge tone={pd.tone}>{pd.status}</Badge>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 700 }}>Marks entry · Unit Test 2 · Class 8B</span>
                        <Button variant="secondary" size="sm" iconRight="arrow-right">
                          Continue
                        </Button>
                      </div>
                      <Progress label="28 of 34 students entered" value={82} />
                    </div>
                  </div>
                ) : null}

                {role === 2 ? (
                  <div className="cb-fade" style={{ display: "flex", justifyContent: "center" }}>
                    <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 12, padding: 18, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 28 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar name="Aarav Sharma" size="md" />
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 700 }}>Aarav Sharma</span>
                          <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink-muted)" }}>Class 6B · Roll no. 14</span>
                        </div>
                      </div>
                      <div style={{ padding: 14, background: "var(--bg)", borderRadius: 14 }}>
                        <Progress label="Attendance this month" value={96} tone="success" />
                      </div>
                      {parentItems.map((pi) => (
                        <div key={pi.title} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--bg)", borderRadius: 14 }}>
                          <span style={softIcon(36, 10)}>
                            <Icon name={pi.icon} size={18} />
                          </span>
                          <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600 }}>{pi.title}</span>
                            <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink-muted)" }}>{pi.sub}</span>
                          </span>
                        </div>
                      ))}
                      <Button variant="primary" size="lg" fullWidth>
                        Pay ₹12,500 now
                      </Button>
                    </div>
                  </div>
                ) : null}

                {role === 3 ? (
                  <div className="cb-fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={statGrid}>
                      <StatCard label="Collected this term" value="₹18.4L" icon="wallet" progress={86} progressTone="success" />
                      <StatCard label="Pending dues" value="₹3.1L" hint="42 students" icon="receipt" />
                      <StatCard label="New admissions" value="38" hint="For 2027–28" icon="user-plus" />
                    </div>
                    <div style={panelCard}>
                      <div style={panelHead}>Recent fee payments</div>
                      {payments.map((py) => (
                        <div key={py.name} style={rowBase}>
                          <Avatar name={py.name} size="sm" />
                          <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600 }}>{py.name}</span>
                            <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink-muted)" }}>{py.cls}</span>
                          </span>
                          <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{py.amt}</span>
                          <Badge tone={py.tone}>{py.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {gen ? (
                  <div className="cb-fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={statGrid}>
                      {gen.stats.map((gs) => (
                        <StatCard key={gs.label} label={gs.label} value={gs.value} unit={gs.unit} hint={gs.hint} icon={gs.icon} progress={gs.progress} />
                      ))}
                    </div>
                    <div style={panelCard}>
                      <div style={panelHead}>{gen.listTitle}</div>
                      {gen.rows.map((gr) => (
                        <div key={gr.title} style={rowBase}>
                          <span style={softIcon(32, 8)}>
                            <Icon name={gr.icon} size={16} />
                          </span>
                          <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600 }}>{gr.title}</span>
                            <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink-muted)" }}>{gr.sub}</span>
                          </span>
                          <span style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{gr.aside}</span>
                          <Badge tone={gr.tone}>{gr.badge}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How we work: pinned, scrolls sideways through the four steps on wide screens */}
      <section
        id="how"
        ref={hsSecRef}
        className="cb-hs"
        style={{ position: "relative", background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="cb-hs-pin">
          <div className="cb-hs-inner" style={{ ...container, padding: `clamp(72px, 9vw, 120px) ${gutter}`, display: "flex", flexDirection: "column", gap: 48 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "20px 48px" }}>
              <div style={{ flex: "1 1 520px", display: "flex", flexDirection: "column", gap: 16 }}>
                <span data-reveal="up" style={{ ...eyebrow, background: "transparent", transitionDelay: ".3s" }}>
                  <Icon name="route" size={16} />
                  <span>HOW WE WORK</span>
                </span>
                <h2 className="cb-hs-h2" data-reveal="title" style={{ ...h2Style, maxWidth: "none", fontSize: "clamp(30px, 3.6vw, 48px)" }}>
                  From first build to <span style={{ color: "var(--accent-strong)" }}>year ten.</span>
                </h2>
              </div>
              <p className="cb-hs-intro" data-reveal="up" style={{ ...introStyle, flex: "0 1 420px", transitionDelay: ".5s" }}>
                We don&apos;t hand over software and leave. One team develops it, licenses it, sets it up with you and keeps it running.
              </p>
            </div>

            <div className="cb-hs-bar" aria-hidden="true" style={{ flexDirection: "column", gap: 14 }}>
              <div style={{ position: "relative", height: 3, borderRadius: 9999, background: "var(--border)", overflow: "hidden" }}>
                <div ref={hsFillRef} style={{ position: "absolute", inset: 0, background: "var(--accent-strong)", transformOrigin: "left center", transform: "scaleX(0)" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
                {steps.map((st, idx) => (
                  <div key={st.n} className="cb-hs-lab" data-hs-step={idx} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, lineHeight: "20px", fontWeight: 600 }}>
                    <span className="cb-hs-dot" style={{ flex: "0 0 auto", width: 8, height: 8, borderRadius: 9999 }} />
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{st.n}</span>
                    <span>{st.title}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="cb-hs-track" ref={hsTrackRef}>
              {steps.map((st, idx) => (
                <div key={st.n} className="cb-hs-panel" data-hs-panel={idx} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "40px 64px" }}>
                  <div className="cb-hs-left" data-reveal="up" style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <span className="cb-hs-num" style={{ fontSize: "clamp(64px, 7vw, 96px)", lineHeight: 0.9, fontWeight: 800, letterSpacing: "-0.05em", color: "var(--accent-strong)", fontVariantNumeric: "tabular-nums" }}>
                        {st.n}
                      </span>
                      <span className="cb-hs-icon" style={softIcon(52, 9999)}>
                        <Icon name={st.icon} size={24} />
                      </span>
                    </div>
                    <h3 className="cb-hs-h3" style={{ margin: 0, fontSize: "clamp(28px, 3vw, 40px)", lineHeight: 1.1, fontWeight: 800, letterSpacing: "-0.03em" }}>
                      {st.title}
                    </h3>
                    <p className="cb-hs-text" style={{ margin: 0, maxWidth: 460, fontSize: 18, lineHeight: "28px", color: "var(--ink-muted)" }}>
                      {st.text}
                    </p>
                    <ul className="cb-hs-points" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                      {st.points.map((pt) => (
                        <Check key={pt} size={15} top={3}>
                          {pt}
                        </Check>
                      ))}
                    </ul>
                  </div>

                  <div className="cb-hs-visual" data-reveal="up" style={{ transitionDelay: ".2s", flex: "1.2 1 440px", minWidth: 0, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
                    <PhotoOrPlaceholder src={st.photo} className="cb-hs-photo cb-desk-only" alt={st.alt} pos={st.pos} icon={st.icon} />
                    <PhotoOrPlaceholder src={st.photoMobile ?? st.photo} className="cb-hs-photo cb-mob-only" alt={st.alt} icon={st.icon} lazy />
                    <div
                      className="cb-hs-card"
                      aria-hidden="true"
                      style={{ display: "flex", flexDirection: "column", gap: 16, padding: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-overlay)" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 700 }}>{st.vTitle}</span>
                          <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink-subtle)" }}>{st.vMeta}</span>
                        </span>
                        <Badge tone={st.vTone}>{st.vBadge}</Badge>
                      </div>

                      {st.kind === "dev" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          {devPlan.map((dv) => (
                            <div key={dv.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ flex: "0 0 auto", color: dv.ink }}>
                                <Icon name={dv.icon} size={20} />
                              </span>
                              <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: 14, lineHeight: "20px" }}>{dv.label}</span>
                              <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink-subtle)" }}>{dv.when}</span>
                            </div>
                          ))}
                          <Progress label="Build progress" value={55} />
                        </div>
                      ) : null}

                      {st.kind === "lic" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                            {licFacts.map((lf) => (
                              <div key={lf.l} style={{ display: "flex", flexDirection: "column", gap: 2, padding: 12, background: "var(--bg)", borderRadius: 12 }}>
                                <span style={{ fontSize: 22, lineHeight: "28px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{lf.v}</span>
                                <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--ink-muted)" }}>{lf.l}</span>
                              </div>
                            ))}
                          </div>
                          <Progress label="Active students · 1,148 of 1,500" value={77} />
                          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, borderTop: "1px dashed var(--border-strong)", fontSize: 13, lineHeight: "18px", color: "var(--ink-muted)" }}>
                            <Icon name="calendar-days" size={16} />
                            <span>Renews 1 April 2027 · all updates included</span>
                          </div>
                        </div>
                      ) : null}

                      {st.kind === "imp" ? (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {impSteps.map((im) => (
                            <div key={im.label} style={{ display: "flex", gap: 14 }}>
                              <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
                                <span style={{ display: "inline-flex", width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 9999, background: im.dotBg, color: im.dotInk }}>
                                  <Icon name={im.icon} size={16} />
                                </span>
                                <span style={{ flex: "1 1 auto", width: 2, minHeight: 14, background: im.line }} />
                              </div>
                              <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 6, paddingBottom: 14 }}>
                                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, lineHeight: "20px", fontWeight: 600 }}>
                                  <span>{im.label}</span>
                                  <span style={{ fontWeight: 500, color: "var(--ink-subtle)" }}>{im.when}</span>
                                </span>
                                <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--ink-muted)" }}>{im.sub}</span>
                                {im.showBar ? <Progress value={75} size="sm" label="42 of 56 staff trained" /> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {st.kind === "mnt" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 48 }}>
                            {uptime.map((u, k) => (
                              <span key={k} style={{ flex: "1 1 0", height: u.h, borderRadius: 3, background: u.c }} />
                            ))}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, lineHeight: "16px", color: "var(--ink-subtle)" }}>
                            <span>30 days ago</span>
                            <span>99.9% uptime</span>
                            <span>Today</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                            {[
                              ["3h 20m", "Average support response"],
                              ["v4.12", "New report-card templates"],
                            ].map(([v, l]) => (
                              <div key={l} style={{ display: "flex", flexDirection: "column", gap: 2, padding: 12, background: "var(--bg)", borderRadius: 12 }}>
                                <span style={{ fontSize: 20, lineHeight: "26px", fontWeight: 700 }}>{v}</span>
                                <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--ink-muted)" }}>{l}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section
        id="stories"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        style={{ position: "relative", overflow: "hidden", background: "var(--surface-sunken)" }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "repeating-linear-gradient(135deg, var(--border-strong) 0px, var(--border-strong) 1px, transparent 1px, transparent 28px)",
            opacity: 0.3,
            WebkitMaskImage: "linear-gradient(90deg, #000 0%, transparent 40%)",
            maskImage: "linear-gradient(90deg, #000 0%, transparent 40%)",
          }}
        />
        <div style={{ ...container, position: "relative", padding: `clamp(72px, 9vw, 120px) ${gutter}`, display: "flex", flexDirection: "column", gap: 48 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
            <div style={{ flex: "1 1 520px", display: "flex", flexDirection: "column", gap: 18 }}>
              <span data-reveal="up" style={{ ...eyebrow, transitionDelay: ".3s" }}>
                <Icon name="messages-square" size={16} />
                CLIENT STORIES
              </span>
              <h2 data-reveal="title" style={{ ...h2Style, maxWidth: "none" }}>
                What our partners <span style={{ color: "var(--accent-strong)" }}>say.</span>
              </h2>
            </div>
            <div data-reveal="up" style={{ transitionDelay: ".4s", display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 14, lineHeight: "20px", color: "var(--ink-subtle)", fontVariantNumeric: "tabular-nums", marginRight: 6 }} aria-live="polite">
                {tIdx + 1} / {maxT + 1}
              </span>
              <Button variant="secondary" size="lg" icon="chevron-left" aria-label="Previous story" onClick={() => stepT(-1)} />
              <Button variant="secondary" size="lg" icon="chevron-right" aria-label="Next story" onClick={() => stepT(1)} />
            </div>
          </div>
          <div data-reveal="up" style={{ transitionDelay: ".5s", overflow: "hidden", margin: -8, padding: 8 }}>
            <div className="cb-track" style={{ display: "flex", gap: 24, transform: `translateX(calc(${tIdx} * -1 * (100% + 24px) / var(--n)))` }}>
              {stories.map((q, i) => (
                <figure
                  key={q.name}
                  className="cb-tcard"
                  style={{
                    margin: 0,
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    gap: 20,
                    padding: 32,
                    background: "var(--surface)",
                    borderRadius: 16,
                    border: `2px solid ${i === tIdx + (perView === 3 ? 1 : 0) ? "var(--accent)" : "transparent"}`,
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 72, lineHeight: 0.6, height: 36, fontWeight: 800, color: "var(--accent-strong)" }}>
                    &ldquo;
                  </span>
                  <blockquote style={{ margin: 0, flex: "1 1 auto", fontSize: 18, lineHeight: "28px", color: "var(--ink)" }}>{q.quote}</blockquote>
                  <figcaption style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 20, borderTop: "1px dashed var(--border-strong)" }}>
                    <Avatar name={q.name} size="lg" />
                    <span style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 17, lineHeight: "24px", fontWeight: 700 }}>{q.name}</span>
                      <span style={{ fontSize: 14, lineHeight: "20px", color: "var(--ink-muted)" }}>{q.role}</span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Choose story" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginTop: -16 }}>
            {Array.from({ length: maxT + 1 }, (_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => setT(n)}
                aria-label={`Show stories from ${n + 1}`}
                aria-current={n === tIdx}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 44, minWidth: 24, padding: "0 2px", border: 0, background: "transparent", cursor: "pointer" }}
              >
                <span className="cb-dot" style={{ display: "block", height: 8, width: n === tIdx ? 64 : 12, borderRadius: 9999, background: "var(--accent-strong)", opacity: n === tIdx ? 1 : 0.2 }} />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action (dark) */}
      <section data-theme="dark" style={{ position: "relative", overflow: "hidden", background: "var(--bg)", color: "var(--ink)" }}>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "repeating-linear-gradient(135deg, var(--border) 0px, var(--border) 1px, transparent 1px, transparent 30px)",
            opacity: 0.5,
            WebkitMaskImage: "linear-gradient(270deg, #000 0%, transparent 60%)",
            maskImage: "linear-gradient(270deg, #000 0%, transparent 60%)",
          }}
        />
        <div
          style={{ ...container, position: "relative", padding: `clamp(64px, 8vw, 104px) ${gutter}`, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 40 }}
        >
          <div style={{ flex: "1 1 560px", display: "flex", flexDirection: "column", gap: 18 }}>
            <h2 data-reveal="title" style={{ ...h2Style, maxWidth: "none", fontSize: "clamp(32px, 4.2vw, 56px)", lineHeight: 1.06 }}>
              Let&apos;s build what your institution <span style={{ color: "var(--accent-strong)" }}>needs next.</span>
            </h2>
            <p data-reveal="up" style={{ transitionDelay: ".5s", margin: 0, maxWidth: 560, fontSize: 18, lineHeight: "28px", color: "var(--ink-muted)" }}>
              Tell us how you work today. We&apos;ll show you where Capabble fits and what moving over involves.
            </p>
          </div>
          <div data-reveal="up" style={{ transitionDelay: ".6s", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Button variant="primary" size="lg" iconRight="arrow-right" href="/request-demo">
                Request a demo
              </Button>
              <Button variant="secondary" size="lg" icon="phone" href="tel:+911262400000">
                Talk to our team
              </Button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 16px", fontSize: 14, lineHeight: "20px", color: "var(--ink-muted)" }}>
              <span>Already on School OS?</span>
              <a href={loginUrl} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, textDecoration: "none" }}>
                <Icon name="log-in" size={16} /> Log in
              </a>
              <a href={signupUrl} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, textDecoration: "none" }}>
                Register your school <Icon name="arrow-right" size={16} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="cb-foot" style={{ background: "var(--surface)" }}>
        <div style={{ ...container, padding: `64px ${gutter} 32px`, display: "flex", flexDirection: "column", gap: 48 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 40 }}>
            <div data-reveal="up" style={{ transitionDelay: ".1s", display: "flex", flexDirection: "column", gap: 16 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/landing/logo.png" alt="" style={{ display: "block", width: 44, height: 44, objectFit: "contain" }} />
                <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>
                    Capa<span style={{ color: "var(--accent-strong)" }}>bb</span>le
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", color: "var(--ink-subtle)", marginTop: 4 }}>PLATFORMS LLP</span>
                </span>
              </span>
              <p style={{ margin: 0, fontSize: 14, lineHeight: "22px", color: "var(--ink-muted)" }}>
                Software, AI and ERP for schools and organisations, with an assurance of capability.
              </p>
            </div>
            <nav aria-label="Solutions" data-reveal="up" style={{ transitionDelay: ".3s", display: "flex", flexDirection: "column", gap: 10, fontSize: 14, lineHeight: "20px" }}>
              <span style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, letterSpacing: "0.08em", color: "var(--ink)" }}>SOLUTIONS</span>
              {solutions.map((s) => (
                <a key={s.title} href="#solutions">
                  {s.title}
                </a>
              ))}
            </nav>
            <nav aria-label="School OS" data-reveal="up" style={{ transitionDelay: ".5s", display: "flex", flexDirection: "column", gap: 10, fontSize: 14, lineHeight: "20px" }}>
              <span style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, letterSpacing: "0.08em", color: "var(--ink)" }}>SCHOOL OS</span>
              <a href={loginUrl}>Log in</a>
              <a href={signupUrl}>Register your school</a>
              <a href="#platform">For schools</a>
              <a href="/pricing">Pricing</a>
              <a href="#how">How we work</a>
              <a href="#stories">Client stories</a>
              <a href="/help">Help centre</a>
            </nav>
            <div data-reveal="up" style={{ transitionDelay: ".7s", display: "flex", flexDirection: "column", gap: 12, fontSize: 14, lineHeight: "20px", color: "var(--ink-muted)" }}>
              <span style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, letterSpacing: "0.08em", color: "var(--ink)" }}>CONTACT</span>
              {(
                [
                  ["Office", legalFacts.officeAddress],
                  ["Registered office", legalFacts.registeredAddress],
                ] as const
              ).map(([label, address]) => (
                <span key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ flex: "0 0 auto", color: "var(--ink-subtle)" }}>
                    <Icon name="map-pin" size={18} />
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: 600, color: "var(--ink)" }}>{label}</span>
                    <span>{address}</span>
                  </span>
                </span>
              ))}
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ flex: "0 0 auto", color: "var(--ink-subtle)" }}>
                  <Icon name="mail" size={18} />
                </span>
                <a href={`mailto:${legalFacts.infoEmail}`}>{legalFacts.infoEmail}</a>
              </span>
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ flex: "0 0 auto", color: "var(--ink-subtle)" }}>
                  <Icon name="phone" size={18} />
                </span>
                <a href="tel:+911262400000">+91 1262 400 000</a>
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, paddingTop: 24, borderTop: "1px solid var(--border)", fontSize: 13, lineHeight: "18px", color: "var(--ink-subtle)" }}>
            <span>© 2026 Capabble Platforms LLP. All rights reserved.</span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
              <a href="/privacy">Privacy policy</a>
              <a href="/terms">Terms of use</a>
              <a href="/help">Help</a>
            </span>
          </div>
        </div>
      </footer>

      <a ref={toTopRef} className="cb-totop" href="#top" aria-label="Back to top">
        <span style={{ display: "flex", width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 9999, background: "var(--surface)", color: "var(--accent-strong)" }}>
          <Icon name="arrow-up" size={20} />
        </span>
      </a>
    </div>
  );
}
