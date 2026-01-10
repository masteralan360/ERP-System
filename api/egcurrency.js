export default async function handler(req, res) {
    try {
        const { path = '' } = req.query;
        // Remove leading slash if any
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const targetUrl = `https://forexfy.app${cleanPath}`;

        const fetchOptions = {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'https://forexfy.app/',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'cross-site',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };

        let response = await fetch(targetUrl, fetchOptions);

        // If specific page fails, try the home page fallback
        if (!response.ok && cleanPath !== '/en') {
            console.warn(`[EgCurrency Proxy] Path ${cleanPath} failed (${response.status}), trying home page...`);
            response = await fetch('https://forexfy.app/en', fetchOptions);
        }

        const data = await response.text();

        // Check for Cloudflare and log status
        console.log(`[Forexfy Proxy] Final Status: ${response.status} - Content Length: ${data.length}`);

        if (data.includes('cf-browser-verification') || data.includes('Checking your browser')) {
            console.error('[EgCurrency Proxy] Blocked by Cloudflare JS Challenge');
        }

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.status(response.status).send(data);
    } catch (error) {
        console.error('[EgCurrency Proxy] Fatal Error:', error.message);
        res.status(200).send(`<!-- Error: ${error.message} --><html><body>Rate Error</body></html>`);
    }
}
