"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Bot, Building2, CheckCircle2, ChevronRight, Sparkles, UserRoundPlus } from "lucide-react"

type StepId = "name" | "slug" | "adminEmail" | "adminPassword" | "confirmPassword"

interface DraftState {
  name: string
  slug: string
  adminEmail: string
  adminPassword: string
  confirmPassword: string
}

interface ChatMessage {
  id: string
  role: "assistant" | "user"
  text: string
}

interface PersistedState {
  draft: DraftState
  currentStep: number
  messages: ChatMessage[]
}

interface TenantSignupStartPayload {
  name: string
  slug: string
  adminEmail: string
  adminPassword: string
  confirmPassword: string
}

interface TenantSignupStartResponse {
  ticket: string
  tenantSlug: string
  expiresAt: string
  otpExpiresAt: string
  otpDeliveryStatus: "sent" | "failed"
}

const CHAT_STORAGE_KEY = "centre-signup-chat-v2"
const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,128}$/

const apiOrigin = (process.env.NEXT_PUBLIC_API_ORIGIN || "https://api.capabble.cloud").replace(/\/+$/, "")
const appDomain = process.env.NEXT_PUBLIC_ROOT_APP_DOMAIN || "capabble.cloud"
const loginUrl = `${(process.env.NEXT_PUBLIC_APP_ORIGIN || "https://app.capabble.cloud").replace(/\/+$/, "")}/login`

const STEPS: Array<{
  id: StepId
  prompt: string
  placeholder: string
  inputType: "text" | "email" | "password"
}> = [
  {
    id: "name",
    prompt: "Please enter centre name.",
    placeholder: "Example: Sunrise Public School",
    inputType: "text",
  },
  {
    id: "slug",
    prompt: "Choose a workspace slug. This becomes your app URL.",
    placeholder: "Example: sunrise-public-school",
    inputType: "text",
  },
  {
    id: "adminEmail",
    prompt: "What is the admin email for this centre?",
    placeholder: "admin@institution.com",
    inputType: "email",
  },
  {
    id: "adminPassword",
    prompt: "Set a strong admin password (8+ chars, upper/lower/number/special).",
    placeholder: "Create password",
    inputType: "password",
  },
  {
    id: "confirmPassword",
    prompt: "Confirm the password once more.",
    placeholder: "Re-enter password",
    inputType: "password",
  },
]

const emptyDraft: DraftState = {
  name: "",
  slug: "",
  adminEmail: "",
  adminPassword: "",
  confirmPassword: "",
}

const messageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")

const masked = (value: string) => "\u2022".repeat(Math.max(value.length, 8))

const buildReviewMessage = (draft: DraftState) => {
  return [
    "Perfect, here is what I captured:",
    `Centre name: ${draft.name}`,
    `Centre slug: ${draft.slug}`,
    `Admin email: ${draft.adminEmail}`,
    'Reply with edits or tap "Create Centre" to finish.',
  ].join("\n")
}

const validateStepValue = (stepId: StepId, value: string, draft: DraftState) => {
  if (stepId === "name") {
    const normalized = value.trim()
    if (normalized.length < 2) {
      return { error: "Centre name must be at least 2 characters." }
    }
    return { value: normalized }
  }

  if (stepId === "slug") {
    const normalized = toSlug(value)
    if (!slugRegex.test(normalized)) {
      return { error: "Slug can use lowercase letters, numbers, and hyphens only." }
    }
    return { value: normalized }
  }

  if (stepId === "adminEmail") {
    const normalized = value.trim().toLowerCase()
    if (!emailRegex.test(normalized)) {
      return { error: "Please enter a valid admin email." }
    }
    return { value: normalized }
  }

  if (stepId === "adminPassword") {
    if (!strongPasswordRegex.test(value)) {
      return { error: "Password must include uppercase, lowercase, number, and special character." }
    }
    return { value }
  }

  if (stepId === "confirmPassword") {
    if (value !== draft.adminPassword) {
      return { error: "Confirm password must exactly match the password." }
    }
    return { value }
  }

  return { error: "Invalid input" }
}

