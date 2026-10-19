import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAvailableSessions, useCreateSession, useCarryForward } from '../hooks/useSessions'
import { useAcademicSession } from '../contexts/AcademicSessionContext'
import { useOnboardingStatus } from '../hooks/useOnboarding'
import AuthLayout, { CardHeading } from '@/components/auth/capabble/AuthLayout'
import { Badge, Button, Callout, Checkbox } from '@/components/auth/capabble/controls'
import { RadioGroup } from '@/components/ui'

type ApiError = { response?: { status?: number; data?: { error?: string; message?: string } } }

const yearRange = (start: number, end: number) => `April ${start} to March ${end}`

const SessionSelector: React.FC = () => {
  const navigate = useNavigate()
  const { hasSession, setSession } = useAcademicSession()
  const { data, isLoading, error } = useAvailableSessions()
  const createSession = useCreateSession()
  const carryForward = useCarryForward()
  const { data: onboardingStatus } = useOnboardingStatus()

  const sessions = data?.data || []
  const currentLabel = data?.meta?.currentLabel || ''

  const [selectedLabel, setSelectedLabel] = useState('')
  const [copyData, setCopyData] = useState(false)
  const [sourceLabel, setSourceLabel] = useState('')
  const [entering, setEntering] = useState(false)
  const [enterError, setEnterError] = useState<string | null>(null)

  useEffect(() => {
    if (hasSession) navigate('/dashboard', { replace: true })
  }, [hasSession, navigate])

  // Start on the current academic year.
  useEffect(() => {
    if (!selectedLabel && sessions.length) {
      setSelectedLabel(sessions.find((s) => s.isCurrent)?.label || currentLabel || sessions[0].label)
    }
  }, [sessions, currentLabel, selectedLabel])

  // Years that already have data, to copy from.
  const sources = sessions.filter((s) => s.exists && s.label !== selectedLabel)
  const selected = sessions.find((s) => s.label === selectedLabel)

  useEffect(() => {
    if (!sources.some((s) => s.label === sourceLabel)) setSourceLabel(sources[0]?.label || '')
  }, [sources, sourceLabel])

  const handleEnter = async () => {
    if (!selectedLabel || entering) return
    setEnterError(null)
    setEntering(true)
    try {
      await createSession.mutateAsync(selectedLabel)
      if (copyData && sourceLabel) {
        await carryForward.mutateAsync({ targetLabel: selectedLabel, sourceLabel })
        toast.success(`Copied from ${sourceLabel}`)
      }
      setSession(selectedLabel)
      navigate(onboardingStatus && !onboardingStatus.isComplete ? '/onboarding' : '/dashboard', { replace: true })
    } catch (err) {
      const response = (err as ApiError)?.response
      // 402 already shows a toast that links to Billing.
      if (response?.status !== 402) {
        setEnterError(response?.data?.error || response?.data?.message || "We couldn't open that year. Try again in a moment.")
      }
    } finally {
      setEntering(false)
    }
  }

  return (
    <AuthLayout
      layout="signin"
      headline={
        <>
          Pick up where you <span className="cb-auth-accent">left off.</span>
        </>
      }
      subline="Your school’s records are kept by academic year, so each year stays tidy."
      card={
        <>
          <CardHeading icon={CalendarDays}>How academic years work</CardHeading>
          <ul>
            <li>Each year runs from April to March</li>
            <li>Copy teachers, rooms and subjects into a new year</li>
            <li>Switch years any time from the sidebar</li>
          </ul>
        </>
      }
    >
      <div className="cb-auth-head">
        <h1 className="cb-auth-title">Choose an academic year</h1>
        <p className="cb-auth-subtitle">
          {currentLabel ? (
            <>
              The current year is <strong>{currentLabel}</strong>. You can switch years later from the sidebar.
            </>
          ) : (
            'You can switch years later from the sidebar.'
          )}
        </p>
      </div>

      {isLoading ? (
        <p className="cb-auth-note" role="status">
          Loading academic years…
        </p>
      ) : error ? (
        <Callout>We couldn&apos;t load your academic years. Check your connection and refresh the page.</Callout>
      ) : (
        <form
          className="cb-auth-form"
          style={{ marginTop: 0 }}
          onSubmit={(e) => {
            e.preventDefault()
            void handleEnter()
          }}
        >
          {/* The kit's RadioGroup is styled under .cb-app; the auth page supplies its own background. */}
          <div className="cb-app" style={{ background: 'transparent' }}>
            <RadioGroup
              label="Academic year"
              variant="cards"
              value={selectedLabel}
              onChange={(value) => {
                setSelectedLabel(value)
                setCopyData(false)
                setEnterError(null)
              }}
              options={sessions.map((s) => ({
                value: s.label,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {s.label}
                    {s.isCurrent ? <Badge tone="info">Current</Badge> : null}
                    {s.exists ? <Badge>Has data</Badge> : null}
                  </span>
                ),
                description: yearRange(s.startYear, s.endYear),
              }))}
            />
          </div>

          {sources.length > 0 ? (
            <div className="cb-auth-section" style={{ gap: 12 }}>
              <Checkbox
                label="Copy data from another year"
                description="Teachers, rooms, subjects and centre details. Students and marks are not copied."
                checked={copyData}
                onChange={setCopyData}
              />
              {copyData ? (
                <div className="cb-app" style={{ background: 'transparent' }}>
                  <RadioGroup
                    label="Copy from"
                    orientation="horizontal"
                    value={sourceLabel}
                    onChange={setSourceLabel}
                    options={sources.map((s) => ({ value: s.label, label: s.label }))}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {enterError ? <Callout>{enterError}</Callout> : null}

          <Button
            type="submit"
            iconRight={ArrowRight}
            disabled={!selected}
            loading={entering}
            loadingLabel={copyData ? 'Copying and opening' : 'Opening'}
          >
            {selected ? `Open ${selected.label}` : 'Open year'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

export default SessionSelector
