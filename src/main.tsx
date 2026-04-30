import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { setUnauthorizedHandler } from './lib/api'
import { useAuthStore } from './store/authStore'

setUnauthorizedHandler(() => {
  useAuthStore.setState({ user: null, accessToken: null });
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
