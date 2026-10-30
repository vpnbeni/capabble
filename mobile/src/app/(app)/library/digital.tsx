import { useRouter } from 'expo-router'
import { Globe, Plus } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, View } from 'react-native'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { DigitalResource } from '@/services/libraryService'
import { useAddDigital, useDigitalResources } from '@/staff/libraryQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, BottomSheet, Callout, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, OptionList, SegmentedControl, StatusView, Surface, Text, haptic, useToast } from '@/ui'

const KINDS: { value: DigitalResource['resourceType']; label: string }[] = [
  { value: 'ebook', label: 'E-book' },
  { value: 'pdf', label: 'PDF' },
  { value: 'audiobook', label: 'Audiobook' },
  { value: 'video', label: 'Video' },
  { value: 'link', label: 'Website' },
]
const AUDIENCE: Record<DigitalResource['audience'], string> = { all: 'Everyone', students: 'Students', staff: 'Staff' }

/**
 * The digital library (the website's Library → Digital): e-books, PDFs and other links the school
 * subscribes to. Opening one goes to its page; the library adds links (secure https ones only).
 */
export default function DigitalLibraryScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canManage = staff.can('libry.digital.manage')
  const resources = useDigitalResources()
  const add = useAddDigital()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', url: '', authors: '' })
  const [kind, setKind] = useState<DigitalResource['resourceType']>('ebook')
  const [audience, setAudience] = useState<DigitalResource['audience']>('all')
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const url = form.url.trim()
    if (!form.title.trim()) return setError('Enter the title.')
    if (!/^https:\/\/\S+\.\S+/i.test(url)) return setError('Paste the full link, starting with https://')
    try {
      await add.mutateAsync({ title: form.title.trim(), url, authors: form.authors.trim() || undefined, resourceType: kind, audience })
      haptic.success()
      setAdding(false)
      setForm({ title: '', url: '', authors: '' })
      toast('Added to the digital library')
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It wasn't added. Try again.")
    }
  }

  const list = resources.data ?? []

  return (
    <MobileScreen
      refreshing={resources.isRefetching}
      onRefresh={resources.refetch}
      nav={<NavBar title="Digital library" back={{ label: 'Library', onPress: router.back }} />}
      actionBar={canManage ? <ActionBar icon={Plus} summary={`${list.length} ${list.length === 1 ? 'link' : 'links'}`} detail="E-books, PDFs, audio and video" label="Add a link" onPress={() => (setError(null), setAdding(true))} /> : undefined}
      overlay={
        <BottomSheet
          open={adding}
          onClose={() => setAdding(false)}
          title="Add a link"
          detent="large"
          footer={
            <MobileButton fullWidth loading={add.isPending} onPress={save}>
              Add link
            </MobileButton>
          }
        >
          {error ? (
            <Callout tone="danger" title="Not added">
              {error}
            </Callout>
          ) : null}
          <View style={{ gap: space['space-4'] }}>
            <MobileTextField label="Title" value={form.title} onChangeText={(title) => setForm({ ...form, title })} maxLength={500} returnKeyType="next" />
            <MobileTextField label="Link" placeholder="https://" value={form.url} onChangeText={(url) => setForm({ ...form, url })} autoCapitalize="none" keyboardType="url" maxLength={1000} returnKeyType="next" />
            <MobileTextField label="Authors (optional)" value={form.authors} onChangeText={(authors) => setForm({ ...form, authors })} maxLength={300} />
            <Text variant="m-subhead" tone="muted">
              Who can see it
            </Text>
            <SegmentedControl label="Who can see it" value={audience} onChange={setAudience} options={(Object.keys(AUDIENCE) as DigitalResource['audience'][]).map((value) => ({ value, label: AUDIENCE[value] }))} />
          </View>
          <OptionList header="Kind" label="Kind" value={kind} onChange={setKind} options={KINDS} />
        </BottomSheet>
      }
    >
      {resources.isPending ? (
        <CardSkeleton rows={4} />
      ) : resources.isError ? (
        <LoadFailed what="The digital library" error={resources.error} onRetry={resources.refetch} />
      ) : list.length ? (
        <ListGroup
          footer="Opens in the browser."
          items={list.map((row) => ({
            title: row.title,
            subtitle: [KINDS.find((option) => option.value === row.resourceType)?.label, row.authors?.join(', '), AUDIENCE[row.audience]].filter(Boolean).join(' · '),
            lines: 2 as const,
            icon: Globe,
            tile: 1 as const,
            chevron: true,
            onPress: () => Linking.openURL(row.url),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Globe} title="No digital books yet" body="E-books, PDFs and other links the library adds show here." />
        </Surface>
      )}
    </MobileScreen>
  )
}
