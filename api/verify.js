import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const MAX_BOUND_IPS = 3;

/**
 * 获取客户端真实 IP
 */
function getClientIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const ips = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (ips.length > 0) return ips[0];
  }
  return req.headers['x-real-ip'] || req.headers['x-client-ip'] || 'unknown';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ success: false, error: '缺少卡密' });
    }

    const keyData = await redis.get(`cx:token:${token}`);

    if (!keyData) {
      return res.status(401).json({ success: false, error: '卡密无效，请检查或联系卖家' });
    }

    if (keyData.balance <= 0) {
      return res.status(403).json({ success: false, error: '额度已用完，请购买新卡密' });
    }

    // IP 限制检查（验证时不绑定新 IP，只检查是否被锁）
    const clientIP = getClientIP(req);
    const boundIPs = keyData.boundIPs || [];

    if (clientIP !== 'unknown' && boundIPs.length > 0 && !boundIPs.includes(clientIP)) {
      if (boundIPs.length >= MAX_BOUND_IPS) {
        return res.status(403).json({
          success: false,
          error: `此卡密已绑定 ${MAX_BOUND_IPS} 个设备IP，为防止共享已被锁定。如需更换设备请联系卖家解绑。`,
          code: 'IP_LIMIT_EXCEEDED',
        });
      }
    }

    return res.status(200).json({
      success: true,
      balance: keyData.balance,
      boundIPs: boundIPs.length,
      maxIPs: MAX_BOUND_IPS,
    });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ success: false, error: '服务器内部错误' });
  }
}
