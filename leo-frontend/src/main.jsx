import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'   // ✅ important
if (import.meta.env.PROD) {
  ["log","debug","warn"].forEach(k => (console[k] = () => {}));
}
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
