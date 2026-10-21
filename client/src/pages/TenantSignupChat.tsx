import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLightOnlyTheme } from '@/utils/theme'
import { Link } from 'react-router-dom'
import { Bot, Building2, CheckCircle2, ChevronRight, Sparkles, UserRoundPlus } from 'lucide-react'
import tenantSignupService from '@/services/tenantSignupService'
import { buildTenantAppRedirectUrl } from '@/utils/tenantRuntime'
import { getUniversalAuthCopy } from '@/utils/publicBranding'

type StepId = 'name' | 'udiseCode' | 'slug' | 'adminEmail' | 'adminPassword' | 'confirmPassword'

interface DraftState {
  name: string
  udiseCode: string
  slug: string
  adminEmail: string
  adminPassword: string
  confirmPassword: string
}

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
}

interface PersistedState {
  draft: DraftState
  currentStep: number
  messages: ChatMessage[]
}

const CHAT_STORAGE_KEY = 'centre-signup-chat-v3'
const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,128}$/

const STEPS: Array<{
  id: StepId
  prompt: string
  placeholder: string
  inputType: 'text' | 'email' | 'password'
}> = [
  {
    id: 'name',
    prompt: 'Please enter institution name.',
    placeholder: 'Example: Sunrise Public School',
    inputType: 'text',
  },
  {
    id: 'udiseCode',
    prompt: 'Please enter your 11-digit UDISE+ code.',
    placeholder: 'Example: 06123456789',
    inputType: 'text',
  },
  {
    id: 'slug',
    prompt: 'Choose a workspace slug. This becomes your Workspace Code for logging in to your Capabble modules.',
    placeholder: 'Example: sunrise-public-school',
    inputType: 'text',
  },
  {
    id: 'adminEmail',
    prompt: 'What is the admin email for this workspace?',
    placeholder: 'admin@institution.com',
    inputType: 'email',
  },
  {
    id: 'adminPassword',
    prompt: 'Set a strong admin password (8+ chars, upper/lower/number/special).',
    placeholder: 'Create password',
    inputType: 'password',
  },
  {
    id: 'confirmPassword',
    prompt: 'Confirm the password once more.',
    placeholder: 'Re-enter password',
    inputType: 'password',
  },
]

const emptyDraft: DraftState = {
  name: '',
  udiseCode: '',
  slug: '',
  adminEmail: '',
  adminPassword: '',
  confirmPassword: '',
}

const messageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const toSlug = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-+|-+$/g, '')

const masked = (value: string) => '•'.repeat(Math.max(value.length, 8))

const buildReviewMessage = (draft: DraftState) => {
  return [
    'Perfect, here is what I captured:',
    `Centre name: ${draft.name}`,
    `UDISE+ code: ${draft.udiseCode}`,
    `School code: ${draft.slug}`,
    `Admin email: ${draft.adminEmail}`,
    'Reply with edits or tap "Create Centre" to finish.',
  ].join('\n')
}

const validateStepValue = (stepId: StepId, value: string, draft: DraftState) => {
  if (stepId === 'name') {
    const normalized = value.trim()
    if (normalized.length < 2) {
      return { error: 'Centre name must be at least 2 characters.' }
    }
    return { value: normalized }
  }

  if (stepId === 'udiseCode') {
    const normalized = value.replace(/\D/g, '')
    if (!/^\d{11}$/.test(normalized)) {
      return { error: 'UDISE+ code must be 11 digits.' }
    }
    return { value: normalized }
  }

  if (stepId === 'slug') {
    const normalized = toSlug(value)
    if (!slugRegex.test(normalized)) {
      return { error: 'School code can use lowercase letters, numbers, and hyphens only.' }
    }
    return { value: normalized }
  }

  if (stepId === 'adminEmail') {
    const normalized = value.trim().toLowerCase()
    if (!emailRegex.test(normalized)) {
      return { error: 'Please enter a valid admin email.' }
    }
    return { value: normalized }
  }

  if (stepId === 'adminPassword') {
    if (!strongPasswordRegex.test(value)) {
      return { error: 'Password must include uppercase, lowercase, number, and special character.' }
    }
    return { value }
  }

  if (stepId === 'confirmPassword') {
    if (value !== draft.adminPassword) {
      return { error: 'Confirm password must exactly match the password.' }
    }
    return { value }
  }

  return { error: 'Invalid input' }
}

