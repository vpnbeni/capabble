import React from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ChevronRight,
  GraduationCap,
  Mail,
  MessageCircle,
  Phone,
  Ticket,
} from 'lucide-react'
import { SUPPORT_CONTACT } from '@/constants/helpCentreCatalog'

type HelpContactPanelProps = {
  onReportIssue: () => void
}

const contactItems = [
  {
    id: 'report',
    icon: Ticket,
    iconBg: 'bg-violet-100 text-violet-600',
    title: 'Report an Issue',
    subtitle: 'Raise a support ticket',
    action: 'report' as const,
  },
  {
    id: 'chat',
    icon: MessageCircle,
    iconBg: 'bg-sky-100 text-sky-600',
    title: 'Live Chat',
    subtitle: SUPPORT_CONTACT.chatHours,
    href: `mailto:${SUPPORT_CONTACT.email}?subject=Capabble%20Live%20Chat%20Request`,
  },
  {
    id: 'call',
    icon: Phone,
    iconBg: 'bg-emerald-100 text-emerald-600',
    title: 'Call Support',
    subtitle: SUPPORT_CONTACT.phone,
    href: `tel:${SUPPORT_CONTACT.phone.replace(/\s/g, '')}`,
  },
  {
    id: 'email',
    icon: Mail,
    iconBg: 'bg-amber-100 text-amber-600',
    title: 'Email Support',
    subtitle: SUPPORT_CONTACT.email,
    href: `mailto:${SUPPORT_CONTACT.email}`,
  },
]

const HelpContactPanel: React.FC<HelpContactPanelProps> = ({ onReportIssue }) => {
  return (
    <div className="help-sidebar-card rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-slate-900">Need Immediate Help?</h2>
      <div className="mt-3 space-y-1">
        {contactItems.map((item) => {
          const Icon = item.icon
          const inner = (
            <>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.iconBg}`}>
                <Icon className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{item.title}</p>
                <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </>
          )

          if (item.action === 'report') {
            return (
              <button
                key={item.id}
                type="button"
                onClick={onReportIssue}
                className="help-contact-row flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left"
              >
                {inner}
              </button>
            )
          }

          return (
            <a
              key={item.id}
              href={item.href}
              className="help-contact-row flex items-center gap-3 rounded-xl px-2 py-2.5"
            >
              {inner}
            </a>
          )
        })}
      </div>
    </div>
  )
}

export const HelpSystemStatus: React.FC<{ status?: string; message?: string; updatedAt?: string }> = ({
  status = 'operational',
  message = 'All systems operational',
  updatedAt,
}) => {
  const isOperational = status === 'operational'
  const isDown = status === 'down'

  return (
    <div className="help-sidebar-card rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isOperational ? 'bg-emerald-100 text-emerald-600' : isDown ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
          }`}
        >
          <Activity className={`h-5 w-5 ${isOperational ? 'help-status-pulse' : ''}`} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">System Status</p>
          <p
            className={`mt-0.5 text-xs font-medium ${
              isOperational ? 'text-emerald-600' : isDown ? 'text-red-600' : 'text-amber-600'
            }`}
          >
            {message}
          </p>
          {updatedAt ? <p className="mt-1 text-[10px] text-slate-400">Updated {updatedAt}</p> : null}
        </div>
      </div>
    </div>
  )
}

export const HelpGettingStarted: React.FC = () => {
  return (
    <div className="help-getting-started rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 ring-1 ring-violet-100">
          <GraduationCap className="h-6 w-6 text-violet-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Getting Started Guide</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            New to Capabble? Set up your school profile, activate modules, and configure your academic session.
          </p>
          <Link
            to="/account-settings"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700"
          >
            Open Account Settings
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default HelpContactPanel
