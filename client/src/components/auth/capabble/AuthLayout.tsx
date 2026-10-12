import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { marketingLinks } from '@/utils/marketingSite'
import './auth.css'

// React 18 doesn't know `fetchPriority`; the lowercase attribute passes straight through.
const highPriority = { fetchpriority: 'high' } as React.ImgHTMLAttributes<HTMLImageElement>

/*
 * Two layouts from the design:
 * - "signin" (sign in, forgot password, set a new password): teacher photo, 56/44 split, 420px form
 * - "signup" (create account): principal and administrator photo, 52/48 split, 480px form
 */
const PHOTOS = {
  signin: {
    base: '/auth/signin-hero',
    alt: 'A teacher in a blue kurta smiles at her laptop as she signs in, with hand-drawn doodles of a key, a check mark and a calendar around her',
  },
  signup: {
    base: '/auth/signup-hero',
    alt: 'A school principal and an office administrator smile at a laptop as they set up their school, with hand-drawn doodles of connected hexagons, a school building and a check mark',
  },
} as const

interface AuthLayoutProps {
  layout: keyof typeof PHOTOS
  /** Photo-panel headline (desktop only). An h2; the form title is the page's h1. */
  headline: React.ReactNode
  subline: string
  /** The floating card at the bottom of the photo panel (desktop only). */
  card?: React.ReactNode
  children: React.ReactNode
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ layout, headline, subline, card, children }) => {
  const links = marketingLinks()
  const photo = PHOTOS[layout]
  return (
    <div className="cb-auth" data-layout={layout}>
      {/* The photo stays bright in dark mode, so its text and card stay light-themed too. */}
      <section className="cb-auth-photo" aria-label="Capabble" data-theme="light">
        <picture>
          <source media="(min-width: 1024px)" type="image/webp" srcSet={`${photo.base}-tall.webp`} />
          <source media="(min-width: 1024px)" srcSet={`${photo.base}-tall.jpg`} />
          <source type="image/webp" srcSet={`${photo.base}-wide.webp`} />
          <img src={`${photo.base}-wide.jpg`} alt={photo.alt} width={1536} height={1024} {...highPriority} />
        </picture>

        <a className="cb-auth-brand" href={links.home} aria-label="Capabble home">
          <img src="/auth/capabble-mark.png" alt="" width={40} height={40} />
          <span className="cb-auth-wordmark">
            Capa<span>bb</span>le
          </span>
        </a>

        <div className="cb-auth-intro">
          <h2>{headline}</h2>
          <p>{subline}</p>
        </div>

        {card ? <div className="cb-auth-card">{card}</div> : null}
      </section>

      <main className="cb-auth-main">
        <div className="cb-auth-column">{children}</div>
        <footer className="cb-auth-footer">
          <span>© 2026 Capabble</span>
          <a href={links.privacy}>Privacy</a>
          <a href={links.terms}>Terms</a>
          <a href={links.help}>Help</a>
        </footer>
      </main>
    </div>
  )
}

/** Card heading with a soft icon tile, as used on the sign-in and password screens. */
export const CardHeading: React.FC<{ icon: LucideIcon; children: React.ReactNode }> = ({ icon: HeadIcon, children }) => (
  <div className="cb-auth-card-head">
    <span className="cb-auth-step-icon">
      <HeadIcon size={16} strokeWidth={1.75} aria-hidden="true" />
    </span>
    <span className="cb-auth-card-title">{children}</span>
  </div>
)

export interface AuthStep {
  icon: LucideIcon
  title: string
  detail: string
}

/** "Three steps to get started" card on the create-account screen. */
export const StepsCard: React.FC<{ title: string; items: AuthStep[] }> = ({ title, items }) => (
  <>
    <span className="cb-auth-card-title">{title}</span>
    <ol className="cb-auth-steps">
      {items.map(({ icon: StepIcon, title: stepTitle, detail }, i) => (
        <li key={stepTitle}>
          <span className="cb-auth-step-icon" data-primary={i === 0 ? '' : undefined}>
            <StepIcon size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span>
            <span className="cb-auth-step-title">{stepTitle}</span>
            <span className="cb-auth-step-detail">{detail}</span>
          </span>
        </li>
      ))}
    </ol>
  </>
)

export default AuthLayout
