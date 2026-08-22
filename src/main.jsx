import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { observability } from './observability'
import { SentryErrorReporter } from './observability/providers/SentryErrorReporter'

observability.configure({ errorReporter: new SentryErrorReporter() })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
