
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initAccessibility } from './features/accessibility/accessibility'
import './index.css'
initAccessibility()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
