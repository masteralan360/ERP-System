import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

import { ThemeProvider } from '@/ui/components/theme-provider'
import './i18n/config'

// @ts-ignore
if (window.__TAURI_INTERNALS__) {
    // 1. Disable right-click context menu in Tauri
    document.addEventListener('contextmenu', (e) => e.preventDefault())

    // 2. Aggressive Version-Based Cache Cleanup
    const forceFreshStart = async () => {
        try {
            const { getVersion } = await import('@tauri-apps/api/app')
            const currentVersion = await getVersion()
            const lastVersion = localStorage.getItem('last_app_version')

            console.log(`[Tauri] Boot: ${currentVersion} (Last: ${lastVersion})`)

            if (currentVersion !== lastVersion) {
                console.warn('[Tauri] Version mismatch detected! Clearing stale assets...')

                // Unregister all service workers (PWA residues)
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations()
                    for (const registration of registrations) {
                        await registration.unregister()
                        console.log('[Tauri] Unregistered SW:', registration.scope)
                    }
                }

                // Clear named caches (Asset caches for UI)
                if ('caches' in window) {
                    const keys = await caches.keys()
                    for (const key of keys) {
                        await caches.delete(key)
                        console.log('[Tauri] Deleted cache:', key)
                    }
                }

                localStorage.setItem('last_app_version', currentVersion)

                // Force a hard reload to pick up new index.html/assets
                console.log('[Tauri] Hard reloading for fresh environment...')
                window.location.reload()
                return // Stop further execution for this initial load
            }
        } catch (error) {
            console.error('[Tauri] Version check/cleanup failed:', error)
        }
    }

    forceFreshStart()
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme" defaultStyle="modern">
            {/* To set Legacy as default, use: defaultStyle="legacy" */}
            <App />
        </ThemeProvider>
    </StrictMode>,
)
