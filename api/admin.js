import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cx-admin-2026';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify admin
  const authHeader = req.headers.authorization || '';
  const adminToken = authHeader.replace('Bearer ', '');
  if (adminToken !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: '无权限' });
  }

  const action = req.query.action || req.body?.action;

  try {
    // Generate tokens
    if (action === 'generate' || (req.method === 'POST' && req.body?.count)) {
      const count = req.body?.count || 100;
      const quantity = req.body?.quantity || 1;
      const tokens = [];

      for (let i = 0; i < quantity; i++) {
        const token = generateToken();
        await redis.set(`cx:token:${token}`, {
          balance: count,
          used: 0,
          total: count,
          created: Date.now(),
          lastUsed: null,
          note: req.body?.note || '',
        });
        await redis.sadd('cx:all_tokens', token);
        tokens.push({ token, balance: count });
      }

      return res.json({ success: true, tokens });
    }

    // List all tokens
    if (action === 'list' || req.method === 'GET') {
      const tokenIds = await redis.smembers('cx:all_tokens');
      const result = [];

      for (const t of tokenIds) {
        const data = await redis.get(`cx:token:${t}`);
        if (data) {
          result.push({ token: t, ...data });
        }
      }

      return res.json({ tokens: result });
    }

    // Revoke a token
    if (action === 'revoke') {
      const token = req.body?.token || req.query.token;
      if (token) {
        await redis.del(`cx:token:${token}`);
        await redis.srem('cx:all_tokens', token);
        return res.json({ success: true, message: '已删除' });
      }
    }

    // Get usage logs
    if (action === 'logs') {
      const token = req.body?.token || req.query.token;
      if (token) {
        const logs = await redis.lrange(`cx:logs:${token}`, 0, 99);
        return res.json({ logs: logs || [] });
      }
    }

    // Stats
    if (action === 'stats') {
      const tokenIds = await redis.smembers('cx:all_tokens');
      let totalBalance = 0;
      let totalUsed = 0;
      let activeTokens = 0;

      for (const t of tokenIds) {
        const data = await redis.get(`cx:token:${t}`);
        if (data) {
          totalBalance += data.balance || 0;
          totalUsed += data.used || 0;
          if (data.balance > 0) activeTokens++;
        }
      }

      return res.json({
        totalTokens: tokenIds.length,
        activeTokens,
        totalBalance,
        totalUsed,
      });
    }

    return res.status(400).json({ error: '未知操作' });
  } catch (err) {
    console.error('Admin error:', err);
    return res.status(500).json({ error: '服务器错误: ' + err.message });
  }
}

function generateToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = [];
  for (let s = 0; s < 3; s++) {
    let seg = '';
    for (let i = 0; i < 4; i++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    segments.push(seg);
  }
  return 'CX-' + segments.join('-');
}
