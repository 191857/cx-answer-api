import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cx-admin-2026';

// 默认卡密额度
const DEFAULT_BALANCE = 5000;

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
      const count = req.body?.count || DEFAULT_BALANCE;  // 默认 5000 题
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
          boundIPs: [],       // IP 绑定列表
          firstIP: null,
          firstIPTime: null,
          lastIP: null,
          source: req.body?.source || 'manual',  // manual / dujiao / webhook
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
          result.push({
            token: t,
            ...data,
            boundIPs: data.boundIPs || [],
            ipCount: (data.boundIPs || []).length,
          });
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

    // Unbind IP — 解除卡密绑定的所有 IP
    if (action === 'unbind_ip') {
      const token = req.body?.token || req.query.token;
      if (token) {
        const data = await redis.get(`cx:token:${token}`);
        if (!data) {
          return res.status(404).json({ error: '卡密不存在' });
        }
        await redis.set(`cx:token:${token}`, {
          ...data,
          boundIPs: [],
          firstIP: null,
          firstIPTime: null,
        });
        return res.json({ success: true, message: 'IP 已解绑，用户可重新绑定' });
      }
    }

    // Batch unbind IP
    if (action === 'unbind_ip_all') {
      const tokenIds = await redis.smembers('cx:all_tokens');
      let count = 0;
      for (const t of tokenIds) {
        const data = await redis.get(`cx:token:${t}`);
        if (data && (data.boundIPs || []).length > 0) {
          await redis.set(`cx:token:${t}`, {
            ...data,
            boundIPs: [],
            firstIP: null,
            firstIPTime: null,
          });
          count++;
        }
      }
      return res.json({ success: true, message: `已解绑 ${count} 张卡密的 IP` });
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
      let lockedTokens = 0;  // IP 达上限的卡密数

      for (const t of tokenIds) {
        const data = await redis.get(`cx:token:${t}`);
        if (data) {
          totalBalance += data.balance || 0;
          totalUsed += data.used || 0;
          if (data.balance > 0) activeTokens++;
          if ((data.boundIPs || []).length >= 3) lockedTokens++;
        }
      }

      return res.json({
        totalTokens: tokenIds.length,
        activeTokens,
        totalBalance,
        totalUsed,
        lockedTokens,
      });
    }

    // Export tokens as CSV (for importing into 发卡平台)
    if (action === 'export') {
      const tokenIds = await redis.smembers('cx:all_tokens');
      const lines = ['token,balance,used,created,note,source'];
      for (const t of tokenIds) {
        const data = await redis.get(`cx:token:${t}`);
        if (data) {
          lines.push(`${t},${data.balance || 0},${data.used || 0},${data.created || ''},${data.note || ''},${data.source || ''}`);
        }
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tokens.csv"');
      return res.status(200).send(lines.join('\n'));
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
