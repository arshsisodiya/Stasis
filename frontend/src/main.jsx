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

// Global fetch override to inject Auth token
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  let [resource, config] = args;
  
  const token = localStorage.getItem('stasis_auth_token');
  if (token) {
    if (!config) config = {};
    if (!config.headers) config.headers = {};
    
    // Handle both Headers object and plain object
    if (config.headers instanceof Headers) {
      if (!config.headers.has('Authorization')) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }
    } else {
      if (!config.headers['Authorization'] && !config.headers.Authorization) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }
  
  return originalFetch(resource, config);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
