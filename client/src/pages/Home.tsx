import React, { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { Navigate } from 'react-router-dom'
import { Page } from '@/components/ui'
import { selectUser } from '@/redux/slices/authSlice'
import { usePermissions } from '@/hooks/usePermissions'
import { isBusCrewOnly } from '@/utils/deskTitle'
import { useLocalIndex } from '@/components/commandPalette/useLocalIndex'
import { resolveTenantSlug } from '@/utils/tenantRuntime'
import {
  ALL_WIDGETS,
  homeLayoutKey,
  saveHomeLayout,
  useHomeLayout,
  type HomeLayout,
} from '@/components/home/homeLayout'
import { WIDGETS } from '@/components/home/HomeWidgets'
import { HomeCustomize, type CustomizeTab } from '@/components/home/HomeCustomize'
import { QUICK_ACTIONS } from '@/components/home/quickActions'
import { PrincipalDesk } from '@/components/home/PrincipalDesk'
import '@/components/home/home.css'

const Home: React.FC = () => {
  const user = useSelector(selectUser)
  const { pages, pageByPath } = useLocalIndex()
  const storageKey = homeLayoutKey(resolveTenantSlug(), user?._id)
  const layout = useHomeLayout(storageKey)
  const [customize, setCustomize] = useState<null | CustomizeTab>(null)

  // Widgets the school can use: those without a data page, or whose page is open to it.
  const availableWidgets = useMemo(
    () => ALL_WIDGETS.filter((id) => !WIDGETS[id].requiresPath || pageByPath.has(WIDGETS[id].requiresPath!)),
    [pageByPath]
  )
  const { can } = usePermissions()
  const availableActions = useMemo(
    () => QUICK_ACTIONS.filter((action) => pageByPath.has(action.path) && can(action.permission)),
    [pageByPath, can]
  )
  const shownActions = layout.actions
    .map((id) => availableActions.find((action) => action.id === id))
    .filter((action): action is NonNullable<typeof action> => Boolean(action))

  useEffect(() => {
    const openCustomize = () => setCustomize('actions')
    window.addEventListener('capabble:customize-home', openCustomize)
    return () => window.removeEventListener('capabble:customize-home', openCustomize)
  }, [])

  const handleSave = (next: HomeLayout) => {
    saveHomeLayout(storageKey, next)
    setCustomize(null)
  }

  if (isBusCrewOnly(user)) return <Navigate to="/trnst/crew" replace />

  return (
    <Page className="home-page">
      <PrincipalDesk actions={shownActions} onEditActions={() => setCustomize('actions')} />

      <HomeCustomize
        open={customize !== null}
        initialTab={customize || 'widgets'}
        layout={layout}
        availableWidgets={availableWidgets}
        availableActions={availableActions}
        pages={pages}
        onClose={() => setCustomize(null)}
        onSave={handleSave}
      />
    </Page>
  )
}

export default Home
