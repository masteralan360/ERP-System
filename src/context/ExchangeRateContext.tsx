import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { fetchUSDToIQDRate, fetchEURToIQDRate, fetchTRYToIQDRate, type ExchangeRateResult } from '@/lib/exchangeRate'
import { useWorkspace } from '@/workspace'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

export interface ExchangeSnapshot {
    rate: number
    source: string
    timestamp: string
    isFallback: boolean
}

interface ExchangeRateContextType {
    exchangeData: ExchangeRateResult | null
    eurRates: {
        usd_eur: ExchangeSnapshot | null
        eur_iqd: ExchangeSnapshot | null
    }
    tryRates: {
        usd_try: ExchangeSnapshot | null
        try_iqd: ExchangeSnapshot | null
    }
    status: 'loading' | 'live' | 'error'
    lastUpdated: string | null
    refresh: () => Promise<void>
}

const ExchangeRateContext = createContext<ExchangeRateContextType | undefined>(undefined)

export function ExchangeRateProvider({ children }: { children: React.ReactNode }) {
    const { features } = useWorkspace()
    const [exchangeData, setExchangeData] = useState<ExchangeRateResult | null>(null)
    const [eurRates, setEurRates] = useState<ExchangeRateContextType['eurRates']>({
        usd_eur: null,
        eur_iqd: null
    })
    const [tryRates, setTryRates] = useState<ExchangeRateContextType['tryRates']>({
        usd_try: null,
        try_iqd: null
    })
    const [status, setStatus] = useState<'loading' | 'live' | 'error'>('loading')
    const [lastUpdated, setLastUpdated] = useState<string | null>(null)
    const isOnline = useNetworkStatus()

    // Force error status if offline
    const effectiveStatus = !isOnline ? 'error' : status

    const refresh = useCallback(async () => {
        setStatus('loading')
        try {
            // 1. Fetch USD/IQD (Existing)
            const usdIqdResult = await fetchUSDToIQDRate()
            setExchangeData(usdIqdResult)

            // 2. Fetch EUR rates if enabled
            if (features.eur_conversion_enabled) {
                try {
                    const eurResult = await fetchEURToIQDRate()
                    const timestamp = new Date().toISOString()

                    setEurRates({
                        usd_eur: { rate: eurResult.usdEur, source: eurResult.source, timestamp, isFallback: eurResult.isFallback },
                        eur_iqd: { rate: eurResult.eurIqd, source: eurResult.source, timestamp, isFallback: eurResult.isFallback }
                    })
                } catch (error) {
                    console.error('ExchangeRateProvider: Failed to fetch EUR rates', error)
                }
            }

            // 3. Fetch TRY rates if enabled
            if (features.try_conversion_enabled) {
                try {
                    // We need to import fetchTRYToIQDRate
                    const tryResult = await fetchTRYToIQDRate()
                    const timestamp = new Date().toISOString()

                    setTryRates({
                        usd_try: { rate: tryResult.usdTry, source: tryResult.source, timestamp, isFallback: tryResult.isFallback },
                        try_iqd: { rate: tryResult.tryIqd, source: tryResult.source, timestamp, isFallback: tryResult.isFallback }
                    })
                } catch (error) {
                    console.error('ExchangeRateProvider: Failed to fetch TRY rates', error)
                }
            }

            setStatus('live')
            setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))
        } catch (error) {
            console.error('ExchangeRateProvider: Failed to fetch rate', error)
            setStatus('error')
        }
    }, [features.eur_conversion_enabled, features.try_conversion_enabled])

    useEffect(() => {
        refresh()
        const interval = setInterval(refresh, 60000) // Refresh every 60 seconds
        return () => clearInterval(interval)
    }, [refresh])

    // listen for manual refresh events from legacy triggers if any
    useEffect(() => {
        const handleRefresh = () => refresh()
        window.addEventListener('exchange-rate-refresh', handleRefresh)
        return () => window.removeEventListener('exchange-rate-refresh', handleRefresh)
    }, [refresh])

    return (
        <ExchangeRateContext.Provider value={{ exchangeData, eurRates, tryRates, status: effectiveStatus, lastUpdated, refresh }}>
            {children}
        </ExchangeRateContext.Provider>
    )
}

export function useExchangeRate() {
    const context = useContext(ExchangeRateContext)
    if (context === undefined) {
        throw new Error('useExchangeRate must be used within an ExchangeRateProvider')
    }
    return context
}
