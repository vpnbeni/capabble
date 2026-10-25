import React, { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Image as ImageIcon, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { getStoredUser } from '@/utils/authStorage'
import schoolProfileService, { type SchoolProfile } from '@/services/schoolProfileService'
import { schoolProfileKeys } from '@/hooks/useSchoolProfile'
import { Button, Card, ColorField, DetailList, Icon, Page, TextField } from '@/components/ui'
import CloseWorkspaceCard from '@/components/account/CloseWorkspaceCard'
import { usePermissions } from '@/hooks/usePermissions'
import { applySchoolTheme } from '@/utils/schoolTheme'

type FormData = {
  name: string
  udiseCode: string
  schoolCode: string
  affiliationNo: string
  affiliationTill: string
  tagline: string
  address: string
  contact: string
  email: string
  brandColor: string
}
type Errors = Partial<Record<keyof FormData, string>>

const toForm = (data: Partial<SchoolProfile>): FormData => ({
  name: data.name || '',
  udiseCode: data.udiseCode || '',
  schoolCode: data.schoolCode || '',
  affiliationNo: data.affiliationNo || '',
  affiliationTill: data.affiliationTill || '',
  tagline: data.tagline || '',
  address: data.address || '',
  contact: data.contact || '',
  email: data.email || '',
  brandColor: data.brandColor || '',
})

const apiMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string } } })?.response?.data
  return data?.message || fallback
}

const validate = (form: FormData): Errors => {
  const errors: Errors = {}
  if (!form.name.trim()) errors.name = 'Enter your school’s name'
  if (form.udiseCode && !/^\d{11}$/.test(form.udiseCode)) errors.udiseCode = 'UDISE+ code must be 11 digits'
  if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    errors.email = 'Enter an email address like office@yourschool.in'
  }
  if (form.brandColor.trim() && !/^#[0-9a-f]{6}$/i.test(form.brandColor.trim())) {
    errors.brandColor = 'Use a colour like #2458AA, or leave it empty'
  }
  return errors
}

