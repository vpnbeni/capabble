import type { ContactItem, ProfileHeader } from '@/types/profile'
import { MapPin, Phone, Mail, Globe, User } from 'lucide-react'

function findContact(contacts: ContactItem[], type: string) {
  return contacts.find((c) => c.type === type)?.value
}

export function ContactSidebar({
  header,
  contacts,
}: {
  header: ProfileHeader
  contacts: ContactItem[]
}) {
  const phone = findContact(contacts, 'phone')
  const email = findContact(contacts, 'email')
  const website = findContact(contacts, 'website')
  const head = findContact(contacts, 'head_name')

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-slate-900">Contact Information</h3>
        <dl className="mt-3 space-y-3 text-sm">
          <div className="flex gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-slate-500">Address</dt>
              <dd className="font-medium text-slate-800">{header.location}</dd>
            </div>
          </div>
          <div className="flex gap-2">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-medium text-slate-800">{phone || 'Not available'}</dd>
            </div>
          </div>
          <div className="flex gap-2">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-800">{email || 'Not available'}</dd>
            </div>
          </div>
          <div className="flex gap-2">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-slate-500">Website</dt>
              <dd className="font-medium text-slate-800">{website || 'Not available'}</dd>
            </div>
          </div>
          <div className="flex gap-2">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-slate-500">Head / Responsible Person</dt>
              <dd className="font-medium text-slate-800">{head || 'Not available'}</dd>
            </div>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-slate-900">Location</h3>
        <div className="mt-3 flex h-40 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
          Map placeholder — coordinates not available
        </div>
        <p className="mt-2 text-sm text-slate-600">{header.location}</p>
      </div>
    </div>
  )
}
