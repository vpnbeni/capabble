import React, { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, LayoutGrid, Lock, Mail, School } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSignupService from '@/services/tenantSignupService'
import AuthLayout from '@/components/auth/capabble/AuthLayout'
import { Button, Callout, Checkbox, StrengthMeter, TextField, type StrengthLevel } from '@/components/auth/capabble/controls'

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Mirrors publicTenantSignupStartSchema on the server: 8–128 characters with a
// lowercase letter, an uppercase letter, a digit and one of !@#$%^&*.
const meetsPasswordPolicy = (p: string) =>
  p.length >= 8 && p.length <= 128 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[!@#$%^&*]/.test(p)

function getPasswordStrength(password: string): StrengthLevel {
  if (!meetsPasswordPolicy(password)) return 1
  return password.length >= 12 ? 3 : 2
}

const PASSWORD_RULE = 'At least 8 characters, with upper and lower case letters, a number and one of ! @ # $ % ^ & *'

type Field = 'schoolCode' | 'affiliationNo' | 'name' | 'email' | 'password' | 'confirm'
type Errors = Partial<Record<Field, string>>
const FIELD_ORDER: Field[] = ['schoolCode', 'affiliationNo', 'name', 'email', 'password', 'confirm']

const GENERAL_ERROR = "We couldn't create the account. Check your connection and try again."

const Signup: React.FC = () => {
  const navigate = useNavigate()
  const [schoolCode, setSchoolCode] = useState('')
  const [affiliationNo, setAffiliationNo] = useState('')
  const [nameOfSchool, setNameOfSchool] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)

  const refs = {
    schoolCode: useRef<HTMLInputElement>(null),
    affiliationNo: useRef<HTMLInputElement>(null),
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  }

  const strength = useMemo(() => getPasswordStrength(password), [password])
  const slug = useMemo(() => toSlug(schoolCode.trim() || nameOfSchool.trim()), [schoolCode, nameOfSchool])

  const clearError = (field: Field) => {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const showErrors = (next: Errors) => {
    setErrors(next)
    const first = FIELD_ORDER.find((f) => next[f])
    // Focus after the error renders so it is announced with the field.
    if (first) requestAnimationFrame(() => refs[first].current?.focus())
  }

  const validate = (): Errors => {
    const next: Errors = {}
    if (!/^\d{5}$/.test(schoolCode)) next.schoolCode = 'Enter the 5-digit institution code'
    if (!/^\d{6}$/.test(affiliationNo)) next.affiliationNo = 'Enter the 6-digit affiliation no.'
    if (!nameOfSchool.trim() || !slug) next.name = 'Enter your institution name'
    if (!/^\S+@\S+\.\S+$/.test(adminEmail.trim())) next.email = 'Enter an email address like name@yourschool.in'
    if (strength < 2) next.password = `Use ${PASSWORD_RULE.charAt(0).toLowerCase()}${PASSWORD_RULE.slice(1)}`
    else if (confirmPassword !== password) next.confirm = "This doesn't match the password above"
    return next
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setGeneralError(null)

    const next = validate()
    if (Object.keys(next).length) {
      showErrors(next)
      return
    }
    setErrors({})

    const email = adminEmail.trim().toLowerCase()
    setSubmitting(true)
    try {
      const result = await tenantSignupService.startSignup({
        schoolCode: schoolCode.trim(),
        affiliationNo: affiliationNo.trim(),
        name: nameOfSchool.trim(),
        slug,
        adminEmail: email,
        adminPassword: password,
        confirmPassword,
      })
      localStorage.setItem('tenantSlug', result.tenantSlug)
      toast.success(`Check ${email} for a 6-digit code to confirm your account.`)
      navigate(`/signup/complete?ticket=${encodeURIComponent(result.ticket)}`)
    } catch (err: unknown) {
      const response =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number; data?: { message?: string; errorCode?: string } } }).response
          : undefined
      const code = response?.data?.errorCode
      if (code === 'slug_taken') {
        showErrors({ schoolCode: 'This institution code already has an account. Sign in instead.' })
      } else if (code === 'admin_email_taken') {
        showErrors({ email: 'This email address already has an account. Sign in instead.' })
      } else if (response?.status && response.status < 500 && response.data?.message) {
        setGeneralError(response.data.message)
      } else {
        setGeneralError(GENERAL_ERROR)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // No maxLength on the inputs: it would cut a pasted "12 345" before the spaces are stripped.
  const digitsOnly = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max)
  const passwordType = showPasswords ? 'text' : 'password'

  return (
    <AuthLayout
      headline={
        <>
          Set up your school <span className="cb-auth-accent">once.</span>
        </>
      }
      subline="One workspace account opens every module your school uses."
      steps={{
        title: 'Three steps to get started',
        items: [
          { icon: Building2, title: 'Add your institution', detail: 'Code, affiliation no. and name' },
          { icon: Mail, title: 'Confirm your email', detail: 'We email you a 6-digit code' },
          { icon: LayoutGrid, title: 'Open any module', detail: 'Exams, exam centre, fees and more' },
        ],
      }}
    >
      <h1 className="cb-auth-title">Create your workspace account</h1>
      <p className="cb-auth-subtitle">
        Set up your institution once and use the same Capabble account in every module your school has turned on.
      </p>

      <form className="cb-auth-form" noValidate onSubmit={handleSubmit}>
        <div className="cb-auth-section">
          <p className="cb-auth-section-label">Institution</p>
          <div className="cb-auth-pair">
            <TextField
              ref={refs.schoolCode}
              id="schoolCode"
              label="Institution code"
              hint="5 digits"
              error={errors.schoolCode}
              inputMode="numeric"
              autoComplete="off"
              value={schoolCode}
              onChange={(e) => {
                setSchoolCode(digitsOnly(e.target.value, 5))
                clearError('schoolCode')
              }}
            />
            <TextField
              ref={refs.affiliationNo}
              id="affiliationNo"
              label="Affiliation no."
              hint="6 digits"
              error={errors.affiliationNo}
              inputMode="numeric"
              autoComplete="off"
              value={affiliationNo}
              onChange={(e) => {
                setAffiliationNo(digitsOnly(e.target.value, 6))
                clearError('affiliationNo')
              }}
            />
          </div>
          <TextField
            ref={refs.name}
            id="nameOfSchool"
            label="Institution name"
            icon={School}
            placeholder="As it appears on your affiliation"
            error={errors.name}
            autoComplete="organization"
            value={nameOfSchool}
            onChange={(e) => {
              setNameOfSchool(e.target.value)
              clearError('name')
            }}
          />
        </div>

        <div className="cb-auth-section">
          <p className="cb-auth-section-label">Your sign-in</p>
          <TextField
            ref={refs.email}
            id="adminEmail"
            label="Email address"
            icon={Mail}
            type="email"
            placeholder="name@yourschool.in"
            hint="You'll sign in with this and we'll email a 6-digit code to it to confirm your account."
            error={errors.email}
            autoComplete="email"
            value={adminEmail}
            onChange={(e) => {
              setAdminEmail(e.target.value)
              clearError('email')
            }}
          />
          <div>
            <TextField
              ref={refs.password}
              id="password"
              label="Create password"
              icon={Lock}
              type={passwordType}
              hint={PASSWORD_RULE}
              error={errors.password}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                clearError('password')
              }}
            />
            {password ? (
              <div style={{ marginTop: 10 }}>
                <StrengthMeter level={strength} />
              </div>
            ) : null}
          </div>
          <TextField
            ref={refs.confirm}
            id="confirmPassword"
            label="Confirm password"
            icon={Lock}
            type={passwordType}
            error={errors.confirm}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value)
              clearError('confirm')
            }}
          />
          <div className="cb-auth-checks">
            <Checkbox label="Show passwords" checked={showPasswords} onChange={setShowPasswords} />
          </div>
        </div>

        {generalError ? <Callout>{generalError}</Callout> : null}

        <Button type="submit" iconRight={ArrowRight} loading={submitting} loadingLabel="Creating account">
          Create account
        </Button>
      </form>

      <p className="cb-auth-alt">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  )
}

export default Signup
