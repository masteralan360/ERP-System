import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X, Search, Sun, Moon, ArrowUpCircle } from 'lucide-react'
import { useWorkspace } from '@/workspace/WorkspaceContext'
import { useTheme } from '@/ui/components/theme-provider'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export function TitleBar() {
    const [isMaximized, setIsMaximized] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const { workspaceName, pendingUpdate } = useWorkspace()
    const { theme, setTheme } = useTheme()
    const { t } = useTranslation()
    // @ts-ignore
    const isTauri = !!window.__TAURI_INTERNALS__

    useEffect(() => {
        if (!isTauri) return
        document.documentElement.setAttribute('data-tauri', 'true')

        const updateState = async () => {
            try {
                const window = getCurrentWindow()
                const maximized = await window.isMaximized()
                const fullscreen = await window.isFullscreen()

                setIsMaximized(maximized)
                setIsFullscreen(fullscreen)

                if (fullscreen) {
                    document.documentElement.setAttribute('data-fullscreen', 'true')
                } else {
                    document.documentElement.removeAttribute('data-fullscreen')
                }
            } catch (e) {
                console.error(e)
            }
        }

        updateState()

        let unlisten: () => void

        const setupListener = async () => {
            try {
                const window = getCurrentWindow()
                unlisten = await window.onResized(updateState)
            } catch (e) {
                console.error(e)
            }
        }
        setupListener()

        return () => {
            if (unlisten) unlisten()
        }
    }, [isTauri])

    const minimize = async () => {
        if (!isTauri) return
        await getCurrentWindow().minimize()
    }

    // Toggle Maximize / Restore
    const toggleMaximize = async () => {
        if (!isTauri) return
        const window = getCurrentWindow()
        const maximized = await window.isMaximized()

        if (maximized) {
            await window.unmaximize()
            setIsMaximized(false)
        } else {
            await window.maximize()
            setIsMaximized(true)
        }
    }

    const close = async () => {
        if (!isTauri) return
        await getCurrentWindow().close()
    }

    if (!isTauri) return null

    return (
        <div data-tauri-drag-region className={cn(
            "fixed top-0 left-0 right-0 h-[48px] z-[100] flex items-center justify-between px-3 select-none bg-background/80 backdrop-blur-md border-b border-white/10 transition-all duration-300",
            isFullscreen && "opacity-0 pointer-events-none -translate-y-full"
        )}>
            {/* Left: Title / Logo */}
            <div data-tauri-drag-region className="flex items-center gap-3 w-1/3">
                <div className="w-8 h-8 rounded-md bg-primary/20 flex items-center justify-center pointer-events-none">
                    <img src="./logo.png" alt="Logo" className="w-5 h-5 opacity-80" onError={(e) => e.currentTarget.style.display = 'none'} />
                </div>
                <span data-tauri-drag-region className="text-sm font-medium opacity-80 truncate">
                    {workspaceName || 'ERP System'}
                </span>
            </div>

            {/* Center: Search Box */}
            <div data-tauri-drag-region className="flex-1 flex justify-center max-w-md">
                <div className="relative w-full max-w-[400px] group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <input
                        type="text"
                        className={cn(
                            "flex h-9 w-full rounded-md border border-input bg-secondary/50 px-3 py-1 text-sm shadow-sm transition-colors",
                            "file:border-0 file:bg-transparent file:text-sm file:font-medium",
                            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                            "pl-9 text-center focus:text-left focus:bg-background/80" // Starts centered-ish placeholder, moves left on focus? Or just standard left.
                        )}
                        placeholder="Search..."
                        spellCheck={false}
                    />
                </div>
            </div>

            {/* Right: Window Controls */}
            <div data-tauri-drag-region className="flex items-center justify-end gap-1 w-1/3">
                {pendingUpdate && (
                    <button
                        onClick={() => {
                            // Logic to trigger update dialog - we can just let App.tsx handle it 
                            // or better, we can expose the check function.
                            // For now, let's assume we want to re-run the check.
                            window.dispatchEvent(new CustomEvent('check-for-updates'))
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 mr-2 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 transition-all border border-blue-500/20 group"
                        title={t('updater.available')}
                    >
                        <ArrowUpCircle className="w-3.5 h-3.5 group-hover:animate-bounce" />
                        <span className="text-xs font-medium">{t('updater.available')}</span>
                    </button>
                )}
                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground mr-1"
                    title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                    {theme === 'dark' ? (
                        <Sun className="w-4 h-4" />
                    ) : (
                        <Moon className="w-4 h-4" />
                    )}
                </button>
                <button
                    onClick={minimize}
                    className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                    title="Minimize"
                >
                    <Minus className="w-4 h-4" />
                </button>
                <button
                    onClick={toggleMaximize}
                    className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                    title={isMaximized ? "Restore" : "Maximize"}
                >
                    <Square className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={close}
                    className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors text-muted-foreground"
                    title="Close"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
