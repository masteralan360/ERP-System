import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth'
import { supabase } from '@/auth/supabase'
import { Sale } from '@/types'
import { formatCurrency, formatDateTime, formatSnapshotTime, cn } from '@/lib/utils'
import { useWorkspace } from '@/workspace'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    SaleReceipt,
    ReturnConfirmationModal,
    ReturnDeclineModal,
    ReturnRulesDisplayModal,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/ui/components'
import { SaleItem } from '@/types'
import {
    Receipt,
    Eye,
    Loader2,
    Trash2,
    Printer,
    RotateCcw,
    XCircle,
    Calendar,
    Filter
} from 'lucide-react'

export function Sales() {
    const { user } = useAuth()
    const { t } = useTranslation()
    const { features } = useWorkspace()
    const [sales, setSales] = useState<Sale[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
    const [printingSale, setPrintingSale] = useState<Sale | null>(null)
    const [returnModalOpen, setReturnModalOpen] = useState(false)
    const [saleToReturn, setSaleToReturn] = useState<Sale | null>(null)
    const [dateRange, setDateRange] = useState<'today' | 'month' | 'custom'>('month')
    const [customDates, setCustomDates] = useState({ start: '', end: '' })
    const [selectedCashier, setSelectedCashier] = useState<string>('all')
    const [availableCashiers, setAvailableCashiers] = useState<Array<{ id: string; name: string }>>([])
    const [rulesQueue, setRulesQueue] = useState<Array<{ productName: string; rules: string }>>([])
    const [currentRuleIndex, setCurrentRuleIndex] = useState(-1)
    const [showDeclineModal, setShowDeclineModal] = useState(false)
    const [nonReturnableProducts, setNonReturnableProducts] = useState<string[]>([])
    const printRef = useRef<HTMLDivElement>(null)

    const handlePrint = () => {
        if (!printRef.current) return

        const content = printRef.current.innerHTML
        const iframe = document.createElement('iframe')

        iframe.style.position = 'absolute'
        iframe.style.width = '0px'
        iframe.style.height = '0px'
        iframe.style.border = 'none'

        document.body.appendChild(iframe)

        const doc = iframe.contentWindow?.document
        if (doc) {
            // Gather all styles from the main document (Tailwind, local styles, etc.)
            const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
                .map(node => node.outerHTML)
                .join("")

            doc.open()
            doc.write(`
                <html dir="${document.dir}">
                    <head>
                        <title>Print Receipt</title>
                        ${styles}
                        <style>
                            @media print {
                                @page { size: 80mm auto; margin: 0; }
                                body { margin: 0; padding: 10px; }
                                html, body { height: auto; overflow: visible; }
                            }
                            body { 
                                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; 
                                background: white;
                            }
                        </style>
                    </head>
                    <body>
                        ${content}
                    </body>
                </html>
            `)
            doc.close()

            // Wait for resources (styles/images) to load
            const print = () => {
                iframe.contentWindow?.focus()
                iframe.contentWindow?.print()
                setPrintingSale(null)
                // Cleanup
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe)
                    }
                }, 1000)
            }

            if (iframe.contentWindow) {
                // Try onload
                iframe.contentWindow.onload = print
                // Fallback timeout in case onload doesn't fire
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        print()
                    }
                }, 1500)
            }
        }
    }

    const onPrintClick = (sale: Sale) => {
        setPrintingSale(sale)
    }

    useEffect(() => {
        if (printingSale) {
            // Small timeout to ensure DOM is ready and styles are applied
            setTimeout(() => {
                if (printRef.current) {
                    handlePrint()
                }
            }, 100)
        }
    }, [printingSale])

    const handleDeleteSale = async (id: string) => {
        if (!confirm(t('common.messages.deleteConfirm') || 'Are you sure you want to delete this sale? Inventory will be restored.')) return

        try {
            const { error } = await supabase.rpc('delete_sale', { p_sale_id: id })
            if (error) throw error

            setSales(sales.filter(s => s.id !== id))
            if (selectedSale?.id === id) setSelectedSale(null)
        } catch (err: any) {
            console.error('Error deleting sale:', err)
            alert('Failed to delete sale: ' + (err.message || 'Unknown error'))
        }
    }

    const initiateReturn = (sale: Sale, isWholeSale: boolean) => {
        const itemsToCheck = sale.items || []
        const nonReturnable = itemsToCheck
            .filter(item => item.product && item.product.can_be_returned === false)
            .map(item => item.product?.name || item.product_name || 'Unknown Product')

        if (nonReturnable.length > 0) {
            setNonReturnableProducts(nonReturnable)
            setShowDeclineModal(true)
            return
        }

        const rules = itemsToCheck
            .filter(item => item.product && item.product.return_rules)
            .map(item => ({
                productName: item.product?.name || item.product_name || 'Product',
                rules: item.product?.return_rules || ''
            }))

        if (rules.length > 0) {
            setSaleToReturn({ ...sale, _isWholeSaleReturn: isWholeSale } as any)
            setRulesQueue(rules)
            setCurrentRuleIndex(0)
        } else {
            setSaleToReturn({ ...sale, _isWholeSaleReturn: isWholeSale } as any)
            setReturnModalOpen(true)
        }
    }

    const handleNextRule = () => {
        if (currentRuleIndex < rulesQueue.length - 1) {
            setCurrentRuleIndex(currentRuleIndex + 1)
        } else {
            // All rules reviewed, proceed to confirmation
            setCurrentRuleIndex(-1)
            setRulesQueue([])
            setReturnModalOpen(true)
        }
    }

    const handleCancelRules = () => {
        setCurrentRuleIndex(-1)
        setRulesQueue([])
        setSaleToReturn(null)
    }

    const handleBackRule = () => {
        if (currentRuleIndex > 0) {
            setCurrentRuleIndex(currentRuleIndex - 1)
        }
    }

    const handleReturnSale = (sale: Sale) => {
        initiateReturn(sale, true)
    }

    const handleReturnItem = (item: SaleItem) => {
        // For individual item returns, we need to create a mock sale object
        // with just this item for the return modal
        const mockSale: Sale & { _isWholeSaleReturn?: boolean } = {
            ...selectedSale!,
            items: [item],
            _isWholeSaleReturn: false
        }
        initiateReturn(mockSale, false)
    }

    const handleReturnConfirm = async (reason: string, quantity?: number) => {
        if (!saleToReturn) return

        try {
            let error

            // Check if this is an individual item return (only 1 item in mock sale and not flagged as whole sale)
            const isIndividualItemReturn = saleToReturn?.items?.length === 1 && !(saleToReturn as any)._isWholeSaleReturn

            if (isIndividualItemReturn) {
                // Individual item return
                const item = saleToReturn.items?.[0]
                if (!item) return
                const returnQty = quantity || 1
                const { error: itemError } = await supabase.rpc('return_sale_items', {
                    p_sale_item_ids: [item.id],
                    p_return_quantities: [returnQty],
                    p_return_reason: reason
                })
                error = itemError

                // Update local state for the specific item
                if (selectedSale?.id === saleToReturn.id) {
                    setSelectedSale({
                        ...selectedSale,
                        total_amount: selectedSale.total_amount - (returnQty * (item.converted_unit_price || item.unit_price)),
                        items: selectedSale.items?.map(i =>
                            i.id === item.id
                                ? {
                                    ...i,
                                    quantity: i.quantity - returnQty,
                                    total_price: i.total_price - (returnQty * (i.total_price / i.quantity)),
                                    returned_quantity: (i.returned_quantity || 0) + returnQty,
                                    ...(returnQty === i.quantity ? {
                                        is_returned: true,
                                        return_reason: reason,
                                        returned_at: new Date().toISOString()
                                    } : {
                                        return_reason: reason,
                                        returned_at: new Date().toISOString()
                                    })
                                }
                                : i
                        )
                    })
                }

                // Update sales list
                setSales(sales.map(s =>
                    s.id === saleToReturn.id
                        ? {
                            ...s,
                            total_amount: s.total_amount - (returnQty * (item.converted_unit_price || item.unit_price)),
                            items: s.items?.map(i =>
                                i.id === item.id
                                    ? {
                                        ...i,
                                        quantity: i.quantity - returnQty,
                                        total_price: i.total_price - (returnQty * (i.total_price / i.quantity)),
                                        returned_quantity: (i.returned_quantity || 0) + returnQty,
                                        ...(returnQty === i.quantity ? {
                                            is_returned: true,
                                            return_reason: reason,
                                            returned_at: new Date().toISOString()
                                        } : {
                                            return_reason: reason,
                                            returned_at: new Date().toISOString()
                                        })
                                    }
                                    : i
                            )
                        }
                        : s
                ))
            } else {
                // Whole sale return
                const { error: saleError } = await supabase.rpc('return_whole_sale', {
                    p_sale_id: saleToReturn.id,
                    p_return_reason: reason
                })
                error = saleError

                // Update local state
                setSales(sales.map(s =>
                    s.id === saleToReturn.id
                        ? { ...s, is_returned: true, return_reason: reason, returned_at: new Date().toISOString() }
                        : s
                ))

                if (selectedSale?.id === saleToReturn.id) {
                    setSelectedSale({
                        ...selectedSale,
                        is_returned: true,
                        return_reason: reason,
                        returned_at: new Date().toISOString(),
                        items: selectedSale.items?.map(i => ({
                            ...i,
                            is_returned: true,
                            return_reason: 'Whole sale returned: ' + reason,
                            returned_at: new Date().toISOString()
                        }))
                    })
                }
            }

            if (error) throw error

            // Close modal and refresh
            setReturnModalOpen(false)
            setSaleToReturn(null)
            await fetchSales()
        } catch (err: any) {
            console.error('Error returning sale:', err)
            alert('Failed to return sale: ' + (err.message || 'Unknown error'))
        }
    }

    const fetchCashiers = async () => {
        try {
            const { data, error } = await supabase
                .from('sales')
                .select('cashier_id')
                .not('cashier_id', 'is', null)

            if (error) throw error

            const uniqueCashierIds = [...new Set(data?.map(s => s.cashier_id))]

            if (uniqueCashierIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, name')
                    .in('id', uniqueCashierIds)

                if (profiles) {
                    setAvailableCashiers(profiles)
                }
            }
        } catch (err) {
            console.error('Error fetching cashiers:', err)
        }
    }

    const fetchSales = async () => {
        setIsLoading(true)
        try {
            // Build query with date range filtering
            let query = supabase
                .from('sales')
                .select(`
                    *,
                    items:sale_items(
                        *,
                        product:product_id(name, sku, can_be_returned, return_rules)
                    )
                `)

            // Apply date range filters
            const now = new Date()
            if (dateRange === 'today') {
                const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString()
                query = query.gte('created_at', startOfDay)
            } else if (dateRange === 'month') {
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
                query = query.gte('created_at', startOfMonth)
            } else if (dateRange === 'custom' && customDates.start && customDates.end) {
                const start = new Date(customDates.start)
                start.setHours(0, 0, 0, 0)
                const end = new Date(customDates.end)
                end.setHours(23, 59, 59, 999)
                query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString())
            }

            // Apply cashier filter
            if (selectedCashier !== 'all') {
                query = query.eq('cashier_id', selectedCashier)
            }

            const { data, error } = await query.order('created_at', { ascending: false })

            if (error) throw error

            // Fetch profiles for cashiers
            const cashierIds = Array.from(new Set(data.map((s: any) => s.cashier_id).filter(Boolean)))
            let profilesMap: Record<string, string> = {}

            if (cashierIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, name')
                    .in('id', cashierIds)

                if (profiles) {
                    profilesMap = profiles.reduce((acc: any, curr: any) => ({
                        ...acc,
                        [curr.id]: curr.name
                    }), {})
                }
            }

            const formattedSales = data.map((sale: any) => ({
                ...sale,
                cashier_name: profilesMap[sale.cashier_id] || 'Staff',
                items: sale.items?.map((item: any) => ({
                    ...item,
                    product_name: item.product?.name || 'Unknown Product',
                    product_sku: item.product?.sku || ''
                }))
            }))

            setSales(formattedSales)
        } catch (err) {
            console.error('Error fetching sales:', err)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        if (user?.workspaceId) {
            fetchSales()
            fetchCashiers()
        }
    }, [user?.workspaceId, dateRange, customDates, selectedCashier])

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Receipt className="w-6 h-6 text-primary" />
                        {t('sales.title') || 'Sales History'}
                        {isLoading && (
                            <Loader2 className="w-4 h-4 animate-spin text-primary/50 ml-1" />
                        )}
                    </h1>
                    <p className="text-muted-foreground">
                        {t('sales.subtitle') || 'View past transactions'}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="bg-secondary/50 p-1 rounded-lg flex items-center gap-1 shadow-sm border border-border/50">
                        <Button
                            variant={dateRange === 'today' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setDateRange('today')}
                            className={cn("text-xs h-8 px-4 transition-all duration-200", dateRange === 'today' && "shadow-sm")}
                        >
                            {t('performance.filters.today')}
                        </Button>
                        <Button
                            variant={dateRange === 'month' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setDateRange('month')}
                            className={cn("text-xs h-8 px-4 transition-all duration-200", dateRange === 'month' && "shadow-sm")}
                        >
                            {t('performance.filters.thisMonth')}
                        </Button>
                        <Button
                            variant={dateRange === 'custom' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setDateRange('custom')}
                            className={cn("text-xs h-8 px-4 gap-1.5 transition-all duration-200", dateRange === 'custom' && "shadow-sm")}
                        >
                            <Calendar className="w-3.5 h-3.5" />
                            {t('performance.filters.custom')}
                        </Button>
                    </div>

                    {availableCashiers.length > 0 && (
                        <div className="flex items-center gap-2 bg-secondary/30 p-1 px-3 rounded-lg border border-border/50">
                            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-[10px] uppercase font-bold text-muted-foreground whitespace-nowrap">
                                {t('sales.filters.cashier') || 'Cashier'}:
                            </span>
                            <Select value={selectedCashier} onValueChange={setSelectedCashier}>
                                <SelectTrigger className="h-8 text-xs w-40 bg-background/50 border-none focus-visible:ring-1 focus-visible:ring-primary/50 transition-all">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        {t('sales.filters.allCashiers') || 'All Cashiers'}
                                    </SelectItem>
                                    {availableCashiers.map((cashier) => (
                                        <SelectItem key={cashier.id} value={cashier.id}>
                                            {cashier.name || 'Unknown'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 bg-secondary/30 p-1 px-3 rounded-lg border border-border/50 animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground whitespace-nowrap">{t('performance.filters.start')}</span>
                                <Input
                                    type="date"
                                    value={customDates.start}
                                    onChange={(e) => setCustomDates(prev => ({ ...prev, start: e.target.value }))}
                                    className="h-8 text-xs w-36 bg-background/50 border-none focus-visible:ring-1 focus-visible:ring-primary/50 transition-all font-mono"
                                />
                            </div>
                            <div className="w-px h-4 bg-border/50 mx-1" />
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground whitespace-nowrap">{t('performance.filters.end')}</span>
                                <Input
                                    type="date"
                                    value={customDates.end}
                                    onChange={(e) => setCustomDates(prev => ({ ...prev, end: e.target.value }))}
                                    className="h-8 text-xs w-36 bg-background/50 border-none focus-visible:ring-1 focus-visible:ring-primary/50 transition-all font-mono"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('sales.listTitle') || 'Recent Sales'}</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : sales.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            {t('common.noData')}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-start">{t('sales.date') || 'Date'}</TableHead>
                                    <TableHead className="text-start">{t('sales.cashier') || 'Cashier'}</TableHead>
                                    <TableHead className="text-start">{t('sales.origin') || 'Origin'}</TableHead>
                                    <TableHead className="text-end">{t('sales.total') || 'Total'}</TableHead>
                                    <TableHead className="text-end">{t('common.actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sales.map((sale) => {
                                    const returnedItemsCount = sale.items?.filter(item => item.is_returned).length || 0
                                    const partialReturnedItemsCount = sale.items?.filter(item => (item.returned_quantity || 0) > 0 && !item.is_returned).length || 0
                                    const totalReturnedQuantity = sale.items?.reduce((sum, item) => {
                                        if (item.is_returned) return sum + (item.quantity || 0)
                                        if ((item.returned_quantity || 0) > 0) return sum + (item.returned_quantity || 0)
                                        return sum
                                    }, 0) || 0
                                    const hasReturnedItems = returnedItemsCount > 0
                                    const hasPartialReturns = partialReturnedItemsCount > 0

                                    return (
                                        <TableRow
                                            key={sale.id}
                                            className={sale.is_returned ? 'bg-destructive/10 border-destructive/20' : hasPartialReturns ? 'bg-orange-500/10 border-orange-500/20 dark:bg-orange-500/5 dark:border-orange-500/10' : ''}
                                        >
                                            <TableCell className="text-start font-mono text-sm">
                                                <div className="flex items-center gap-2">
                                                    {formatDateTime(sale.created_at)}
                                                    {sale.is_returned && (
                                                        <span className="px-2 py-1 text-xs font-medium bg-destructive/20 text-destructive dark:bg-destructive/30 dark:text-destructive-foreground rounded-full">
                                                            RETURNED
                                                        </span>
                                                    )}
                                                    {hasPartialReturns && (
                                                        <span className="px-2 py-1 text-xs font-medium bg-orange-500/20 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 rounded-full">
                                                            -{totalReturnedQuantity} returned
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-start">
                                                {sale.cashier_name}
                                            </TableCell>
                                            <TableCell className="text-start">
                                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground uppercase">
                                                    {sale.origin}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-end font-bold">
                                                {formatCurrency(sale.total_amount, sale.settlement_currency || 'usd', features.iqd_display_preference)}
                                            </TableCell>
                                            <TableCell className="text-end">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setSelectedSale(sale)}
                                                    title={t('sales.details') || "View Details"}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onPrintClick(sale)}
                                                    title={t('common.print') || "Print Receipt"}
                                                >
                                                    <Printer className="w-4 h-4" />
                                                </Button>
                                                {!sale.is_returned && (user?.role === 'admin' || user?.role === 'staff') && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleReturnSale(sale)}
                                                        title={t('sales.return') || "Return Sale"}
                                                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </Button>
                                                )}
                                                {user?.role === 'admin' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleDeleteSale(sale.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                                {hasReturnedItems && !sale.is_returned && (
                                                    <div className="inline-flex items-center justify-center w-8 h-8 text-xs font-bold text-white bg-destructive rounded-full">
                                                        {returnedItemsCount}
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Sale Details Modal */}
            <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('sales.details') || 'Sale Details'}</DialogTitle>
                    </DialogHeader>
                    {selectedSale && (
                        <div className="space-y-4">
                            {selectedSale.is_returned && (
                                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                                    <div className="flex items-center gap-2 text-destructive dark:text-destructive-foreground">
                                        <XCircle className="w-5 h-5" />
                                        <span className="font-medium">{t('sales.return.returnedMessage') || 'This sale has been returned'}</span>
                                    </div>
                                    {selectedSale.return_reason && (
                                        <p className="text-sm text-destructive/80 dark:text-destructive-foreground/80 mt-1">
                                            Reason: {selectedSale.return_reason}
                                        </p>
                                    )}
                                    {selectedSale.returned_at && (
                                        <p className="text-xs text-destructive/60 dark:text-destructive-foreground/60 mt-1">
                                            Returned at: {formatDateTime(selectedSale.returned_at)}
                                        </p>
                                    )}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground">{t('sales.date')}:</span>
                                    <div className="font-medium">{formatDateTime(selectedSale.created_at)}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">{t('sales.cashier')}:</span>
                                    <div className="font-medium">{selectedSale.cashier_name}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">{t('sales.id')}:</span>
                                    <div className="font-mono text-xs text-muted-foreground">{selectedSale.id}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">{t('pos.paymentMethod') || 'Payment Method'}:</span>
                                    <div className="font-medium flex items-center gap-2">
                                        {selectedSale.payment_method === 'fib' && (
                                            <>
                                                <img src="./icons/FIB24x24.jpg" alt="FIB" className="w-5 h-5 rounded" />
                                                FIB
                                            </>
                                        )}
                                        {selectedSale.payment_method === 'qicard' && (
                                            <>
                                                <img src="./icons/QIcard24x24.png" alt="QiCard" className="w-5 h-5 rounded" />
                                                QiCard
                                            </>
                                        )}
                                        {selectedSale.payment_method === 'zaincash' && (
                                            <>
                                                <img src="./icons/zain24x24.png" alt="ZainCash" className="w-5 h-5 rounded" />
                                                ZainCash
                                            </>
                                        )}
                                        {selectedSale.payment_method === 'fastpay' && (
                                            <>
                                                <img src="./icons/fastpay24x24.jpg" alt="FastPay" className="w-5 h-5 rounded" />
                                                FastPay
                                            </>
                                        )}
                                        {(!selectedSale.payment_method || selectedSale.payment_method === 'cash') && (
                                            <span>{t('pos.cash') || 'Cash'}</span>
                                        )}
                                    </div>
                                </div>
                                {selectedSale.exchange_rates && selectedSale.exchange_rates.length > 0 ? (
                                    <div className="col-span-2 space-y-2">
                                        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
                                            {t('settings.exchangeRate.title')} {t('common.snapshots')}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {selectedSale.exchange_rates.map((rate: any, idx: number) => (
                                                <div key={idx} className="p-2 bg-muted/30 rounded border border-border/50 flex flex-col gap-0.5">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] font-bold text-primary/70">{rate.pair}</span>
                                                        <span className="text-[9px] text-muted-foreground italic uppercase">{rate.source}</span>
                                                    </div>
                                                    <div className="text-sm font-bold">
                                                        100 {rate.pair.split('/')[0]} = {formatCurrency(rate.rate, rate.pair.split('/')[1].toLowerCase() as any, features.iqd_display_preference)}
                                                    </div>
                                                    <div className="text-[9px] text-muted-foreground opacity-70">
                                                        {formatSnapshotTime(rate.timestamp)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : selectedSale.exchange_rate > 0 && (
                                    <div className="p-3 bg-muted/30 rounded-lg col-span-2 flex items-center justify-between border border-border/50">
                                        <div className="space-y-0.5">
                                            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                                {t('settings.exchangeRate.title')} ({selectedSale.exchange_source})
                                            </div>
                                            <div className="text-sm font-black">
                                                100 USD = {formatCurrency(selectedSale.exchange_rate, 'iqd', features.iqd_display_preference)}
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground text-right">
                                            {formatSnapshotTime(selectedSale.exchange_rate_timestamp)}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-start">{t('products.table.name')}</TableHead>
                                            <TableHead className="text-end">{t('common.quantity')}</TableHead>
                                            <TableHead className="text-end">{t('common.price')}</TableHead>
                                            <TableHead className="text-end">{t('common.total')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedSale.items?.map((item) => {
                                            const isConverted = item.original_currency && item.settlement_currency && item.original_currency !== item.settlement_currency
                                            const hasNegotiated = item.negotiated_price !== undefined && item.negotiated_price !== null && item.negotiated_price > 0
                                            const isReturned = item.is_returned || selectedSale.is_returned
                                            const hasPartialReturn = (item.returned_quantity || 0) > 0 && !item.is_returned

                                            // Determine display prices
                                            // For display: show converted price as main, but show original->negotiated in original currency when negotiated
                                            let displayUnitPrice: number
                                            let displayCurrency: string

                                            if (hasNegotiated) {
                                                // Negotiated price exists, show converted negotiated price as main
                                                displayUnitPrice = item.converted_unit_price || item.unit_price || 0
                                                displayCurrency = selectedSale.settlement_currency || 'usd'
                                            } else {
                                                // No negotiated price, use converted price
                                                displayUnitPrice = item.converted_unit_price || item.unit_price || 0
                                                displayCurrency = selectedSale.settlement_currency || 'usd'
                                            }

                                            const originalUnitPrice = item.original_unit_price || item.unit_price || 0
                                            const originalCurrency = item.original_currency || 'usd'
                                            const negotiatedPrice = item.negotiated_price || 0

                                            return (
                                                <TableRow
                                                    key={item.id}
                                                    className={isReturned ? 'bg-destructive/10 opacity-75' : hasPartialReturn ? 'bg-orange-500/10 dark:bg-orange-500/5' : ''}
                                                >
                                                    <TableCell className="text-start">
                                                        <div className="flex items-center gap-2">
                                                            <div>
                                                                <div className="font-medium">{item.product_name}</div>
                                                                <div className="text-xs text-muted-foreground">{item.product_sku}</div>
                                                                {hasNegotiated && (
                                                                    <div className="text-[10px] text-emerald-600 font-medium">
                                                                        {t('pos.negotiatedPrice') || 'Negotiated'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {isReturned && (
                                                                <span className="px-2 py-1 text-xs font-medium bg-destructive/20 text-destructive dark:bg-destructive/30 dark:text-destructive-foreground rounded-full">
                                                                    RETURNED
                                                                </span>
                                                            )}
                                                            {hasPartialReturn && (
                                                                <span className="px-2 py-1 text-xs font-medium bg-orange-500/20 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 rounded-full">
                                                                    PARTIAL RETURN
                                                                </span>
                                                            )}
                                                            {!isReturned && !item.is_returned && (user?.role === 'admin' || user?.role === 'staff') && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => handleReturnItem(item)}
                                                                    className="h-6 w-6 p-0"
                                                                    title={t('sales.return.returnItem') || 'Return Item'}
                                                                >
                                                                    <RotateCcw className="h-3 w-3" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-end font-mono">
                                                        {item.quantity}
                                                        {hasPartialReturn && (
                                                            <div className="text-[10px] text-orange-600 font-medium">
                                                                -{item.returned_quantity} returned
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-end">
                                                        <div className="flex flex-col items-end">
                                                            {/* Show negotiated/effective price */}
                                                            <span className={hasNegotiated ? "font-medium text-emerald-600" : "font-medium"}>
                                                                {formatCurrency(displayUnitPrice, displayCurrency, features.iqd_display_preference)}
                                                            </span>
                                                            {/* Show original -> negotiated price in original currency */}
                                                            {hasNegotiated && (
                                                                <span className="text-[10px] text-muted-foreground opacity-60">
                                                                    <span className="line-through">{formatCurrency(originalUnitPrice, originalCurrency, features.iqd_display_preference)}</span> 🡆 <span className="font-bold">{formatCurrency(negotiatedPrice, originalCurrency, features.iqd_display_preference)}</span>
                                                                </span>
                                                            )}
                                                            {/* Show original price if converted but not negotiated */}
                                                            {!hasNegotiated && isConverted && (
                                                                <span className="text-[10px] text-muted-foreground line-through opacity-60">
                                                                    {formatCurrency(originalUnitPrice, originalCurrency, features.iqd_display_preference)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-end font-bold">
                                                        <div className="flex flex-col items-end">
                                                            <span className={hasNegotiated ? "text-emerald-600" : ""}>
                                                                {formatCurrency(displayUnitPrice * item.quantity, displayCurrency, features.iqd_display_preference)}
                                                            </span>
                                                            {/* Show original -> negotiated total in original currency */}
                                                            {hasNegotiated && (
                                                                <span className="text-[10px] text-muted-foreground opacity-60">
                                                                    <span className="line-through">{formatCurrency(originalUnitPrice * item.quantity, originalCurrency, features.iqd_display_preference)}</span> 🡆 <span className="font-bold">{formatCurrency(negotiatedPrice * item.quantity, originalCurrency, features.iqd_display_preference)}</span>
                                                                </span>
                                                            )}
                                                            {/* Show original total if converted but not negotiated */}
                                                            {!hasNegotiated && isConverted && (
                                                                <span className="text-[10px] text-muted-foreground line-through opacity-50">
                                                                    {formatCurrency(originalUnitPrice * item.quantity, originalCurrency, features.iqd_display_preference)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t">
                                <div className="text-lg font-bold uppercase tracking-tight opacity-70">
                                    {t('sales.total')} ({selectedSale.settlement_currency || 'usd'})
                                </div>
                                <div className="text-3xl font-black text-primary">
                                    {formatCurrency(selectedSale.total_amount, selectedSale.settlement_currency || 'usd', features.iqd_display_preference)}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Return Decline Modal */}
            <ReturnDeclineModal
                isOpen={showDeclineModal}
                onClose={() => setShowDeclineModal(false)}
                products={nonReturnableProducts}
            />

            {/* Return Rules Sequence */}
            {rulesQueue.length > 0 && currentRuleIndex >= 0 && (
                <ReturnRulesDisplayModal
                    isOpen={true}
                    onClose={handleCancelRules}
                    productName={rulesQueue[currentRuleIndex].productName}
                    rules={rulesQueue[currentRuleIndex].rules}
                    isLast={currentRuleIndex === rulesQueue.length - 1}
                    onContinue={handleNextRule}
                    onBack={handleBackRule}
                    showBack={currentRuleIndex > 0}
                />
            )}

            {/* Return Confirmation Modal */}
            <ReturnConfirmationModal
                isOpen={returnModalOpen}
                onClose={() => setReturnModalOpen(false)}
                onConfirm={handleReturnConfirm}
                title={saleToReturn ? t('sales.return.confirmTitle') || 'Return Sale' : ''}
                message={saleToReturn ? (t('sales.return.confirmMessage') || 'Are you sure you want to return this sale?') : ''}
                isItemReturn={saleToReturn?.items?.length === 1 && saleToReturn?.items?.[0]?.quantity > 1 && selectedSale?.items?.filter(i => i.product_id === saleToReturn?.items?.[0]?.product_id).length === 1}
                maxQuantity={saleToReturn?.items?.[0]?.quantity || 1}
                itemName={saleToReturn?.items?.[0]?.product_name || ''}
            />

            {/* Hidden Print Component - using opacity/position instead of display:none to ensure it renders for print */}
            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                <div ref={printRef}>
                    {printingSale && (
                        <SaleReceipt
                            sale={printingSale}
                            features={features}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
