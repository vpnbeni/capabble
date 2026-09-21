import React, { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getStoredUser } from '@/utils/authStorage'
import schoolProfileService, { type SchoolProfile } from '@/services/schoolProfileService'
import { schoolProfileKeys } from '@/hooks/useSchoolProfile'
import toast from 'react-hot-toast'

const AccountSettings: React.FC = () => {
  const queryClient = useQueryClient()
  const user = getStoredUser<{ email?: string }>()
  const [profile, setProfile] = useState<SchoolProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    schoolCode: '',
    affiliationNo: '',
    affiliationTill: '',
    tagline: '',
    address: '',
    contact: '',
    email: '',
  })

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      setLoading(true)
      try {
        const data = await schoolProfileService.getProfile()
        if (cancelled) return
        setProfile(data)
        setFormData({
          name: data.name || '',
          schoolCode: data.schoolCode || '',
          affiliationNo: data.affiliationNo || '',
          affiliationTill: data.affiliationTill || '',
          tagline: data.tagline || '',
          address: data.address || '',
          contact: data.contact || '',
          email: data.email || '',
        })
      } catch (error: any) {
        if (cancelled) return
        toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load school profile.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadProfile()
    return () => { cancelled = true }
  }, [])

  const logoPreview = useMemo(() => profile?.logoUrl || '', [profile?.logoUrl])

  const handleFieldChange = (
    field: 'name' | 'schoolCode' | 'affiliationNo' | 'affiliationTill' | 'tagline' | 'address' | 'contact' | 'email',
    value: string
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const updated = await schoolProfileService.updateProfile(formData)
      setProfile(updated)
      setFormData({
        name: updated.name || '',
        schoolCode: updated.schoolCode || '',
        affiliationNo: updated.affiliationNo || '',
        affiliationTill: updated.affiliationTill || '',
        tagline: updated.tagline || '',
        address: updated.address || '',
        contact: updated.contact || '',
        email: updated.email || '',
      })
      toast.success('School profile updated.')
      void queryClient.invalidateQueries({ queryKey: schoolProfileKeys.all })
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to update profile.'))
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingLogo(true)
    try {
      const updated = await schoolProfileService.uploadLogo(file)
      setProfile(updated)
      toast.success('School logo uploaded.')
      void queryClient.invalidateQueries({ queryKey: schoolProfileKeys.all })
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to upload logo.'))
    } finally {
      setUploadingLogo(false)
      event.target.value = ''
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 max-w-5xl">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-2">Account Settings</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Address, email, and contact number from this page print on the report card header.
        </p>

        {loading ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading school profile...</div>
        ) : (
          <div className="space-y-8">
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:p-5">
              <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-4">School Profile</h2>

              <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-32 w-32 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 overflow-hidden flex items-center justify-center">
                    {logoPreview ? (
                      <img src={logoPreview} alt="School logo" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-gray-500 dark:text-gray-400 px-3 text-center">No logo uploaded</span>
                    )}
                  </div>

                  <label className="inline-flex items-center justify-center px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">School Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleFieldChange('name', e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">School Code</label>
                    <input
                      type="text"
                      value={formData.schoolCode}
                      onChange={(e) => handleFieldChange('schoolCode', e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">CBSE Affiliation No</label>
                    <input
                      type="text"
                      value={formData.affiliationNo}
                      onChange={(e) => handleFieldChange('affiliationNo', e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Affiliation till</label>
                    <input
                      type="date"
                      value={formData.affiliationTill}
                      onChange={(e) => handleFieldChange('affiliationTill', e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                      CBSE affiliation validity end date. Used for renewal reminders.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tagline</label>
                    <input
                      type="text"
                      value={formData.tagline}
                      onChange={(e) => handleFieldChange('tagline', e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Address</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => handleFieldChange('address', e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Contact No</label>
                    <input
                      type="text"
                      value={formData.contact}
                      onChange={(e) => handleFieldChange('contact', e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleFieldChange('email', e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:p-5">
              <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-4">Account</h2>
              <div className="space-y-4 text-sm text-gray-700 dark:text-gray-200">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Email</span>
                  <span className="px-2 py-1 rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                    {user?.email || '--'}
                  </span>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default AccountSettings
