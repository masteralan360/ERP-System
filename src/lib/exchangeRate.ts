export type ExchangeRateSource = 'xeiqd' | 'forexfy' | 'dolardinar';

export interface ExchangeRateResult {
    rate: number;
    source: ExchangeRateSource;
    isFallback: boolean;
    timestamp?: string;
}

export async function fetchUSDToIQDRate(primarySource?: ExchangeRateSource): Promise<ExchangeRateResult> {
    if (!navigator.onLine) {
        throw new Error('Offline: Cannot fetch live exchange rate');
    }

    // Get primary from localStorage if not provided (for direct calls from component)
    const favoredSource = primarySource || (localStorage.getItem('primary_exchange_rate_source') as ExchangeRateSource) || 'xeiqd';

    const sources: ExchangeRateSource[] = [
        favoredSource,
        ...(['xeiqd', 'forexfy', 'dolardinar'] as ExchangeRateSource[]).filter(s => s !== favoredSource)
    ];

    // --- TRY SOURCES IN ORDER ---
    for (let i = 0; i < sources.length; i++) {
        const currentSource = sources[i];
        const isFallback = i > 0;

        try {
            console.log(`[ExchangeRate] Fetching from ${isFallback ? 'Fallback' : 'Primary'} Source (${currentSource})...`);
            let rate = 0;
            if (currentSource === 'xeiqd') rate = await fetchFromXEIQD();
            else if (currentSource === 'forexfy') rate = await fetchFromForexfy();
            else if (currentSource === 'dolardinar') rate = await fetchFromDolarDinar();
            console.log(`[ExchangeRate] ${currentSource} Success! Rate:`, rate);
            return { rate, source: currentSource, isFallback };
        } catch (error) {
            console.warn(`[ExchangeRate] Source (${currentSource}) Failed:`, error);
        }
    }

    throw new Error('All exchange rate sources failed');
}

export async function fetchEURToIQDRate(primarySource?: ExchangeRateSource): Promise<{ usdEur: number, eurIqd: number, source: ExchangeRateSource, isFallback: boolean }> {
    if (!navigator.onLine) {
        throw new Error('Offline: Cannot fetch live exchange rate');
    }

    const favoredSource = primarySource || (localStorage.getItem('primary_eur_exchange_rate_source') as ExchangeRateSource) || 'forexfy';

    // XEIQD doesn't easily provide EUR, so we fallback to others
    const sources: ExchangeRateSource[] = [
        favoredSource,
        ...(['forexfy', 'dolardinar'] as ExchangeRateSource[]).filter(s => s !== favoredSource)
    ];

    for (let i = 0; i < sources.length; i++) {
        const currentSource = sources[i];
        const isFallback = i > 0;

        try {
            console.log(`[ExchangeRate] Fetching EUR from ${isFallback ? 'Fallback' : 'Primary'} Source (${currentSource})...`);
            const usdEur = await fetchCrossRate(currentSource, 'USD-to-EUR');
            const eurIqd = await fetchCrossRate(currentSource, 'EUR-to-IQD');
            console.log(`[ExchangeRate] EUR ${currentSource} Success!`, { usdEur, eurIqd });
            return { usdEur, eurIqd, source: currentSource, isFallback };
        } catch (error) {
            console.warn(`[ExchangeRate] EUR Source (${currentSource}) Failed:`, error);
        }
    }

    throw new Error('All EUR exchange rate sources failed');
}

async function fetchFromXEIQD(): Promise<number> {
    const response = await fetch('/api-xeiqd', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

    const html = await response.text();

    // 1. Try Sulaymaniyah spot rate
    const sulyRegex = /السليمانية.*?(?:IQD|د\.ع)\s*([0-9\u0660-\u0669]{1,3}(?:[.,\u066B\u066C][0-9\u0660-\u0669]{3})+)/s;
    const sulyMatch = html.match(sulyRegex);

    if (sulyMatch && sulyMatch[1]) {
        let rawValue = sulyMatch[1];
        const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        for (let i = 0; i < 10; i++) {
            rawValue = rawValue.split(arabicDigits[i]).join(i.toString());
        }
        const cleanedValue = rawValue.replace(/[.,\u066B\u066C]/g, '');
        const rate = parseInt(cleanedValue);
        if (!isNaN(rate) && rate > 100000) return rate;
    }

    // 2. Fallback to chart data
    const regex = /cachedData:\s*JSON\.parse\(['"](.+?)['"]\)/s;
    const match = html.match(regex);
    if (!match || !match[1]) throw new Error('Pattern not found');

    const jsonStr = match[1]
        .replace(/&quot;/g, '"')
        .replace(/\\\\u/g, '\\u')
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)))
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");

    const data = JSON.parse(jsonStr);
    const usdDataset = data.datasets.find((ds: any) => ds.label === "USD" || ds.label === "دولار أمريكي");
    if (!usdDataset || !usdDataset.data) throw new Error('USD dataset not found');

    const entries = Object.entries(usdDataset.data);
    if (entries.length === 0) throw new Error('No entries');

    const latestValueStr = entries[entries.length - 1][1] as string;
    const latestValue = parseFloat(latestValueStr);
    if (isNaN(latestValue)) throw new Error('Invalid value');

    return Math.round(latestValue * 100);
}

