import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth'
import { supabase } from '@/auth/supabase'
import { Sale, SaleItem } from '@/types'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/workspace'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from '@/ui/components'
import {
    TrendingUp,
    DollarSign,
    BarChart3,
    Loader2
} from 'lucide-react'

export function Revenue() {
    const { user } = useAuth()
    const { t } = useTranslation()
    const { features } = useWorkspace()
    const [sales, setSales] = useState<Sale[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null)

    const fetchSales = async () => {
        setIsLoading(true)
        try {
            const { data, error } = await supabase
                .from('sales')
                .select(`
                    *,
                    items:sale_items(
                        *,
                        product:product_id(name, sku)
                    )
                `)
                .order('created_at', { ascending: false })

            if (error) throw error

            // Fetch profiles for cashiers
            const cashierIds = Array.from(new Set((data || []).map((s: any) => s.cashier_id).filter(Boolean)))
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

            const formattedSales = (data || []).map((sale: any) => ({
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
            console.error('Error fetching sales for revenue:', err)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        if (user?.workspaceId) {
            fetchSales()
        }
    }, [user?.workspaceId])

    // Calculations
    const calculateStats = () => {
        const statsByCurrency: Record<string, { revenue: number, cost: number, salesCount: number }> = {}
        const saleStats: any[] = []

        sales.forEach(sale => {
            // Skip returned sales from revenue calculations
            if (sale.is_returned) return
            
            const currency = sale.settlement_currency || 'usd'
            if (!statsByCurrency[currency]) {
                statsByCurrency[currency] = { revenue: 0, cost: 0, salesCount: 0 }
            }
            statsByCurrency[currency].salesCount++

            let saleRevenue = 0
            let saleCost = 0

            sale.items?.forEach((item: SaleItem) => {
                // Skip returned items from calculations
                if (item.is_returned) return
                
                // Use the values already converted to settlement currency or the original ones if same
                const itemRevenue = item.converted_unit_price * item.quantity
                const itemCost = (item.converted_cost_price || 0) * item.quantity

                saleRevenue += itemRevenue
                saleCost += itemCost
            })

            statsByCurrency[currency].revenue += saleRevenue
            statsByCurrency[currency].cost += saleCost

            saleStats.push({
                id: sale.id,
                date: sale.created_at,
                revenue: saleRevenue,
                cost: saleCost,
                profit: saleRevenue - saleCost,
                margin: saleRevenue > 0 ? ((saleRevenue - saleCost) / saleRevenue) * 100 : 0,
                currency: currency,
                origin: sale.origin,
                cashier: sale.cashier_name || 'Staff'
            })
        })

        return {
            statsByCurrency,
            saleStats: saleStats.slice(0, 50)
        }
    }

    const stats = calculateStats()

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-primary" />
                    {t('revenue.title')}
                </h1>
                <p className="text-muted-foreground">{t('revenue.subtitle')}</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            {t('revenue.grossRevenue')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {Object.entries(stats.statsByCurrency).map(([curr, data]) => (
                            <div key={curr}>
                                <div className="text-2xl font-bold">{formatCurrency(data.revenue, curr, features.iqd_display_preference)}</div>
                            </div>
                        ))}
                        {Object.keys(stats.statsByCurrency).length === 0 && <div className="text-2xl font-bold">{formatCurrency(0, 'usd')}</div>}
                    </CardContent>
                </Card>

                <Card className="bg-orange-500/5 border-orange-500/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-orange-600 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            {t('revenue.totalCost')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {Object.entries(stats.statsByCurrency).map(([curr, data]) => (
                            <div key={curr}>
                                <div className="text-2xl font-bold">{formatCurrency(data.cost, curr, features.iqd_display_preference)}</div>
                            </div>
                        ))}
                        {Object.keys(stats.statsByCurrency).length === 0 && <div className="text-2xl font-bold">{formatCurrency(0, 'usd')}</div>}
                    </CardContent>
                </Card>

                <Card className="bg-emerald-500/5 border-emerald-500/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-600 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            {t('revenue.netProfit')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {Object.entries(stats.statsByCurrency).map(([curr, data]) => (
                            <div key={curr}>
                                <div className="text-2xl font-bold text-emerald-600">
                                    {formatCurrency(data.revenue - data.cost, curr, features.iqd_display_preference)}
                                </div>
                            </div>
                        ))}
                        {Object.keys(stats.statsByCurrency).length === 0 && <div className="text-2xl font-bold text-emerald-600">{formatCurrency(0, 'usd')}</div>}
                    </CardContent>
                </Card>

                <Card className="bg-purple-500/5 border-purple-500/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-purple-600 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            {t('revenue.profitMargin')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {Object.entries(stats.statsByCurrency).map(([curr, data]) => {
                            const margin = data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0
                            return (
                                <div key={curr}>
                                    <div className="text-2xl font-bold text-purple-600">
                                        {margin.toFixed(1)}% <span className="text-xs uppercase opacity-60">({curr})</span>
                                    </div>
                                </div>
                            )
                        })}
                        {Object.keys(stats.statsByCurrency).length === 0 && <div className="text-2xl font-bold text-purple-600">0.0%</div>}
                    </CardContent>
                </Card>
            </div>

            {/* Sale Profitability Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        {t('revenue.listTitle') || 'Recent Sales Profit Analysis'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-start">{t('sales.date') || 'Date'}</TableHead>
                                <TableHead className="text-start">{t('sales.id') || 'Sale ID'}</TableHead>
                                <TableHead className="text-start">{t('sales.origin') || 'Origin'}</TableHead>
                                <TableHead className="text-end">{t('revenue.table.revenue')}</TableHead>
                                <TableHead className="text-end">{t('revenue.table.cost')}</TableHead>
                                <TableHead className="text-end">{t('revenue.table.profit')}</TableHead>
                                <TableHead className="text-end">{t('revenue.table.margin')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stats.saleStats.map((sale, idx) => (
                                <TableRow key={sale.id || idx}>
                                    <TableCell className="text-start font-mono text-xs">
                                        {formatDateTime(sale.date)}
                                    </TableCell>
                                    <TableCell className="text-start">
                                        <button
                                            onClick={() => {
                                                const originalSale = sales.find(s => s.id === sale.id)
                                                if (originalSale) setSelectedSale(originalSale)
                                            }}
                                            className="font-mono text-[10px] text-primary hover:underline"
                                        >
                                            {sale.id.split('-')[0]}
                                        </button>
                                    </TableCell>
                                    <TableCell className="text-start">
                                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-secondary uppercase">
                                            {sale.origin}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-end font-medium">
                                        {formatCurrency(sale.revenue, sale.currency, features.iqd_display_preference)}
                                    </TableCell>
                                    <TableCell className="text-end text-muted-foreground">
                                        {formatCurrency(sale.cost, sale.currency, features.iqd_display_preference)}
                                    </TableCell>
                                    <TableCell className="text-end font-bold text-emerald-600">
                                        {formatCurrency(sale.profit, sale.currency, features.iqd_display_preference)}
                                    </TableCell>
                                    <TableCell className="text-end">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-[10px] font-bold",
                                            sale.margin > 20 ? "bg-emerald-500/10 text-emerald-600" :
                                                sale.margin > 0 ? "bg-orange-500/10 text-orange-600" :
                                                    "bg-destructive/10 text-destructive"
                                        )}>
                                            {sale.margin.toFixed(1)}%
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
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
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground">{t('sales.date')}:</span>
                                    <div className="font-medium">{formatDateTime(selectedSale.created_at)}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">{t('sales.cashier')}:</span>
                                    <div className="font-medium">{selectedSale.cashier_name || 'Staff'}</div>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">{t('sales.id')}:</span>
                                    <div className="font-mono text-xs text-muted-foreground">{selectedSale.id}</div>
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
                                                    <div className="text-sm font-black">
                                                        100 {rate.pair.split('/')[0]} = {formatCurrency(rate.rate, rate.pair.split('/')[1].toLowerCase() as any, features.iqd_display_preference)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (selectedSale.exchange_rate ?? 0) > 0 && (
                                    <div className="p-3 bg-muted/30 rounded-lg col-span-2 flex items-center justify-between border border-border/50">
                                        <div className="space-y-0.5">
                                            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                                {t('settings.exchangeRate.title')} ({selectedSale.exchange_source})
                                            </div>
                                            <div className="text-sm font-black">
                                                100 USD = {formatCurrency(selectedSale.exchange_rate, 'iqd', features.iqd_display_preference)}
                                            </div>
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
                                            return (
                                                <TableRow key={item.id}>
                                                    <TableCell className="text-start">
                                                        <div className="font-medium">{item.product_name}</div>
                                                        <div className="text-xs text-muted-foreground">{item.product_sku}</div>
                                                    </TableCell>
                                                    <TableCell className="text-end font-mono">
                                                        {item.quantity}
                                                    </TableCell>
                                                    <TableCell className="text-end">
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-medium">
                                                                {formatCurrency(item.converted_unit_price || item.unit_price, selectedSale.settlement_currency || 'usd', features.iqd_display_preference)}
                                                            </span>
                                                            {item.negotiated_price && (
                                                                <span className="text-[10px] text-emerald-600 font-bold">
                                                                    {t('pos.negotiatedPrice') || 'Negotiated'}
                                                                </span>
                                                            )}
                                                            {isConverted && (
                                                                <span className="text-[10px] text-muted-foreground line-through opacity-70">
                                                                    {formatCurrency(item.original_unit_price || item.unit_price, item.original_currency || 'usd', features.iqd_display_preference)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-end font-bold">
                                                        <div className="flex flex-col items-end">
                                                            <span>
                                                                {formatCurrency((item.converted_unit_price || item.unit_price) * item.quantity, selectedSale.settlement_currency || 'usd', features.iqd_display_preference)}
                                                            </span>
                                                            {isConverted && (
                                                                <span className="text-[10px] text-muted-foreground line-through opacity-50">
                                                                    {formatCurrency((item.original_unit_price || item.unit_price) * item.quantity, item.original_currency || 'usd', features.iqd_display_preference)}
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
        </div>
    )
}
