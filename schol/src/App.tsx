import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/context/AuthContext'
import { ScholLayout } from '@/layouts/ScholLayout'
import { SchoolDirectoryPage } from '@/pages/SchoolDirectoryPage'
import { SchoolProfilePage } from '@/pages/SchoolProfilePage'
import { SetupPage } from '@/pages/SetupPage'
import { CollectionNewPage } from '@/pages/CollectionNewPage'
import { CollectionRunPage } from '@/pages/CollectionRunPage'
import { CollectionRunsPage } from '@/pages/CollectionRunsPage'
import { IdentityReviewPage } from '@/pages/IdentityReviewPage'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<ScholLayout />}>
              <Route path="/" element={<Navigate to="/schools" replace />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/schools" element={<SchoolDirectoryPage />} />
              <Route path="/schools/:schoolId" element={<SchoolProfilePage />} />
              <Route path="/collection/new" element={<CollectionNewPage />} />
              <Route path="/collection/runs/:runId" element={<CollectionRunPage />} />
              <Route path="/admin/collection-runs" element={<CollectionRunsPage />} />
              <Route path="/admin/identity-review" element={<IdentityReviewPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  )
}