async function fetchFromForexfy(): Promise<number> {
    const response = await fetch('/api-forexfy/en/currency/USD-to-IQD/blackMarket', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

    const html = await response.text();

    /**
     * User requested "Sell Price" which currently is 1,453.95
     * Based on research, the HTML structure is:
     * <span class="margin-me-1">Sell Price:</span> <b class="fs-5">1,453.95</b>
     * Alternatively, there's a script tag with:
     * const rates = {"IQD":{"sell":1,"buy":1},"USD":{"sell":1453.95,"buy":1468.64,"unit":1}};
     */

    // Try script extraction first (more robust)
    const scriptRegex = /const\s+rates\s*=\s*({.*?});/s;
    const scriptMatch = html.match(scriptRegex);
    if (scriptMatch && scriptMatch[1]) {
        try {
            const rates = JSON.parse(scriptMatch[1]);
            if (rates.USD && rates.USD.sell) {
                const sellValue = parseFloat(rates.USD.sell);
                if (!isNaN(sellValue)) {
                    // Multiply by 100 as per user requirement (1453.95 -> 145395)
                    return Math.round(sellValue * 100);
                }
            }
        } catch (e) {
            console.warn('[Forexfy] JSON parse failed, falling back to regex');
        }
    }

    // Fallback 2: Main Rate Selector (Highly Flexible)
    const htmlRegex = /Sell Price:.*?<b.*?>([\d,.]+)/i;
    const htmlMatch = html.match(htmlRegex);
    if (htmlMatch && htmlMatch[1]) {
        const rawValue = htmlMatch[1].replace(/,/g, '');
        const sellValue = parseFloat(rawValue);
        if (!isNaN(sellValue) && sellValue > 100) {
            return Math.round(sellValue * 100);
        }
    }

    // Fallback 3: Navigation/Link Pattern (Extracted from Home Page)
    // Looking for <b>...</b> inside an element that contains currency name
    const navRegex = /USD-to-IQD.*?<b>([\d,.]+)/i;
    const navMatch = html.match(navRegex);
    if (navMatch && navMatch[1]) {
        const rawValue = navMatch[1].replace(/,/g, '');
        const sellValue = parseFloat(rawValue);
        if (!isNaN(sellValue) && sellValue > 100) {
            return Math.round(sellValue * 100);
        }
    }

    // Fallback 4: Global Pattern Match (Last Resort)
    // Matches any sequence like "USD ... 1,450.00" or similar
    const globalRegex = /USD.*?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/i;
    const globalMatch = html.match(globalRegex);
    if (globalMatch && globalMatch[1]) {
        const rawValue = globalMatch[1].replace(/,/g, '');
        const sellValue = parseFloat(rawValue);
        if (!isNaN(sellValue) && sellValue > 100) {
            return Math.round(sellValue * 100);
        }
    }

    throw new Error('Could not extract Sell Price from forexfy.app after 4 attempts');
}

async function fetchFromDolarDinar(): Promise<number> {
    const response = await fetch('https://opensheet.elk.sh/1VqEZiLBr7dYeoH2wkeUH3D9zNe61dw-_RPxj6MH_Xw0/Today', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    const data = await response.json();

    // Find IQD row
    const iqdRow = data.find((r: any) => r.Currency === 'IQD');
    if (!iqdRow || !iqdRow.Rate) throw new Error('IQD rate not found in DolarDinar sheet');

    // Normalize: remove . (thousands), replace , with . (decimal)
    const normalizedRate = parseFloat(iqdRow.Rate.replace(/\./g, '').replace(/,/g, '.'));
    if (isNaN(normalizedRate)) throw new Error('Invalid IQD rate from DolarDinar');

    // System uses integers (1450.00 -> 145000)
    return Math.round(normalizedRate * 100);
}

export type ExchangePath = 'USD-to-IQD' | 'USD-to-EUR' | 'EUR-to-IQD';

async function fetchEgRate(path: ExchangePath): Promise<number> {
    const response = await fetch(`/api-forexfy/en/currency/${path}/blackMarket`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

    const html = await response.text();

    const scriptRegex = /const\s+rates\s*=\s*({.*?});/s;
    const scriptMatch = html.match(scriptRegex);
    if (scriptMatch && scriptMatch[1]) {
        try {
            const rates = JSON.parse(scriptMatch[1]);
            const symbol = path.split('-to-')[0]; // USD or EUR
            if (rates[symbol] && rates[symbol].sell) {
                const sellValue = parseFloat(rates[symbol].sell);
                if (!isNaN(sellValue)) {
                    return Math.round(sellValue * 100);
                }
            }
        } catch (e) {
            console.warn(`[Forexfy] ${path} JSON parse failed, falling back to regex`);
        }
    }

    // Fallback 2: Main Rate Selector (Highly Flexible)
    const htmlRegex = /Sell Price:.*?<b.*?>([\d,.]+)/i;
    const htmlMatch = html.match(htmlRegex);
    if (htmlMatch && htmlMatch[1]) {
        const rawValue = htmlMatch[1].replace(/,/g, '');
        const sellValue = parseFloat(rawValue);
        if (!isNaN(sellValue)) {
            return Math.round(sellValue * 100);
        }
    }

    // Fallback 3: Navigation/Link Pattern
    const navRegex = new RegExp(`${path}.*?<b>([\\d,.]+)`, 'i');
    const navMatch = html.match(navRegex);
    if (navMatch && navMatch[1]) {
        const rawValue = navMatch[1].replace(/,/g, '');
        const sellValue = parseFloat(rawValue);
        if (!isNaN(sellValue)) {
            return Math.round(sellValue * 100);
        }
    }

    // Fallback 4: Global Pattern
    const symbol = path.split('-to-')[0]; // USD or EUR
    const globalRegex = new RegExp(`${symbol}.*?(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))`, 'i');
    const globalMatch = html.match(globalRegex);
    if (globalMatch && globalMatch[1]) {
        const rawValue = globalMatch[1].replace(/,/g, '');
        const sellValue = parseFloat(rawValue);
        if (!isNaN(sellValue)) {
            return Math.round(sellValue * 100);
        }
    }

    throw new Error(`Could not extract rate for ${path} from forexfy.app`);
}

export async function fetchCrossRate(source: ExchangeRateSource, path: ExchangePath): Promise<number> {
    if (source === 'xeiqd') {
        // XEIQD only provides USD/IQD usually, for others we might need a fallback or cross calculation
        // but currently system uses it as primary. For simplicity, if path is not USD-IQD, try forexfy
        if (path === 'USD-to-IQD') return await fetchFromXEIQD();
        return await fetchEgRate(path); // Fallback to forexfy for EUR/others
    }

    if (source === 'forexfy') {
        return await fetchEgRate(path);
    }

    if (source === 'dolardinar') {
        const response = await fetch('https://opensheet.elk.sh/1VqEZiLBr7dYeoH2wkeUH3D9zNe61dw-_RPxj6MH_Xw0/Today', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const data = await response.json();

        const getVal = (curr: string) => {
            const row = data.find((r: any) => r.Currency === curr);
            if (!row || !row.Rate) throw new Error(`${curr} rate not found`);
            return parseFloat(row.Rate.replace(/\./g, '').replace(/,/g, '.'));
        };

        if (path === 'USD-to-IQD') {
            return Math.round(getVal('IQD') * 100);
        } else if (path === 'USD-to-EUR') {
            return Math.round(getVal('EUR') * 100);
        } else if (path === 'EUR-to-IQD') {
            const iqd = getVal('IQD');
            const eur = getVal('EUR');
            return Math.round((iqd / eur) * 100);
        }
    }

    throw new Error(`Unsupported source/path combination: ${source}/${path}`);
}
