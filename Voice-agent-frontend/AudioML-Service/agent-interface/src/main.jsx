import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './firebase.js'
import './index.css'
import App from './App.jsx'
import { AgentProvider } from './context/AgentContext.jsx'
import { MessageBannerProvider } from './context/MessageBannerContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>

    <MessageBannerProvider>

      <AgentProvider>

        <BrowserRouter>
          <App />
        </BrowserRouter>

      </AgentProvider>

    </MessageBannerProvider>

  </StrictMode>,
)
