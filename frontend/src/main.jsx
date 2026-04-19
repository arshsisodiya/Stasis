import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (typeof window !== "undefined" && window.__TAURI_INTERNALS__) {
  import("@tauri-apps/api/event")
    .then(({ listen }) => {
      listen("stasis-deep-link", (event) => {
        window.dispatchEvent(new CustomEvent("stasis:deep-link", {
          detail: { url: String(event.payload || "") },
        }));
      });
    })
    .catch(() => {
      // Non-Tauri/browser mode.
    });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
