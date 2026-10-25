import { useRouter } from 'expo-router'

import { PasswordForm } from '@/components/PasswordForm'
import { useSession } from '@/session/SessionProvider'
import { useTheme, type AppearancePreference } from '@/theme/ThemeProvider'
import { ListGroup, MobileScreen, NavBar, OptionList, Section, Surface, useToast } from '@/ui'

/** The signed-in parent's or student's own login: details, appearance and password. */
export default function AccountScreen() {
  const router = useRouter()
  const session = useSession()
  const toast = useToast()
  const { appearance, setAppearance } = useTheme()
  if (session.status !== 'signedIn') return null
  const { user, school } = session

  return (
    <MobileScreen nav={<NavBar title="Your login" back={{ label: 'More', onPress: router.back }} />}>
      <ListGroup
        header="Account"
        items={[
          { title: 'Name', value: user.displayName || user.name || '—' },
          { title: 'Signs in with', value: (user.username ? `${user.username}@${school.slug}` : user.email) || '—' },
        ]}
      />
      <OptionList<AppearancePreference>
        header="Appearance"
        footer="Only on this phone."
        label="Appearance"
        value={appearance}
        onChange={setAppearance}
        options={[
          { value: 'system', label: 'Same as phone' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <Section title="Change password">
        <Surface>
          <PasswordForm
            currentLabel="Current password"
            submitLabel="Change password"
            onSaved={(updated) => {
              session.updateUser(updated)
              toast('Password changed. Other devices have been signed out.')
            }}
          />
        </Surface>
      </Section>
    </MobileScreen>
  )
}
