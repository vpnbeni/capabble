import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { store, persistor } from './redux/store'
import { setStoreDispatch } from './services/api'
import { AcademicSessionProvider } from './contexts/AcademicSessionContext'
import { initTheme } from './utils/theme'
import { initPwaManifest } from './pwa'
import UpdatePrompt from './components/common/UpdatePrompt'
import './styles/globals.css'
import './styles/capabble/tokens.css'
import './styles/capabble/components.css'
import './styles/capabble/app.css'
import './styles/capabble/shell.css'

// Set up store dispatch for API interceptors
setStoreDispatch(store.dispatch)
initTheme()
initPwaManifest()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false, // avoid refetch storm when clicking back into the tab
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <UpdatePrompt />
        <PersistGate loading={null} persistor={persistor}>
          <AcademicSessionProvider>
            <App />
          </AcademicSessionProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#22c55e',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
            loading: {
              iconTheme: {
                primary: '#3b82f6',
                secondary: '#fff',
              },
            },
          }}
        />
        </PersistGate>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>,
)
