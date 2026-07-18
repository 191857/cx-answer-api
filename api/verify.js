import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

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

    return res.status(200).json({
      success: true,
      balance: keyData.balance,
    });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ success: false, error: '服务器内部错误' });
  }
}