const AccountSettings: React.FC = () => {
  const queryClient = useQueryClient()
  const { isAdmin, isPortal } = usePermissions()
  const user = getStoredUser<{ email?: string; name?: string }>()
  const fileInput = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<SchoolProfile | null>(null)
  const [form, setForm] = useState<FormData>(toForm({}))
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  useEffect(() => {
    let cancelled = false
    schoolProfileService
      .getProfile()
      .then((data) => {
        if (cancelled) return
        setProfile(data)
        setForm(toForm(data))
      })
      .catch((error) => {
        if (!cancelled) setLoadError(apiMessage(error, 'We couldn’t load your school profile. Refresh the page to try again.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const set = (field: keyof FormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = field === 'udiseCode' ? event.target.value.replace(/\D/g, '').slice(0, 11) : event.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    const next = validate(form)
    setErrors(next)
    const first = Object.keys(next)[0]
    if (first) {
      document.getElementById(`school-${first}`)?.focus()
      return
    }
    setSaving(true)
    try {
      const updated = await schoolProfileService.updateProfile(form)
      setProfile(updated)
      setForm(toForm(updated))
      // Re-brand now; other signed-in devices pick it up at their next sign-in or reload.
      applySchoolTheme(updated.brandColor)
      toast.success('School profile saved')
      void queryClient.invalidateQueries({ queryKey: schoolProfileKeys.all })
    } catch (error) {
      toast.error(apiMessage(error, 'We couldn’t save the profile. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  const handleLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploadingLogo(true)
    try {
      const updated = await schoolProfileService.uploadLogo(file)
      setProfile(updated)
      toast.success('Logo updated')
      void queryClient.invalidateQueries({ queryKey: schoolProfileKeys.all })
    } catch (error) {
      toast.error(apiMessage(error, 'We couldn’t upload the logo. Use a PNG, JPG or WebP image under 10 MB.'))
    } finally {
      setUploadingLogo(false)
    }
  }

  const field = (key: keyof FormData) => ({
    id: `school-${key}`,
    value: form[key],
    onChange: set(key),
    error: errors[key],
  })

  return (
    <Page>
      <div className="cb-stack">
        {loading || loadError ? (
          <Card title="School profile">
            <div className="cb-table-state" role="status">
              {loading ? (
                <>
                  <span className="cb-spinner" aria-hidden="true" />
                  Loading school profile…
                </>
              ) : (
                loadError
              )}
            </div>
          </Card>
        ) : (
          <form onSubmit={handleSave} noValidate>
            <Card
              title="School profile"
              subtitle="Printed on report cards, admit cards and fee receipts."
              footer={
                <div className="cb-card-actions">
                  <Button type="submit" variant="primary" loading={saving}>
                    Save profile
                  </Button>
                </div>
              }
            >
              <div className="cb-stack">
                <div className="cb-form-section">
                <div className="cb-logo-field">
                  <div className="cb-logo-preview">
                    {profile?.logoUrl ? (
                      <img src={profile.logoUrl} alt={`${form.name || 'School'} logo`} />
                    ) : (
                      <>
                        <Icon icon={ImageIcon} size={24} />
                        No logo
                      </>
                    )}
                  </div>
                  <div className="cb-logo-field__body">
                    <span className="cb-strong">School logo</span>
                    <span className="cb-muted">Shown in the sidebar and on everything you print.</span>
                    <span className="cb-subtle">PNG, JPG or WebP, up to 10 MB. A square image works best.</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={Upload}
                      loading={uploadingLogo}
                      onClick={() => fileInput.current?.click()}
                    >
                      {profile?.logoUrl ? 'Change logo' : 'Upload logo'}
                    </Button>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="cb-visually-hidden"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={handleLogo}
                  />
                </div>
                </div>

                <div className="cb-form-section">
                  <span className="cb-form-section__title">School</span>
                  <div className="cb-form-grid">
                    <TextField label="School name" required autoComplete="organization" className="is-wide" {...field('name')} />
                    <TextField
                      label="UDISE+ code"
                      hint="11 digits, as on UDISE+"
                      inputMode="numeric"
                      autoComplete="off"
                      {...field('udiseCode')}
                    />
                    <TextField label="Tagline" hint="Optional. Shown under the name on documents." {...field('tagline')} />
                    <ColorField
                      id="school-brandColor"
                      label="School colour"
                      hint="Buttons, links and selected items use it, on the website and in the app. Leave empty for Capabble blue."
                      value={form.brandColor}
                      onChange={(value) => {
                        setForm((current) => ({ ...current, brandColor: value }))
                        if (errors.brandColor) setErrors((current) => ({ ...current, brandColor: undefined }))
                      }}
                      error={errors.brandColor}
                    />
                  </div>
                </div>

                <div className="cb-form-section">
                  <span className="cb-form-section__title">CBSE affiliation</span>
                  <span className="cb-muted">Only for CBSE schools. Leave blank if it doesn’t apply.</span>
                  <div className="cb-form-grid cb-form-grid--3">
                    <TextField label="School code" autoComplete="off" {...field('schoolCode')} />
                    <TextField label="Affiliation no." autoComplete="off" {...field('affiliationNo')} />
                    <TextField
                      label="Affiliation valid till"
                      type="date"
                      hint="Used for renewal reminders"
                      {...field('affiliationTill')}
                    />
                  </div>
                </div>

                <div className="cb-form-section">
                  <span className="cb-form-section__title">Contact</span>
                  <div className="cb-form-grid">
                    <TextField label="Address" autoComplete="street-address" className="is-wide" {...field('address')} />
                    <TextField label="Phone" type="tel" autoComplete="tel" {...field('contact')} />
                    <TextField label="Email" type="email" autoComplete="email" {...field('email')} />
                  </div>
                </div>
              </div>
            </Card>
          </form>
        )}

        <Card title="Your sign-in" subtitle="The email address you sign in with.">
          <DetailList columns={2} items={[{ label: 'Email', value: user?.email || '—' }]} />
        </Card>

        {isAdmin && !isPortal ? <CloseWorkspaceCard /> : null}
      </div>
    </Page>
  )
}

export default AccountSettings
