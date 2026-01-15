import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Button
} from '@/ui/components'
import { AlertCircle } from 'lucide-react'

interface ReturnDeclineModalProps {
    isOpen: boolean
    onClose: () => void
    products: string[]
}

export function ReturnDeclineModal({ isOpen, onClose, products }: ReturnDeclineModalProps) {
    const { t } = useTranslation()

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-xl border-destructive/30 shadow-2xl shadow-destructive/10 dark:shadow-destructive/20 dark:bg-zinc-950/90 backdrop-blur-xl animate-in fade-in zoom-in duration-300">
                <DialogHeader className="space-y-3">
                    <DialogTitle className="flex items-center gap-3 text-2xl font-black text-destructive dark:drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]">
                        <AlertCircle className="w-8 h-8" />
                        {t('sales.return.declineTitle') || 'Return Not Possible'}
                    </DialogTitle>
                </DialogHeader>
                <div className="py-8 space-y-6">
                    <p className="text-lg text-foreground font-semibold leading-relaxed">
                        {t('sales.return.declineMessage') || 'The following products in this sale are marked as non-returnable:'}
                    </p>
                    <div className="bg-destructive/5 dark:bg-destructive/10 border-2 border-destructive/20 dark:border-destructive/30 rounded-2xl p-6 space-y-3">
                        {products.map((name, index) => (
                            <div key={index} className="flex items-center gap-3 text-base text-destructive font-bold font-mono">
                                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                                {name}
                            </div>
                        ))}
                    </div>
                    <p className="text-sm text-muted-foreground italic bg-muted/30 p-4 rounded-lg border border-border/50">
                        {t('sales.return.declineNote') || 'Please contact an administrator if you believe this is an error.'}
                    </p>
                </div>
                <DialogFooter>
                    <Button
                        variant="destructive"
                        onClick={onClose}
                        className="w-full sm:w-auto h-12 px-8 text-lg font-bold shadow-lg shadow-destructive/20 hover:shadow-destructive/40 transition-all duration-300"
                    >
                        {t('common.done') || 'Done'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

