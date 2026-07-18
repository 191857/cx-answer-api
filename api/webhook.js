import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * 发卡平台 Webhook 回调接口
 *
 * 支持：
 * 1. 独角数卡（Dujiao）— 开源发卡系统，支持微信/支付宝
 * 2. 异次元发卡 — 另一个流行发卡系统
 * 3. 通用 webhook — 任何支持 POST 回调的发卡平台
 *
 * 工作流程：
 * 用户在发卡平台支付成功 → 发卡平台调用此 webhook → 自动生成卡密 → 返回给发卡平台 → 发卡平台发给买家
 *
 * 安全验证：
 * - 通过 WEBHOOK_SECRET 环境变量验证请求合法性
 * - 支持 header 和 query 两种传递方式
 */

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const CARD_BALANCE = parseInt(process.env.CARD_BALANCE || '5000', 10); // 每张卡密默认 5000 题

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 验证密钥
    const secret = req.headers['x-webhook-secret'] || req.query.secret || req.body?.secret;
    if (!WEBHOOK_SECRET) {
      return res.status(500).json({ error: '未配置 WEBHOOK_SECRET 环境变量' });
    }
    if (secret !== WEBHOOK_SECRET) {
      return res.status(403).json({ error: '密钥验证失败' });
    }

    const action = req.query.action || req.body?.action || 'create';

    // ========== 创建卡密（发卡平台调用） ==========
    if (action === 'create' || req.method === 'POST') {
      const quantity = Math.min(req.body?.quantity || 1, 10); // 单次最多 10 张
      const orderNo = req.body?.orderNo || req.body?.order_no || req.body?.out_trade_no || '';
      const buyerContact = req.body?.email || req.body?.contact || req.body?.buyer_email || '';
      const amount = req.body?.amount || req.body?.price || 0;

      const tokens = [];
      for (let i = 0; i < quantity; i++) {
        const token = generateToken();
        await redis.set(`cx:token:${token}`, {
          balance: CARD_BALANCE,
          used: 0,
          total: CARD_BALANCE,
          created: Date.now(),
          lastUsed: null,
          note: orderNo ? `订单:${orderNo}` : '发卡平台自动生成',
          boundIPs: [],
          firstIP: null,
          firstIPTime: null,
          lastIP: null,
          source: 'dujiao',
          orderNo,
          buyerContact,
          amount,
        });
        await redis.sadd('cx:all_tokens', token);
        tokens.push(token);
      }

      // 记录订单
      if (orderNo) {
        await redis.set(`cx:order:${orderNo}`, {
          tokens,
          amount,
          buyerContact,
          created: Date.now(),
        });
      }

      return res.json({
        success: true,
        tokens,
        count: tokens.length,
        balance: CARD_BALANCE,
        message: `已生成 ${tokens.length} 张卡密，每张 ${CARD_BALANCE} 题`,
      });
    }

    // ========== 查询卡密状态（发卡平台查询） ==========
    if (action === 'query') {
      const token = req.body?.token || req.query.token;
      if (!token) {
        return res.status(400).json({ error: '缺少 token 参数' });
      }
      const data = await redis.get(`cx:token:${token}`);
      if (!data) {
        return res.status(404).json({ error: '卡密不存在' });
      }
      return res.json({
        success: true,
        token,
        balance: data.balance,
        used: data.used,
        total: data.total,
        active: data.balance > 0,
      });
    }

    // ========== 验证卡密（给发卡平台用，不绑定IP） ==========
    if (action === 'validate') {
      const token = req.body?.token || req.query.token;
      if (!token) {
        return res.json({ valid: false, error: '缺少卡密' });
      }
      const data = await redis.get(`cx:token:${token}`);
      if (!data) {
        return res.json({ valid: false, error: '卡密不存在' });
      }
      return res.json({
        valid: true,
        balance: data.balance,
        total: data.total,
      });
    }

    return res.status(400).json({ error: '未知操作，支持: create, query, validate' });
  } catch (err) {
    console.error('Webhook error:', err);
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
