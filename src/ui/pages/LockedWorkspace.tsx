import { useTranslation } from 'react-i18next'
import { Lock, Mail, LogOut } from 'lucide-react'
import { Button } from '@/ui/components/button'
import { useAuth } from '@/auth'
import { useLocation } from 'wouter'

export function LockedWorkspace() {
    const { t } = useTranslation()
    const { signOut } = useAuth()
    const [, setLocation] = useLocation()

    const handleContactAdmin = () => {
        // Open email client with admin contact
        window.location.href = 'mailto:admin@example.com?subject=Workspace Access Request'
    }

    const handleSignOut = async () => {
        await signOut()
        setLocation('/login')
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
            <div className="max-w-md w-full text-center space-y-8">
                {/* Lock Icon */}
                <div className="mx-auto w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center">
                    <Lock className="w-12 h-12 text-destructive" />
                </div>

                {/* Title */}
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-foreground">
                        {t('lockedWorkspace.title') || 'Workspace Locked'}
                    </h1>
                    <p className="text-muted-foreground text-lg">
                        {t('lockedWorkspace.message') || 'Your workspace has been temporarily locked. Please contact an administrator to regain access.'}
                    </p>
                </div>

                {/* Buttons Container */}
                <div className="flex flex-col gap-3 items-center">
                    <Button
                        size="lg"
                        onClick={handleContactAdmin}
                        className="gap-2 w-full max-w-[240px]"
                    >
                        <Mail className="w-5 h-5" />
                        {t('lockedWorkspace.contactAdmin') || 'Contact an Admin'}
                    </Button>

                    <Button
                        variant="outline"
                        size="lg"
                        onClick={handleSignOut}
                        className="gap-2 w-full max-w-[240px]"
                    >
                        <LogOut className="w-5 h-5" />
                        {t('common.signOut') || 'Sign Out'}
                    </Button>
                </div>

                {/* Additional Info */}
                <p className="text-xs text-muted-foreground opacity-70">
                    {t('lockedWorkspace.additionalInfo') || 'If you believe this is an error, please reach out to your workspace administrator.'}
                </p>
            </div>
        </div>
    )
}
