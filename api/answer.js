import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { token, question, options, qtype } = req.body;

    // 1. Validate token
    if (!token) {
      return res.status(401).json({ error: '缺少卡密' });
    }

    const keyData = await redis.get(`cx:token:${token}`);
    if (!keyData) {
      return res.status(401).json({ error: '卡密无效，请检查或联系卖家' });
    }

    if (keyData.balance <= 0) {
      return res.status(403).json({ error: '额度已用完，请购买新卡密' });
    }

    // 2. Build prompt
    const prompt = buildPrompt(question, options, qtype);

    // 3. Call DeepSeek
    const aiResponse = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个知识渊博、严谨准确的大学助教。根据题目选择或写出最准确的答案。选择题只输出字母，判断题只输出对/错，填空题/简答题简洁回答。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('DeepSeek error:', errText);
      return res.status(502).json({ error: 'AI 服务暂时不可用，请稍后重试' });
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices?.[0]?.message?.content?.trim() || '';

    // 4. Deduct balance
    const newBalance = keyData.balance - 1;
    await redis.set(`cx:token:${token}`, {
      ...keyData,
      balance: newBalance,
      used: (keyData.used || 0) + 1,
      lastUsed: Date.now(),
    });

    // 5. Log (keep last 100 logs)
    await redis.lpush(`cx:logs:${token}`, {
      q: (question || '').substring(0, 100),
      a: answer.substring(0, 100),
      t: Date.now(),
    });
    await redis.ltrim(`cx:logs:${token}`, 0, 99);

    return res.status(200).json({
      answer,
      balance: newBalance,
      model: 'deepseek-chat',
    });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: '服务器内部错误' });
  }
}

function buildPrompt(question, options, qtype) {
  const lines = [];

  if (!qtype || qtype.includes('单选')) {
    lines.push('这是一道单选题，请只输出正确选项的字母（如：A）。');
    lines.push('');
    lines.push('题目：' + question);
    if (options && options.length > 0) {
      lines.push('选项：');
      options.forEach(opt => lines.push(opt.label + ' ' + opt.text));
    }
    lines.push('答案：');
  } else if (qtype.includes('多选')) {
    lines.push('这是一道多选题，请只输出所有正确选项的字母，用逗号分隔（如：A,C,D）。');
    lines.push('');
    lines.push('题目：' + question);
    if (options && options.length > 0) {
      lines.push('选项：');
      options.forEach(opt => lines.push(opt.label + ' ' + opt.text));
    }
    lines.push('答案：');
  } else if (qtype.includes('判断')) {
    lines.push('这是一道判断题，请只输出"对"或"错"。');
    lines.push('');
    lines.push('题目：' + question);
    lines.push('答案：');
  } else {
    lines.push('请简洁回答以下题目，控制在200字以内。');
    lines.push('');
    lines.push('题目：' + question);
    lines.push('答案：');
  }

  return lines.join('\n');
}
