export default async function handler(req, res) {
    try {
        const { path = '' } = req.query;
        // Remove leading slash if any
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const targetUrl = `https://egcurrency.com${cleanPath}`;

        const fetchOptions = {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'https://egcurrency.com/en',
                'Sec-Ch-Ua': '"Not_A Brand";v="24", "Chromium";v="120", "Android Shop";v="120"',
                'Sec-Ch-Ua-Mobile': '?1',
                'Sec-Ch-Ua-Platform': '"Android"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
            }
        };

        let response = await fetch(targetUrl, fetchOptions);

        // If specific page fails (403/404/503), try the home page as it often has the rates too
        if (!response.ok && cleanPath !== '/en') {
            console.warn(`[EgCurrency Proxy] Path ${cleanPath} failed with ${response.status}, trying home page fallback...`);
            response = await fetch('https://egcurrency.com/en', fetchOptions);
        }

        const data = await response.text();

        console.log(`[EgCurrency Proxy] Final URL: ${response.url} - Status: ${response.status}`);

        if (data.includes('cf-browser-verification') || data.includes('Checking your browser')) {
            console.error('[EgCurrency Proxy] Still blocked by Cloudflare Challenge');
        }

        res.setHeader('Content-Type', 'text/html');
        res.status(response.status).send(data);
    } catch (error) {
        console.error('[EgCurrency Proxy] Fatal Error:', error.message);
        res.status(500).json({ error: error.message });
    }
}
