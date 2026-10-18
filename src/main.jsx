
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initAccessibility } from '../src/features/accessibility/AccessibilitySettings.jsx'

import './index.css'
initAccessibility()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
