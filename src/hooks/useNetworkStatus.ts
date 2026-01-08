import { useState, useEffect } from 'react'
import { toast } from '@/ui/components/use-toast'

export function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const [wasOffline, setWasOffline] = useState(false)

    useEffect(() => {
        function handleOnline() {
            setIsOnline(true)
            if (wasOffline) {
                toast({
                    title: "Back online",
                    description: "You are connected to the internet. You can now sync your changes.",
                    variant: "default",
                })
                setWasOffline(false)
            }
        }

        function handleOffline() {
            setIsOnline(false)
            setWasOffline(true)
            toast({
                title: "You are offline",
                description: "Changes will be saved locally and can be synced when you're back online.",
                variant: "destructive",
            })
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [wasOffline])

    return isOnline
}
