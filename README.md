README.md
学习通 AI 答题助手 - 商业化部署指南
架构概览
用户浏览器 (油猴脚本)
    ↓ POST { token, question, options, qtype }
Vercel Serverless API (/api/answer)
    ↓ 验证卡密 → IP限制检查 → 扣减额度 → 转发
DeepSeek API (AI 答题)
    ↓ 返回答案
Vercel → 用户 (答案 + 剩余额度)

发卡平台 (独角数卡/异次元)
    ↓ 用户支付 (微信/支付宝)
    ↓ Webhook 回调 /api/webhook
Vercel → 自动生成卡密 → 发给买家
成本极低：DeepSeek API 约 0.0005 元/题，一张 5000 题卡密成本约 2.5 元。

部署步骤
第 1 步：注册 Upstash Redis（免费）
访问 https://upstash.com/ 注册账号
创建一个 Redis 数据库（Global 类型，免费额度 10000 命令/天，足够用）
在数据库详情页找到：
REST URL — 形如 https://xxx-xxx.upstash.io
REST Token — 一长串密钥
记下这两个值，后面要用
第 2 步：获取 DeepSeek API Key
访问 https://platform.deepseek.com/ 注册
充值（1 元即可，足够答几千题）
创建 API Key，以 sk- 开头
第 3 步：部署到 Vercel（免费）
访问 https://vercel.com/ 注册（推荐用 GitHub 登录）

安装 Vercel CLI（可选，也可网页上传）：

bash
npm i -g vercel
进入 vercel-api 目录，部署：

bash
cd vercel-api
vercel
按提示操作，选默认即可。部署后会得到一个 URL，如 https://cx-answer-api.vercel.app

设置环境变量（在 Vercel 网页 → Settings → Environment Variables）：

变量名	值	说明
UPSTASH_REDIS_REST_URL	https://xxx.upstash.io	Upstash REST URL
UPSTASH_REDIS_REST_TOKEN	xxxxxx	Upstash REST Token
DEEPSEEK_API_KEY	sk-xxxxxx	DeepSeek API Key
ADMIN_PASSWORD	你的管理密码	管理后台密码，建议改复杂
WEBHOOK_SECRET	你的webhook密钥	发卡平台回调验证密钥
CARD_BALANCE	5000	webhook自动发卡时每张卡密的题数
重新部署使环境变量生效：

bash
vercel --prod
第 4 步：管理卡密
访问 https://你的域名/admin
输入 ADMIN_PASSWORD 登录
点击"生成卡密"，设置每张额度（默认5000题）和数量
复制生成的卡密（格式 CX-XXXX-XXXX-XXXX），发给买家
第 5 步：配置油猴脚本
打开 学习通AI答题助手-商业化版.user.js
找到 API_BASE 变量，改成你的 Vercel 域名：
javascript
var API_BASE = 'https://cx-answer-api.vercel.app';
安装到 Tampermonkey
打开学习通作业页面 → 输入卡密 → 开始答题
IP 限制机制（防共享）
每张卡密最多绑定 3 个 IP（容错校园网切换 WiFi、手机热点等场景）：

首次使用：自动绑定调用者 IP
后续使用：检查 IP 是否在绑定列表中
新 IP：未达上限时自动添加（容错），已达上限则拒绝
IP 锁定：达到 3 个 IP 后，新 IP 无法使用，返回 IP_LIMIT_EXCEEDED 错误
管理员解绑：在管理后台点击"解绑"按钮，清除该卡密的所有 IP 绑定
批量解绑：管理后台"批量解绑IP"按钮，一键清除所有卡密的 IP 绑定
IP 获取方式
Vercel 环境下通过 x-forwarded-for 请求头获取客户端真实 IP（第一个值为客户端 IP）。

发卡平台对接（微信/支付宝自动发卡）
方式一：独角数卡自动发卡（推荐）
独角数卡 是开源的发卡系统，支持微信/支付宝收款。

部署独角数卡：参考其官方文档，部署到你的服务器或虚拟主机
配置支付：在独角数卡后台配置微信支付/支付宝支付参数
批量生成卡密：
在本系统管理后台 → 生成卡密 → 设置数量（如100张）
点击"导出CSV"下载卡密列表
创建商品：
独角数卡后台 → 商品管理 → 新建商品
商品类型选「自动发卡」
将卡密列表粘贴到库存中
设置售价
上架销售：用户支付后独角数卡自动从库存取一张卡密发给买家
方式二：Webhook 自动生成卡密
适合需要实时生成卡密的场景（不预先生成库存）：

