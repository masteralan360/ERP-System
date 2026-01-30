import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

import { ThemeProvider } from '@/ui/components/theme-provider'
import './i18n/config'
import { platformService } from '@/services/platformService'

// Initialize platform service (cache paths etc)
// Initialize platform service and then render
const init = async () => {
    try {
        await platformService.initialize();
    } catch (e) {
        console.error('Failed to initialize platform service:', e);
    }

    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme" defaultStyle="primary">
                {/* To set Legacy as default, use: defaultStyle="legacy" */}
                <App />
            </ThemeProvider>
        </StrictMode>,
    )
}

init();
