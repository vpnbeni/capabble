import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@capabble/design/tokens.css'
import '@capabble/design/components.css'
import '@capabble/design/app.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
