import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/context/AuthContext'
import { ScholLayout } from '@/layouts/ScholLayout'
import { SchoolDirectoryPage } from '@/pages/SchoolDirectoryPage'
import { SchoolProfilePage } from '@/pages/SchoolProfilePage'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<ScholLayout />}>
              <Route path="/" element={<Navigate to="/schools" replace />} />
              <Route path="/schools" element={<SchoolDirectoryPage />} />
              <Route path="/schools/:schoolId" element={<SchoolProfilePage />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  )
}
