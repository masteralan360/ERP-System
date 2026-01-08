import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/ui/components/dialog'
import { Button } from '@/ui/components/button'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
// import { useWorkspace } from '@/workspace'
import { fullSync } from '@/sync/syncEngine'
import { useToast } from '@/ui/components/use-toast'
import { usePendingSyncCount } from '@/local-db/hooks'

interface ManualSyncModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSyncComplete?: () => void
}

export function ManualSyncModal({ open, onOpenChange, onSyncComplete }: ManualSyncModalProps) {
    const { user } = useAuth()
    // const { workspace } = useWorkspace() // Not needed, user has workspaceId
    const { toast } = useToast()
    const pendingCount = usePendingSyncCount()

    const [isSyncing, setIsSyncing] = useState(false)
    const [status, setStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    async function handleSync() {
        if (!user || !user.workspaceId) return

        setIsSyncing(true)
        setStatus('syncing')
        setErrorMessage(null)

        try {
            // Trigger full sync (Process Queue + Pull Changes)
            const result = await fullSync(user.id, user.workspaceId, null) // TODO: track lastSyncTime properly if needed

            if (result.success) {
                setStatus('success')
                toast({
                    title: 'Sync Complete',
                    description: `Pushed ${result.pushed} changes. Pulled ${result.pulled} updates.`,
                    variant: 'default'
                })
                if (onSyncComplete) onSyncComplete()

                // Close after a brief delay
                setTimeout(() => {
                    onOpenChange(false)
                    setStatus('idle')
                }, 1500)
            } else {
                setStatus('error')
                setErrorMessage(result.errors.join(', '))
                toast({
                    title: 'Sync Failed',
                    description: 'There were errors during synchronization.',
                    variant: 'destructive'
                })
            }
        } catch (error: any) {
            setStatus('error')
            setErrorMessage(error.message || 'Unknown error occurred')
            toast({
                title: 'Sync Error',
                description: error.message,
                variant: 'destructive'
            })
        } finally {
            setIsSyncing(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={isSyncing ? undefined : onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Synchronize Data</DialogTitle>
                    <DialogDescription>
                        {status === 'idle' && `You have ${pendingCount} pending changes to upload.`}
                        {status === 'syncing' && 'Synchronizing with Supabase...'}
                        {status === 'success' && 'Sync completed successfully!'}
                        {status === 'error' && 'Sync failed.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center py-6 space-y-4">
                    {status === 'idle' && (
                        <div className="text-center space-y-2">
                            <p className="text-sm text-muted-foreground">
                                Make sure you have a stable internet connection.
                            </p>
                        </div>
                    )}

                    {status === 'syncing' && (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Processing...</p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="flex flex-col items-center gap-2">
                            <CheckCircle2 className="h-8 w-8 text-green-500" />
                            <p className="text-sm font-medium text-green-600">All data synced!</p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="flex flex-col items-center gap-2">
                            <AlertTriangle className="h-8 w-8 text-destructive" />
                            <p className="text-sm font-medium text-destructive">Sync failed</p>
                            {errorMessage && (
                                <p className="text-xs text-muted-foreground text-center max-w-[80%]">
                                    {errorMessage}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="sm:justify-between">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isSyncing}
                    >
                        {status === 'success' ? 'Close' : 'Cancel'}
                    </Button>
                    {status !== 'success' && (
                        <Button
                            onClick={handleSync}
                            disabled={isSyncing || !navigator.onLine}
                        >
                            {isSyncing ? 'Syncing...' : 'Sync Now'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
