import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
if ('serviceWorker' in navigator && import.meta.env.PROD) { window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(console.error)); }
