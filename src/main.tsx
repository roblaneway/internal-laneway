import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/auth/AuthProvider'
import './index.css'
import App from './App.tsx'

// A deploy renames the page bundles, so a tab opened before it can't load the next
// page. Reload once to pick up the new version instead of showing a blank screen.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('reloaded-for-deploy') ?? 0)
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem('reloaded-for-deploy', String(Date.now()))
  } catch {
    // Storage blocked: still reload; the browser fetches the new index.html.
  }
  event.preventDefault()
  window.location.reload()
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider>
            <App />
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