async function startSignup(payload: TenantSignupStartPayload): Promise<TenantSignupStartResponse> {
  const response = await fetch(`${apiOrigin}/api/admin/public/tenant-signup/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!response.ok) {
    const error: any = new Error(data.message || "Signup failed")
    error.response = { data }
    throw error
  }
  return data.data
}

function buildRedirectUrl(tenantSlug: string, ticket: string): string {
  return `https://${tenantSlug}.${appDomain}/#/signup/complete?ticket=${encodeURIComponent(ticket)}`
}

export const SignupChat: React.FC = () => {
  const initialState = useMemo<PersistedState>(() => {
    try {
      const raw = sessionStorage.getItem(CHAT_STORAGE_KEY)
      if (!raw) {
        return {
          draft: emptyDraft,
          currentStep: 0,
          messages: [
            {
              id: messageId(),
              role: "assistant",
              text: "Hi, I am your Capabble onboarding assistant. I will create your centre in a few quick steps.",
            },
            {
              id: messageId(),
              role: "assistant",
              text: STEPS[0].prompt,
            },
          ],
        }
      }

      return JSON.parse(raw) as PersistedState
    } catch {
      return {
        draft: emptyDraft,
        currentStep: 0,
        messages: [
          {
            id: messageId(),
            role: "assistant",
            text: "Hi, I am your Capabble onboarding assistant. I will create your centre in a few quick steps.",
          },
          {
            id: messageId(),
            role: "assistant",
            text: STEPS[0].prompt,
          },
        ],
      }
    }
  }, [])

  const [draft, setDraft] = useState<DraftState>(initialState.draft)
  const [currentStep, setCurrentStep] = useState(initialState.currentStep)
  const [messages, setMessages] = useState<ChatMessage[]>(initialState.messages)
  const [input, setInput] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef<number | null>(null)

  const isReviewStep = currentStep >= STEPS.length
  const activeStep = STEPS[Math.min(currentStep, STEPS.length - 1)]

  useEffect(() => {
    sessionStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify({
        draft,
        currentStep,
        messages,
      })
    )
  }, [draft, currentStep, messages])

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [])

  const pushUserMessage = (text: string) => {
    setMessages((prev) => [...prev, { id: messageId(), role: "user", text }])
  }

  const pushAssistantMessage = (text: string, delay = 360) => {
    setIsTyping(true)
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      setMessages((prev) => [...prev, { id: messageId(), role: "assistant", text }])
      setIsTyping(false)
    }, delay)
  }

  const jumpToStep = (stepIndex: number) => {
    setCurrentStep(stepIndex)
    const key = STEPS[stepIndex].id
    setInput(draft[key] || "")
    pushAssistantMessage(`Sure, let's update this.\n${STEPS[stepIndex].prompt}`)
  }

  const handleStepSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (isSubmitting || isReviewStep) {
      return
    }

    const result = validateStepValue(activeStep.id, input, draft)
    if (result.error) {
      pushAssistantMessage(result.error, 220)
      return
    }

    const value = result.value || ""
    const nextDraft = {
      ...draft,
      [activeStep.id]: value,
    }

    setDraft(nextDraft)
    pushUserMessage(activeStep.inputType === "password" ? masked(value) : value)
    setInput("")

    const nextStep = currentStep + 1
    setCurrentStep(nextStep)

    if (nextStep < STEPS.length) {
      pushAssistantMessage(STEPS[nextStep].prompt)
      return
    }

    pushAssistantMessage(buildReviewMessage(nextDraft))
  }

  const handleStartSignup = async () => {
    if (isSubmitting) {
      return
    }

    setIsSubmitting(true)
    pushAssistantMessage("Creating your centre now...")

    try {
      const result = await startSignup({
        name: draft.name,
        slug: draft.slug,
        adminEmail: draft.adminEmail,
        adminPassword: draft.adminPassword,
        confirmPassword: draft.confirmPassword,
      })

      sessionStorage.removeItem(CHAT_STORAGE_KEY)
      if (result.otpDeliveryStatus === "sent") {
        pushAssistantMessage("Centre ready. We sent a verification code to your admin email. Redirecting you now...")
      } else {
        pushAssistantMessage(
          "Centre ready, but OTP email delivery failed. Redirecting now so you can resend the code from the verification page."
        )
      }

      const redirectUrl = buildRedirectUrl(result.tenantSlug, result.ticket)
      window.setTimeout(() => {
        window.location.assign(redirectUrl)
      }, 900)
    } catch (error: any) {
      const errorCode = error?.response?.data?.errorCode
      if (errorCode === "slug_taken") {
        pushAssistantMessage("That slug is already taken. Please choose another slug.")
        setCurrentStep(1)
        setInput(draft.slug)
      } else if (errorCode === "admin_email_taken") {
        pushAssistantMessage("That admin email is already used. Please provide a different email.")
        setCurrentStep(2)
        setInput(draft.adminEmail)
      } else if (errorCode === "rate_limit_exceeded") {
        pushAssistantMessage("Too many attempts right now. Please wait and try again.")
      } else {
        pushAssistantMessage("Signup failed due to a temporary issue. Please retry in a moment.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const suggestedSlugs = useMemo(() => {
    const base = toSlug(draft.name)
    if (!base) {
      return []
    }
    return [base, `${base}-school`, `${base}-campus`].filter(
      (value, index, array) => array.indexOf(value) === index
    )
  }, [draft.name])

  return (
    <div className="h-dvh bg-slate-950 text-white overflow-hidden">
      <div className="h-full grid grid-rows-[auto_1fr] lg:grid-rows-1 lg:grid-cols-[1fr_1.3fr]">
        {/* Left panel — info */}
        <section className="border-b border-white/10 lg:border-b-0 lg:border-r lg:border-white/10 px-6 py-6 sm:px-8 lg:px-10 lg:py-0 lg:flex lg:flex-col lg:justify-center overflow-y-auto">
          <div className="max-w-lg mx-auto lg:mx-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/40 px-3 py-1 text-xs text-cyan-200">
              <Sparkles className="w-4 h-4" />
              Guided AI-Style Signup
            </div>
            <h1 className="text-3xl sm:text-4xl mt-5 font-semibold leading-tight">
              Launch your Centre in one chat.
            </h1>
            <p className="text-slate-300 mt-3 text-sm sm:text-base">
              Fast provisioning, secure onboarding ticket, and automatic dashboard sign-in.
            </p>

            <div className="mt-6 space-y-3 text-sm hidden sm:block">
              <div className="flex items-center gap-3 text-slate-200">
                <Building2 className="w-5 h-5 shrink-0 text-cyan-300" />
                Centre database provisioned in real time
              </div>
              <div className="flex items-center gap-3 text-slate-200">
                <UserRoundPlus className="w-5 h-5 shrink-0 text-cyan-300" />
                Admin account created with strong-password checks
              </div>
              <div className="flex items-center gap-3 text-slate-200">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-cyan-300" />
                Single-use onboarding ticket with auto-login
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-6 lg:mt-10">
              Already registered?{" "}
              <a href={loginUrl} className="text-cyan-300 hover:text-cyan-200">
                Sign in to Centre portal
              </a>
            </p>
          </div>
        </section>

        {/* Right panel — chat */}
        <section className="flex flex-col min-h-0 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-6">
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <div className="p-2 rounded-xl bg-cyan-400/20 border border-cyan-300/30">
              <Bot className="w-5 h-5 text-cyan-200" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold">Capabble Onboarding Assistant</h2>
              <p className="text-xs text-slate-400">Interactive centre registration</p>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] whitespace-pre-line px-4 py-3 rounded-2xl text-sm ${
                  message.role === "assistant"
                    ? "bg-slate-800/80 border border-slate-700/80 text-slate-100"
                    : "ml-auto bg-cyan-500/20 border border-cyan-300/30 text-cyan-100"
                }`}
              >
                {message.text}
              </div>
            ))}
            {isTyping && (
              <div className="max-w-[85%] px-4 py-3 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-slate-300 text-sm">
                Assistant is typing...
              </div>
            )}
          </div>

          {!isReviewStep && (
            <form onSubmit={handleStepSubmit} className="mt-4 shrink-0">
              <label className="block text-xs text-slate-400 mb-2">
                {activeStep.id === "name" ? "Centre Name:" : activeStep.prompt}
              </label>
              <div className="flex gap-3">
                <input
                  type={activeStep.inputType}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={activeStep.placeholder}
                  className="flex-1 rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-sm outline-none focus:border-cyan-300/70"
                  autoComplete="off"
                  required
                />
                <button
                  type="submit"
                  title="Submit"
                  aria-label="Submit"
                  className="px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold transition-colors disabled:opacity-60"
                  disabled={isSubmitting}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {activeStep.id === "slug" && suggestedSlugs.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {suggestedSlugs.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="text-xs px-3 py-1.5 rounded-full border border-cyan-300/40 text-cyan-200 hover:bg-cyan-300/10"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </form>
          )}

          {isReviewStep && (
            <div className="mt-4 space-y-3 shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleStartSignup}
                  disabled={isSubmitting}
                  className="rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold px-4 py-3 disabled:opacity-60"
                >
                  {isSubmitting ? "Creating..." : "Create Centre"}
                </button>
                <button
                  type="button"
                  onClick={() => jumpToStep(1)}
                  className="rounded-xl border border-white/20 px-4 py-3 hover:bg-white/10"
                >
                  Edit Slug
                </button>
              </div>
              <button
                type="button"
                onClick={() => jumpToStep(2)}
                className="w-full rounded-xl border border-white/20 px-4 py-3 hover:bg-white/10"
              >
                Edit Admin Email
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
