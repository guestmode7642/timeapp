export default async function handler(req, res) {
    const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!REDIS_URL || !REDIS_TOKEN) {
        return res.status(500).json({ error: 'Redis environment variables not configured in Vercel.' });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    try {
        if (req.method === 'GET') {
            const response = await fetch(REDIS_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${REDIS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(['GET', 'timeLedgerData'])
            });
            const result = await response.json();
            const parsed = result.result ? JSON.parse(result.result) : null;
            return res.status(200).json({ data: parsed });
        }

        if (req.method === 'POST') {
            const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            await fetch(REDIS_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${REDIS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(['SET', 'timeLedgerData', JSON.stringify(payload)])
            });
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
