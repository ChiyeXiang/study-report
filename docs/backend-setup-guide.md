# 后端接入与大模型调用实施建议

当前网页是纯前端静态页面，适合演示，但不适合正式上线承载用户账户、报告数据和大模型 API Key。项目中已经新增第一版后端骨架：

```text
backend/
```

这个后端现在按正式上线目标使用阿里云 RDS MySQL。数据库连接通过后端环境变量配置：

```text
DATABASE_URL=mysql://用户名:密码@阿里云RDS地址:3306/数据库名
```

服务启动时会自动创建用户、问卷、报告、权益、会员、兑换码、荔智惠事件等核心数据表。

## 为什么必须接后端

前端网页里的代码所有访问者都能看到，所以不能放：

- 阿里云百炼 / 通义千问 API Key
- 用户密码
- 用户手机号、问卷、报告等长期数据
- 荔智惠接口密钥

后端的作用是：

- 保存用户账户、报告、权益券、订单记录。
- 安全保存大模型 API Key。
- 代替前端调用通义千问。
- 给荔智惠提供领券、查券、核销接口。
- 未来支持微信支付、包月、自动续费权益发放。

## 推荐架构

第一阶段建议：

```text
Cloudflare Pages / 静态前端
        |
        | HTTPS
        v
后端 API 服务
        |
        +-- PostgreSQL / MySQL 数据库
        +-- 阿里云百炼通义千问 API
        +-- 荔智惠小程序接口
```

如果希望国内访问更稳定，后端可以部署在阿里云香港 ECS；如果后续备案，也可以迁到阿里云大陆 ECS。

## 后端技术选型

轻量、好维护的选择：

- Node.js + Express / Fastify
- 阿里云 RDS MySQL
- Prisma 作为数据库 ORM

也可以用：

- Python FastAPI
- Java Spring Boot

当前仓库里的 `backend/server.js` 使用 Node.js 原生 HTTP 模块和 `mysql2` 连接阿里云 RDS MySQL。

## 当前已实现的后端骨架

```text
backend/server.js
backend/.env.example
backend/README.md
阿里云 RDS MySQL
```

已实现：

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/me`
- `POST /api/v1/ai/qwen-json`
- `POST /api/v1/reports`
- `GET /api/v1/reports`
- `GET /api/v1/reports/:id`
- `POST /api/v1/lizhihui/coupons/claim`
- `GET /api/v1/lizhihui/coupons`
- `POST /api/v1/lizhihui/coupons/redeem`
- `POST /api/v1/lizhihui/events/fulfillment`

启动方式见：

```text
backend/README.md
```

## 最小数据表

### users

保存用户账户。

```text
id
name
email
phone
password_hash
created_at
```

### reports

保存用户生成过的报告。

```text
id
user_id
report_type
questionnaire_data
report_data
status
created_at
```

### coupons

保存代金券 / 权益券。

```text
id
user_id
coupon_code
source
partner_user_id
partner_order_id
product_id
amount
status
expires_at
created_at
redeemed_at
```

### partner_events

保存荔智惠请求日志，方便排查。

```text
id
partner
event_type
request_body
response_body
created_at
```

## 第一批后端接口

### 用户账户

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/me
```

### 报告生成

```text
POST /api/v1/reports
GET  /api/v1/reports
GET  /api/v1/reports/:id
```

`POST /api/v1/reports` 由后端调用通义千问生成报告，并把结果保存到数据库。

### 前端调用后端大模型代理

当前前端已预留：

```js
window.GPN_CONFIG = {
  BACKEND_API_BASE: 'https://你的后端域名',
  USE_MOCK: false
};
```

前端配置文件在：

```text
js/config.js
```

后端已提供：

```text
POST /api/v1/ai/qwen-json
```

请求：

```json
{
  "model": "qwen-plus",
  "systemPrompt": "...",
  "userPrompt": "..."
}
```

返回：

```json
{
  "data": {
    "overallScore": 73,
    "reportSummary": "..."
  }
}
```

正式版本更建议前端只提交问卷数据，不提交完整 prompt，由后端统一组装 prompt。

### 荔智惠权益券

详见：

```text
docs/lizhihui-integration.md
```

## 环境变量

后端服务器保存这些变量：

```text
DASHSCOPE_API_KEY=你的阿里云百炼APIKey
DASHSCOPE_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
DATABASE_URL=postgresql://...
JWT_SECRET=随机长字符串
LIZHIHUI_CLIENT_SECRET=双方约定的接口密钥
```

这些都不能写到前端代码里。

## 推荐实施顺序

1. 先保留当前静态前端，修好用户体验。
2. 新建后端项目，实现注册、登录、报告保存。
3. 把前端 localStorage 登录改成调用后端登录。
4. 把报告生成改成调用后端，由后端调用通义千问。
5. 接入荔智惠权益券接口。
6. 跑通后再设计包月服务和微信代扣权益发放。

## 关于包月服务

包月服务建议第二期做。荔智惠已有微信代扣能力时，我方后端只需要接收：

- 订阅开通通知
- 续费成功通知
- 取消订阅通知
- 每月权益发放通知

不要一开始就把报告、支付、代扣、权益、核销全部同时上线，风险会高很多。