const TenantSignupChat: React.FC = () => {
  useLightOnlyTheme()
  const authCopy = getUniversalAuthCopy()
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
              role: 'assistant',
          text: 'Hi, I am your Capabble onboarding assistant. I will create your workspace in a few quick steps.',
            },
            {
              id: messageId(),
              role: 'assistant',
              text: STEPS[0].prompt,
            },
          ],
        }
      }

      return JSON.parse(raw) as PersistedState
    } catch (_error) {
      return {
        draft: emptyDraft,
        currentStep: 0,
        messages: [
          {
            id: messageId(),
            role: 'assistant',
          text: 'Hi, I am your Capabble onboarding assistant. I will create your workspace in a few quick steps.',
          },
          {
            id: messageId(),
            role: 'assistant',
            text: STEPS[0].prompt,
          },
        ],
      }
    }
  }, [])

  const [draft, setDraft] = useState<DraftState>(initialState.draft)
  const [currentStep, setCurrentStep] = useState(initialState.currentStep)
  const [messages, setMessages] = useState<ChatMessage[]>(initialState.messages)
  const [input, setInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef<number | null>(null)

  const isReviewStep = currentStep >= STEPS.length
  const activeStep = STEPS[Math.min(currentStep, STEPS.length - 1)]

  useEffect(() => {
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
      draft,
      currentStep,
      messages,
    }))
  }, [draft, currentStep, messages])

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [])

  const pushUserMessage = (text: string) => {
    setMessages((prev) => [...prev, { id: messageId(), role: 'user', text }])
  }

  const pushAssistantMessage = (text: string, delay = 360) => {
    setIsTyping(true)
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      setMessages((prev) => [...prev, { id: messageId(), role: 'assistant', text }])
      setIsTyping(false)
    }, delay)
  }

  const jumpToStep = (stepIndex: number) => {
    setCurrentStep(stepIndex)
    const key = STEPS[stepIndex].id
    setInput(draft[key] || '')
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

    const value = result.value || ''
    const nextDraft = {
      ...draft,
      [activeStep.id]: value,
    }

    setDraft(nextDraft)
    pushUserMessage(activeStep.inputType === 'password' ? masked(value) : value)
    setInput('')

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
    pushAssistantMessage('Creating your workspace now...')

    try {
      const result = await tenantSignupService.startSignup({
        name: draft.name,
        udiseCode: draft.udiseCode,
        slug: draft.slug,
        adminEmail: draft.adminEmail,
        adminPassword: draft.adminPassword,
        confirmPassword: draft.confirmPassword,
      })

      sessionStorage.removeItem(CHAT_STORAGE_KEY)
      if (result.otpDeliveryStatus === 'sent') {
        pushAssistantMessage('Workspace ready. We sent a verification code to your admin email. Redirecting you now...')
      } else {
        pushAssistantMessage('Workspace ready, but OTP email delivery failed. Redirecting now so you can resend the code from the verification page.')
      }

      const redirectUrl = buildTenantAppRedirectUrl(result.tenantSlug, result.ticket)
      window.setTimeout(() => {
        window.location.assign(redirectUrl)
      }, 900)
    } catch (error: any) {
      const errorCode = error?.response?.data?.errorCode
      if (errorCode === 'slug_taken') {
        pushAssistantMessage('That school code is already taken. Please choose a different one.')
        setCurrentStep(1)
        setInput(draft.slug)
      } else if (errorCode === 'admin_email_taken') {
        pushAssistantMessage('That admin email is already used. Please provide a different email.')
        setCurrentStep(2)
        setInput(draft.adminEmail)
      } else if (errorCode === 'rate_limit_exceeded') {
        pushAssistantMessage('Too many attempts right now. Please wait and try again.')
      } else {
        pushAssistantMessage('Signup failed due to a temporary issue. Please retry in a moment.')
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
    return [base, `${base}-school`, `${base}-campus`].filter((value, index, array) => array.indexOf(value) === index)
  }, [draft.name])

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-10 md:px-8">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr,1.4fr] gap-8">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-cyan-900/30 to-slate-900/40 p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/40 px-3 py-1 text-xs text-cyan-200">
            <Sparkles className="w-4 h-4" />
            Guided AI-Style Signup
          </div>
          <h1 className="text-4xl mt-6 font-semibold leading-tight">{authCopy.onboardingTitle}</h1>
          <p className="text-slate-300 mt-4">
            {authCopy.onboardingDescription}
          </p>

          <div className="mt-8 space-y-4 text-sm">
            <div className="flex items-center gap-3 text-slate-200">
              <Building2 className="w-5 h-5 text-cyan-300" />
              Workspace provisioned in real time
            </div>
            <div className="flex items-center gap-3 text-slate-200">
              <UserRoundPlus className="w-5 h-5 text-cyan-300" />
              Admin account created with strong-password checks
            </div>
            <div className="flex items-center gap-3 text-slate-200">
              <CheckCircle2 className="w-5 h-5 text-cyan-300" />
              Single-use onboarding ticket with shared-module access
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-10">
            Already registered? <Link to="/" className="text-cyan-300 hover:text-cyan-200">Sign in to your workspace portal</Link>
          </p>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-cyan-400/20 border border-cyan-300/30">
              <Bot className="w-5 h-5 text-cyan-200" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Capabble Onboarding Assistant</h2>
              <p className="text-xs text-slate-400">Interactive workspace registration</p>
            </div>
          </div>

          <div className="h-[430px] overflow-y-auto space-y-3 pr-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] whitespace-pre-line px-4 py-3 rounded-2xl text-sm ${
                  message.role === 'assistant'
                    ? 'bg-slate-800/80 border border-slate-700/80 text-slate-100'
                    : 'ml-auto bg-cyan-500/20 border border-cyan-300/30 text-cyan-100'
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
            <form onSubmit={handleStepSubmit} className="mt-5">
              <label className="block text-xs text-slate-400 mb-2">
                {activeStep.id === 'name' ? 'Institution Name:' : activeStep.id === 'slug' ? 'Workspace Code:' : activeStep.prompt}
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

              {activeStep.id === 'slug' && suggestedSlugs.length > 0 && (
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
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleStartSignup}
                  disabled={isSubmitting}
                  className="rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold px-4 py-3 disabled:opacity-60"
                >
                  {isSubmitting ? 'Creating...' : 'Create Workspace'}
                </button>
                <button
                  type="button"
                  onClick={() => jumpToStep(1)}
                  className="rounded-xl border border-white/20 px-4 py-3 hover:bg-white/10"
                >
                  Edit Workspace Code
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

export default TenantSignupChat
