import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Button,
    Label,
    Textarea
} from '@/ui/components'

interface ReturnConfirmationModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (reason: string, quantity?: number) => void
    title: string
    message: string
    isItemReturn?: boolean
    maxQuantity?: number
    itemName?: string
}

export function ReturnConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    isItemReturn = false,
    maxQuantity = 1,
    itemName = ''
}: ReturnConfirmationModalProps) {
    const { t } = useTranslation()
    const [step, setStep] = useState<'confirmation' | 'quantity' | 'reason'>('confirmation')
    const [selectedReason, setSelectedReason] = useState<string>('customer_returned')
    const [otherReason, setOtherReason] = useState('')
    const [returnQuantity, setReturnQuantity] = useState<number>(1)

    const returnReasons = [
        { value: 'customer_returned', label: t('sales.return.reasons.customerReturned') || 'Customer returned item' },
        { value: 'wrong_item', label: t('sales.return.reasons.wrongItem') || 'Wrong item sold' },
        { value: 'pricing_mistake', label: t('sales.return.reasons.pricingMistake') || 'Pricing mistake' },
        { value: 'damaged_product', label: t('sales.return.reasons.damagedProduct') || 'Damaged product' },
        { value: 'duplicate_sale', label: t('sales.return.reasons.duplicateSale') || 'Duplicate sale' },
        { value: 'other', label: t('sales.return.reasons.other') || 'Other' }
    ]

    const handleContinue = () => {
        if (isItemReturn) {
            setStep('quantity')
        } else {
            setStep('reason')
        }
    }

    const handleQuantityContinue = () => {
        setStep('reason')
    }

    const handleReturnConfirm = () => {
        const finalReason = selectedReason === 'other' ? otherReason :
            returnReasons.find(r => r.value === selectedReason)?.label || selectedReason
        onConfirm(finalReason, isItemReturn ? returnQuantity : undefined)
        handleClose()
    }

    const handleClose = () => {
        setStep('confirmation')
        setSelectedReason('customer_returned')
        setOtherReason('')
        setReturnQuantity(1)
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>

                {step === 'confirmation' && (
                    <div className="space-y-4">
                        <p className="text-muted-foreground">{message}</p>
                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>
                                {t('common.cancel') || 'Cancel'}
                            </Button>
                            <Button onClick={handleContinue}>
                                {t('common.continue') || 'Continue'}
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === 'quantity' && (
                    <div className="space-y-4">
                        <div>
                            <Label className="text-sm font-medium">
                                {t('sales.return.selectQuantity', { item: itemName }) || `How many "${itemName}" would you like to return?`}
                            </Label>
                            <div className="mt-3">
                                <input
                                    type="number"
                                    min="1"
                                    max={maxQuantity}
                                    value={returnQuantity}
                                    onChange={(e) => setReturnQuantity(Math.min(Math.max(1, parseInt(e.target.value) || 1), maxQuantity))}
                                    className="w-full h-10 px-3 py-2 border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    {t('sales.return.maxQuantity', { max: maxQuantity }) || `Maximum quantity: ${maxQuantity}`}
                                </p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setStep('confirmation')}>
                                {t('common.back') || 'Back'}
                            </Button>
                            <Button onClick={handleQuantityContinue}>
                                {t('common.continue') || 'Continue'}
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === 'reason' && (
                    <div className="space-y-4">
                        <div>
                            <Label className="text-sm font-medium">
                                {t('sales.return.selectReason') || 'Please select a reason for this return:'}
                            </Label>
                            <div className="mt-3 space-y-2">
                                {returnReasons.map((reason) => (
                                    <div key={reason.value} className="flex items-center space-x-2">
                                        <input
                                            type="radio"
                                            id={reason.value}
                                            name="returnReason"
                                            value={reason.value}
                                            checked={selectedReason === reason.value}
                                            onChange={(e) => setSelectedReason(e.target.value)}
                                            className="h-4 w-4 rounded border border-primary text-primary focus:ring-primary"
                                        />
                                        <Label htmlFor={reason.value} className="text-sm cursor-pointer">
                                            {reason.label}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {selectedReason === 'other' && (
                            <div>
                                <Label htmlFor="other-reason" className="text-sm font-medium">
                                    {t('sales.return.specifyReason') || 'Please specify the reason:'}
                                </Label>
                                <Textarea
                                    id="other-reason"
                                    value={otherReason}
                                    onChange={(e) => setOtherReason(e.target.value)}
                                    placeholder={t('sales.return.reasonPlaceholder') || 'Enter reason...'}
                                    className="mt-1"
                                    rows={3}
                                    maxLength={50}
                                />
                            </div>
                        )}

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setStep('confirmation')}>
                                {t('common.back') || 'Back'}
                            </Button>
                            <Button
                                onClick={handleReturnConfirm}
                                disabled={selectedReason === 'other' && !otherReason.trim()}
                            >
                                {t('sales.return.confirmReturn') || 'Confirm Return'}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
