import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { observability } from './observability'
import { LogRocketErrorReporter } from './observability/providers/LogRocketErrorReporter'

observability.configure({ errorReporter: new LogRocketErrorReporter() })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
