import { useRouter, type Href } from 'expo-router'
import { CreditCard, KeyRound, Mail, School, ShieldCheck } from 'lucide-react-native'

import { useMailSettings, usePaymentSettings } from '@/staff/schoolSetupQueries'
import { useStaff } from '@/staff/useStaff'
import { ListGroup, MobileScreen, NavBar, type ListGroupItem } from '@/ui'

/**
 * School setup (the website's Settings): the school's details and colour, who can sign in and what
 * each role may do, the school's email account and online fee payments. The logo is an image and
 * waits for the app's photo picker.
 */
export default function SchoolSetupScreen() {
  const router = useRouter()
  const staff = useStaff()
  const canSchool = staff.can('core.school.write')
  const canPayments = staff.canUse('cpitl_fees') && staff.can('cpitl.finance.settings')
  const mail = useMailSettings(canSchool)
  const payments = usePaymentSettings(canPayments)

  const go = (path: Href) => () => router.push(path)
  const items: ListGroupItem[] = [
    ...(canSchool
      ? [{ title: 'School details', subtitle: 'Name, address, contact and colour', icon: School, tile: 4 as const, lines: 2 as const, chevron: true, onPress: go('/school-profile') }]
      : []),
    ...(staff.can('core.users.manage') ? [{ title: 'Users', subtitle: 'Who can sign in', icon: KeyRound, tile: 4 as const, lines: 2 as const, chevron: true, onPress: go('/users') }] : []),
    ...(staff.can('core.users.read')
      ? [{ title: 'Roles', subtitle: 'What each role may do', icon: ShieldCheck, tile: 1 as const, lines: 2 as const, chevron: true, onPress: go('/school-setup/roles') }]
      : []),
    ...(canSchool
      ? [
          {
            title: 'School email',
            subtitle: mail.data ? (mail.data.enabled ? `Sending from ${mail.data.fromEmail}` : 'Off') : 'The school’s own mail account',
            icon: Mail,
            tile: 2 as const,
            lines: 2 as const,
            chevron: true,
            onPress: go('/school-setup/email'),
          },
        ]
      : []),
    ...(canPayments
      ? [
          {
            title: 'Online payments',
            subtitle: payments.data
              ? payments.data.enabled && payments.data.connected
                ? `On · ${payments.data.mode === 'live' ? 'live' : 'test'} keys`
                : 'Off'
              : 'Fees paid in the app through Razorpay',
            icon: CreditCard,
            tile: 3 as const,
            lines: 2 as const,
            chevron: true,
            onPress: go('/school-setup/payments'),
          },
        ]
      : []),
  ]

  return (
    <MobileScreen
      refreshing={mail.isRefetching || payments.isRefetching}
      onRefresh={() => (mail.refetch(), payments.refetch())}
      nav={<NavBar title="School setup" back={{ label: 'Back', onPress: router.back }} />}
    >
      <ListGroup items={items} />
    </MobileScreen>
  )
}
