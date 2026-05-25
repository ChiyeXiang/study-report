# GPN 后端服务

这是 Global Pathway Navigator 的第一版后端骨架，用来承接：

- 用户注册、登录、当前用户信息
- 报告生成与保存
- 通义千问 / 阿里云百炼代理调用
- 统一权益、兑换码、会员、荔智惠权益/会员回调

当前版本面向正式上线，数据库使用阿里云 RDS MySQL。服务启动时会自动创建所需数据表。

## 本地启动

1. 进入后端目录：

```bash
cd backend
```

2. 复制环境变量：

```bash
cp .env.example .env
```

3. 编辑 `.env`：

```text
PORT=8787
HOST=127.0.0.1
APP_ORIGIN=*
JWT_SECRET=换成一串足够长的随机字符串
DATABASE_URL=mysql://用户名:密码@阿里云RDS内网或公网地址:3306/数据库名
DASHSCOPE_API_KEY=你的阿里云百炼APIKey
LIZHIHUI_CLIENT_SECRET=和荔智惠约定的接口密钥
ADMIN_API_KEY=运营创建兑换码时使用的密钥
```

4. 启动服务：

```bash
npm run dev
```

5. 健康检查：

```bash
curl http://localhost:8787/api/health
```

## 让前端连接后端

编辑前端配置：

```text
js/config.js
```

本地开发时：

```js
window.GPN_CONFIG = {
  BACKEND_API_BASE: 'http://localhost:8787',
  USE_MOCK: false
};
```

上线后：

```js
window.GPN_CONFIG = {
  BACKEND_API_BASE: 'https://api.yourdomain.com',
  USE_MOCK: false
};
```

注意：真实 API Key 只放在后端 `.env`，不要放进 `js/config.js` 或任何前端文件。

## 生产部署骨架

后端已经准备了 PM2 配置：

```bash
cp .env.production.example .env
npm install --omit=dev
npm install -g pm2
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

前端静态文件可放到：

```text
/var/www/gpn-frontend
```

Nginx 反向代理示例在：

```text
deploy/nginx-gpn.conf.example
```

正式上线时，把 `js/config.js` 的 `BACKEND_API_BASE` 改成你的 API 域名。如果前后端同域部署，也可以改成空前缀下的 `/api` 代理方案。

## 用户接口

### 注册

```bash
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"测试用户","email":"demo@example.com","password":"123456","phone":"13800000000"}'
```

### 登录

```bash
curl -X POST http://localhost:8787/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"123456"}'
```

登录返回的 `token` 后续放到请求头：

```text
Authorization: Bearer <token>
```

## 大模型调用接口

### 通义千问 JSON 代理

```bash
curl -X POST http://localhost:8787/api/v1/ai/qwen-json \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-plus","systemPrompt":"你是报告生成助手，只返回JSON。","userPrompt":"请生成一份测试报告JSON。"}'
```

`DASHSCOPE_API_KEY` 必须配置在后端 `.env` 或服务器环境变量中，不能放在前端。

## 报告接口

### 生成并保存报告

```bash
curl -X POST http://localhost:8787/api/v1/reports \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"reportType":"competitiveness","questionnaireData":{"目标":"本科申请"}}'
```

### 查询我的报告

```bash
curl http://localhost:8787/api/v1/reports \
  -H "Authorization: Bearer <token>"
```

## 兑换码接口

### 创建兑换码批次

这是后端运营接口，不做前台页面。需要 `ADMIN_API_KEY`。

```bash
curl -X POST http://localhost:8787/api/v1/admin/redemption-batches \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: <ADMIN_API_KEY>" \
  -d '{"name":"首批报告权益码","rewardType":"entitlement","count":10}'
```

`rewardType` 只支持：

```text
entitlement
subscription_month
```

### 用户兑换

```bash
curl -X POST http://localhost:8787/api/v1/redemptions/redeem \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"code":"RPT-XXXXXXXX"}'
```

## 荔智惠接口

### 发放报告权益

```bash
curl -X POST http://localhost:8787/api/v1/lizhihui/entitlements/grant \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000000","entitlement_type":"report_once","quantity":1,"external_order_id":"LZH202605230001","pay_status":"paid"}'
```

### 开通会员

```bash
curl -X POST http://localhost:8787/api/v1/lizhihui/subscriptions/activate \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000000","external_order_id":"LZH202605230002","start_time":"2026-05-23T00:00:00+08:00","end_time":"2026-06-23T00:00:00+08:00","pay_status":"paid"}'
```

生产环境建议开启签名校验，签名规则后续和荔智惠技术联调时确认。

## 上线建议

第一阶段可以部署到阿里云香港 ECS：

- Node.js 18+
- 使用进程管理工具，如 PM2
- Nginx 反向代理到 `localhost:8787`
- HTTPS 证书
- `.env` 只保存在服务器，不提交到仓库
- 阿里云 RDS MySQL 开启自动备份
- ECS 安全组只开放 80/443，RDS 只允许 ECS 内网访问
