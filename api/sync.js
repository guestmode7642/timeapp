import crypto from 'crypto';

export default async function handler(req, res) {
    const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    const SECRET = process.env.AUTH_SECRET || REDIS_TOKEN || 'time-ledger-secret-key';

    if (!REDIS_URL || !REDIS_TOKEN) {
        return res.status(500).json({ error: 'Redis environment variables not configured in Vercel.' });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    async function redisCmd(commandArray) {
        const response = await fetch(REDIS_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${REDIS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(commandArray)
        });
        return response.json();
    }

    function hashPassword(password, salt) {
        return crypto.scryptSync(password, salt, 64).toString('hex');
    }

    function createToken(username) {
        const sig = crypto.createHmac('sha256', SECRET).update(username).digest('hex');
        return `${username}.${sig}`;
    }

    function verifyToken(token) {
        if (!token || typeof token !== 'string' || !token.includes('.')) return null;
        const lastDot = token.lastIndexOf('.');
        const username = token.slice(0, lastDot);
        const sig = token.slice(lastDot + 1);
        const expectedSig = crypto.createHmac('sha256', SECRET).update(username).digest('hex');
        return sig === expectedSig ? username : null;
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        // 1. SIGNUP / LOGIN ACTION (POST without auth token)
        if (req.method === 'POST' && (body.action === 'login' || body.action === 'signup')) {
            const rawUser = (body.username || '').trim().toLowerCase();
            const password = body.password || '';

            if (!/^[a-z0-9_.-]{3,30}$/.test(rawUser)) {
                return res.status(400).json({ error: 'Username must be 3–30 characters (letters, numbers, _ . -).' });
            }
            if (password.length < 4) {
                return res.status(400).json({ error: 'Password must be at least 4 characters.' });
            }

            const authKey = `user:${rawUser}:auth`;
            const existingRes = await redisCmd(['GET', authKey]);
            const existingAuth = existingRes.result ? JSON.parse(existingRes.result) : null;

            if (body.action === 'signup') {
                if (existingAuth) {
                    return res.status(409).json({ error: 'Username already taken. Please switch to Login.' });
                }
                const salt = crypto.randomBytes(16).toString('hex');
                const passwordHash = hashPassword(password, salt);
                await redisCmd(['SET', authKey, JSON.stringify({ salt, passwordHash, createdAt: Date.now() })]);

                const token = createToken(rawUser);
                return res.status(200).json({ token, username: rawUser, data: null });
            }

            if (body.action === 'login') {
                if (!existingAuth) {
                    return res.status(404).json({ error: 'Account not found. Please Sign Up first.' });
                }
                const attemptHash = hashPassword(password, existingAuth.salt);
                if (attemptHash !== existingAuth.passwordHash) {
                    return res.status(401).json({ error: 'Incorrect password.' });
                }

                const dataRes = await redisCmd(['GET', `user:${rawUser}:data`]);
                const userData = dataRes.result ? JSON.parse(dataRes.result) : null;
                const token = createToken(rawUser);
                return res.status(200).json({ token, username: rawUser, data: userData });
            }
        }

        // 2. AUTHENTICATED DATA SYNC (GET & POST)
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const username = verifyToken(token);

        if (!username) {
            return res.status(401).json({ error: 'Unauthorized. Please log in.' });
        }

        const userDataKey = `user:${username}:data`;

        if (req.method === 'GET') {
            const response = await redisCmd(['GET', userDataKey]);
            const parsed = response.result ? JSON.parse(response.result) : null;
            return res.status(200).json({ data: parsed, username });
        }

        if (req.method === 'POST') {
            await redisCmd(['SET', userDataKey, JSON.stringify(body.data || body)]);
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