在 Vercel 环境变量中设置 WEBHOOK_SECRET（自定义密钥）
在发卡平台配置 Webhook 回调地址：
POST https://你的域名/api/webhook
Header: X-Webhook-Secret: 你的密钥
Body: { "orderNo": "订单号", "quantity": 1, "amount": 9.9, "email": "买家邮箱" }
用户支付成功后，发卡平台调用 webhook → 自动生成卡密 → 返回给发卡平台 → 发给买家
方式三：手动发卡
在管理后台生成卡密
复制卡密发给买家（微信/QQ/闲鱼等渠道）
定价建议（5000题/张）
成本分析
项目	金额
DeepSeek API（5000题）	约 2.5 元
Vercel 免费版	0 元
Upstash 免费版	0 元
总成本	约 2.5 元/张
推荐定价
定价	利润	利润率	适用场景
9.9 元	7.4 元	75%	薄利多销，快速获客
15.9 元	13.4 元	84%	促销价，限时活动
19.9 元	17.4 元	88%	推荐价，利润与销量平衡
29.9 元	27.4 元	92%	高价，适合小众市场
39.9 元	37.4 元	94%	奢侈品定价，风险较高
最终建议：19.9 元/张
理由：

大学生承受范围内：相当于一顿外卖或两杯奶茶的价格
5000题足够一整个学期：平均一门课100-200题，5000题可覆盖25-50门课
利润率88%：每张赚17.4元，卖100张就是1740元
不易被二手倒卖：IP限制3个设备，价格也不低到值得倒卖
比竞品有优势：市面刷课服务通常10-30元/门，5000题可刷几十门课
营销策略
开学季促销：15.9元/张，限时一周
团购优惠：3张以上 14.9元/张
老带新：推荐好友购买，双方各减2元
发布渠道：闲鱼、淘宝、微信群、QQ群、校园论坛
文件结构
vercel-api/
├── api/
│   ├── answer.js      # 答题 API（用户调用，含IP限制）
│   ├── verify.js      # 卡密验证 API（轻量验证，不调AI）
│   ├── admin.js       # 管理 API（生成/查看/删除/解绑IP/导出CSV）
│   └── webhook.js     # 发卡平台 Webhook 回调（自动生成卡密）
├── public/
│   └── admin.html     # 卡密管理后台页面
├── package.json
├── vercel.json
└── README.md          # 本文件
API 接口说明
POST /api/answer — 答题接口
请求体：

json
{
  "token": "CX-XXXX-XXXX-XXXX",
  "question": "题目内容",
  "options": [{ "label": "A.", "text": "选项A内容" }, ...],
  "qtype": "单选题"
}
响应：

json
{
  "answer": "A",
  "balance": 4999,
  "model": "deepseek-chat"
}
错误：

401 — 卡密无效或缺少卡密
403 — 额度已用完 / IP限制超出（IP_LIMIT_EXCEEDED）
502 — AI 服务不可用
POST /api/verify — 卡密验证（轻量）
请求体： { "token": "CX-XXXX-XXXX-XXXX" }
响应： { "success": true, "balance": 5000, "boundIPs": 1, "maxIPs": 3 }

POST /api/webhook — 发卡平台回调
请求头： X-Webhook-Secret: 你的密钥
请求体：

json
{
  "orderNo": "ORDER123",
  "quantity": 1,
  "amount": 19.9,
  "email": "buyer@example.com"
}
响应：

json
{
  "success": true,
  "tokens": ["CX-XXXX-XXXX-XXXX"],
  "count": 1,
  "balance": 5000
}
GET/POST /api/admin — 管理接口
需要 Authorization: Bearer <ADMIN_PASSWORD> 请求头。

json
// 生成卡密
{ "action": "generate", "count": 5000, "quantity": 10, "note": "备注" }

// 列出所有卡密
GET /api/admin?action=list

// 删除卡密
{ "action": "revoke", "token": "CX-XXXX-XXXX-XXXX" }

// 解绑IP（单张）
{ "action": "unbind_ip", "token": "CX-XXXX-XXXX-XXXX" }

// 批量解绑IP
{ "action": "unbind_ip_all" }

// 查看使用日志
{ "action": "logs", "token": "CX-XXXX-XXXX-XXXX" }

// 导出CSV
GET /api/admin?action=export

// 统计
GET /api/admin?action=stats
常见问题
Q: 免费额度够用吗？
A: Vercel 免费版每月 100GB 流量 + 100GB-Hours Serverless 执行时间，单次答题约 2-3KB 流量，足够几万次调用。Upstash 免费 10000 命令/天，也够用。

Q: IP限制会不会误伤正常用户？
A: 每张卡密允许3个IP（覆盖手机WiFi、校园网、热点切换），正常使用不会触发限制。如遇特殊情况，管理员可一键解绑。

Q: 发卡平台必须用独角数卡吗？
A: 不一定。任何支持"自动发卡"商品类型的发卡系统都可以（异次元发卡、卡盟等），或者用 Webhook 方式对接任何自研系统。

Q: 如何修改管理密码？
A: 在 Vercel 环境变量中修改 ADMIN_PASSWORD，然后重新部署。

Q: DeepSeek 余额用完了怎么办？
A: 去 DeepSeek 平台充值即可，1 元够用几千题。

Q: 5000题大概能用多久？
A: 一门课通常有100-200道题（含视频检测题+章节测验），5000题可覆盖25-50门课，足够一整个学期。
