import React from 'react'
import type { LucideIcon } from 'lucide-react'
import './auth.css'

const PHOTO_ALT =
  'A school principal and an office administrator smile at a laptop as they set up their school, with hand-drawn doodles of connected hexagons, a school building and a check mark'

// React 18 doesn't know `fetchPriority`; the lowercase attribute passes straight through.
const highPriority = { fetchpriority: 'high' } as React.ImgHTMLAttributes<HTMLImageElement>

export interface AuthStep {
  icon: LucideIcon
  title: string
  detail: string
}

interface AuthLayoutProps {
  /** Photo-panel headline (desktop only). Rendered as an h2; the form title is the page's h1. */
  headline: React.ReactNode
  subline: string
  steps?: { title: string; items: AuthStep[] }
  children: React.ReactNode
}

// The marketing site, which the brand links back to.
const marketingOrigin = () =>
  typeof window !== 'undefined' && window.location.hostname.startsWith('stage')
    ? 'https://stage.capabble.cloud'
    : 'https://www.capabble.cloud'

const AuthLayout: React.FC<AuthLayoutProps> = ({ headline, subline, steps, children }) => (
  <div className="cb-auth">
    {/* The photo stays bright in dark mode, so its text and card stay light-themed too. */}
    <section className="cb-auth-photo" aria-label="Capabble" data-theme="light">
      <picture>
        <source media="(min-width: 1024px)" type="image/webp" srcSet="/auth/signup-hero-tall.webp" />
        <source media="(min-width: 1024px)" srcSet="/auth/signup-hero-tall.jpg" />
        <source type="image/webp" srcSet="/auth/signup-hero-wide.webp" />
        <img src="/auth/signup-hero-wide.jpg" alt={PHOTO_ALT} width={1536} height={1024} {...highPriority} />
      </picture>

      <a className="cb-auth-brand" href={marketingOrigin()}>
        <img src="/auth/capabble-mark.png" alt="" width={40} height={40} />
        <span className="cb-auth-wordmark">
          Capa<span>bb</span>le
        </span>
      </a>

      <div className="cb-auth-intro">
        <h2>{headline}</h2>
        <p>{subline}</p>
      </div>

      {steps ? (
        <div className="cb-auth-steps">
          <h3>{steps.title}</h3>
          <ol>
            {steps.items.map(({ icon: StepIcon, title, detail }, i) => (
              <li key={title}>
                <span className="cb-auth-step-icon" data-primary={i === 0 ? '' : undefined}>
                  <StepIcon size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span>
                  <span className="cb-auth-step-title">{title}</span>
                  <span className="cb-auth-step-detail">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>

    <main className="cb-auth-main">
      <div className="cb-auth-column">{children}</div>
      <footer className="cb-auth-footer">
        <span>© 2026 Capabble</span>
        <a href="#/privacy">Privacy</a>
        <a href="#/terms">Terms</a>
        <a href="#/help">Help</a>
      </footer>
    </main>
  </div>
)

export default AuthLayout
