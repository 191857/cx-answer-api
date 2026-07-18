# 学习通 AI 答题助手 - 商业化部署指南

## 架构概览

```
用户浏览器 (油猴脚本)
    ↓ POST { token, question, options, qtype }
Vercel Serverless API (/api/answer)
    ↓ 验证卡密 → 扣减额度 → 转发
DeepSeek API (AI 答题)
    ↓ 返回答案
Vercel → 用户 (答案 + 剩余额度)
```

**成本极低**：DeepSeek API 约 0.0005 元/题，一张 100 题卡密成本约 0.05 元。

---

## 部署步骤

### 第 1 步：注册 Upstash Redis（免费）

1. 访问 https://upstash.com/ 注册账号
2. 创建一个 Redis 数据库（Global 类型，免费额度 10000 命令/天，足够用）
3. 在数据库详情页找到：
   - `REST URL` — 形如 `https://xxx-xxx.upstash.io`
   - `REST Token` — 一长串密钥
4. 记下这两个值，后面要用

### 第 2 步：获取 DeepSeek API Key

1. 访问 https://platform.deepseek.com/ 注册
2. 充值（1 元即可，足够答几千题）
3. 创建 API Key，以 `sk-` 开头

### 第 3 步：部署到 Vercel（免费）

1. 访问 https://vercel.com/ 注册（推荐用 GitHub 登录）
2. 安装 Vercel CLI（可选，也可网页上传）：
   ```bash
   npm i -g vercel
   ```
3. 进入 `vercel-api` 目录，部署：
   ```bash
   cd vercel-api
   vercel
   ```
   按提示操作，选默认即可。部署后会得到一个 URL，如 `https://cx-answer-api.vercel.app`

4. **设置环境变量**（在 Vercel 网页 → Settings → Environment Variables）：

   | 变量名 | 值 | 说明 |
   |--------|-----|------|
   | `UPSTASH_REDIS_REST_URL` | `https://xxx.upstash.io` | Upstash REST URL |
   | `UPSTASH_REDIS_REST_TOKEN` | `xxxxxx` | Upstash REST Token |
   | `DEEPSEEK_API_KEY` | `sk-xxxxxx` | DeepSeek API Key |
   | `ADMIN_PASSWORD` | `你的管理密码` | 管理后台密码，建议改复杂 |

5. 重新部署使环境变量生效：
   ```bash
   vercel --prod
   ```

### 第 4 步：管理卡密

1. 访问 `https://你的域名/admin`
2. 输入 `ADMIN_PASSWORD` 登录
3. 点击"生成卡密"，设置每张额度和数量
4. 复制生成的卡密（格式 `CX-XXXX-XXXX-XXXX`），发给买家

### 第 5 步：配置油猴脚本

1. 打开 `学习通AI答题助手-商业化版.user.js`
2. 找到 `API_BASE` 变量，改成你的 Vercel 域名：
   ```javascript
   var API_BASE = 'https://cx-answer-api.vercel.app';
   ```
3. 安装到 Tampermonkey
4. 打开学习通作业页面 → 输入卡密 → 开始答题

---

## 文件结构

```
vercel-api/
├── api/
│   ├── answer.js      # 答题 API（用户调用）
│   └── admin.js       # 管理 API（生成/查看/删除卡密）
├── public/
│   └── admin.html     # 卡密管理后台页面
├── package.json
├── vercel.json
└── README.md          # 本文件
```

---

## API 接口说明

### POST /api/answer — 答题接口

**请求体：**
```json
{
  "token": "CX-XXXX-XXXX-XXXX",
  "question": "题目内容",
  "options": [{ "label": "A.", "text": "选项A内容" }, ...],
  "qtype": "单选题"
}
```

**响应：**
```json
{
  "answer": "A",
  "balance": 99,
  "model": "deepseek-chat"
}
```

**错误：**
- 401 — 卡密无效或缺少卡密
- 403 — 额度已用完
- 502 — AI 服务不可用

### GET /api/admin?action=stats — 统计

### GET /api/admin?action=list — 列出所有卡密

### POST /api/admin — 生成/删除/查日志

```json
// 生成卡密
{ "action": "generate", "count": 100, "quantity": 5, "note": "备注" }

// 删除卡密
{ "action": "revoke", "token": "CX-XXXX-XXXX-XXXX" }

// 查日志
{ "action": "logs", "token": "CX-XXXX-XXXX-XXXX" }
```

---

## 盈利模式

| 项目 | 说明 |
|------|------|
| 脚本 | 免费，发布到 Greasy Fork |
| API | 按题收费，通过卡密充值 |
| 定价建议 | 100题卡密 = 5~10 元（成本 0.05 元，利润 99%） |
| 渠道 | 闲鱼/淘宝/微信 |

### Greasy Fork 发布注意事项

脚本 metadata 必须包含：
```javascript
// @antifeature payment 付费答题 - 本脚本免费，AI 答题功能需要购买卡密
```

---

## 常见问题

**Q: 免费额度够用吗？**
A: Vercel 免费版每月 100GB 流量 + 100GB-Hours Serverless 执行时间，单次答题约 2-3KB 流量，足够几万次调用。Upstash 免费 10000 命令/天，也够用。

**Q: 会被封吗？**
A: Vercel/Upstash/DeepSeek 都是正规云服务，不会封。学习通那边只要不作弊太明显（全部满分+秒答）一般不会查。

**Q: 如何修改管理密码？**
A: 在 Vercel 环境变量中修改 `ADMIN_PASSWORD`，然后重新部署。

**Q: 如何查看某个卡密用了多少？**
A: 管理后台 → 卡密列表 → 查看"已用"列，或点"日志"查看详细记录。

**Q: DeepSeek 余额用完了怎么办？**
A: 去 DeepSeek 平台充值即可，1 元够用几千题。

---

## 下一步优化方向

- [ ] 增加卡密有效期（到期自动失效）
- [ ] 增加 IP 限制（防止卡密被多人共享）
- [ ] 增加答题频率限制（防刷）
- [ ] 支持微信/支付宝自动发卡（对接发卡平台）
- [ ] 增加更多 AI 模型（GPT-4o、通义千问等）
