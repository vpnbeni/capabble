import { Check, ChevronDown } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { classLabel } from '@/lib/format'
import { useTheme } from '@/theme/ThemeProvider'
import { radius, size, space } from '@/theme/tokens'
import { Avatar, Icon, ListRow, Sheet, Text } from '@/ui'

import { usePortal } from './PortalProvider'

/** Header control for parents with more than one child: shows who is selected, opens a sheet to switch. */
export function ChildSwitcher() {
  const { colors } = useTheme()
  const { home, child, setChildId, isParent } = usePortal()
  const [open, setOpen] = useState(false)
  if (!isParent || !home || home.students.length < 2 || !child) return null

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Showing ${child.name}. Change child`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, { borderColor: colors['border-control'] }, pressed && { backgroundColor: colors['surface-hover'] }]}
      >
        <Avatar name={child.name} src={child.profileImage} size={24} />
        <Text variant="label" numberOfLines={1} style={{ maxWidth: 96 }}>
          {child.name.split(' ')[0]}
        </Text>
        <Icon icon={ChevronDown} size={16} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title="Show details for">
        {home.students.map((entry, index) => (
          <ListRow
            key={entry.studentId}
            primary={entry.name}
            secondary={classLabel(entry.className, entry.section)}
            leading={<Avatar name={entry.name} src={entry.profileImage} />}
            trailing={entry.studentId === child.studentId ? <Icon icon={Check} size={20} color={colors['accent-strong']} /> : <View style={{ width: 20 }} />}
            divider={index < home.students.length - 1}
            onPress={() => {
              setChildId(entry.studentId)
              setOpen(false)
            }}
          />
        ))}
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['space-2'],
    minHeight: size['control-lg'] - 8,
    paddingHorizontal: space['space-2'],
    borderWidth: 1,
    borderRadius: radius['radius-full'],
  },
})
