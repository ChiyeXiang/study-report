# 荔智惠小程序权益券对接说明

本文档用于和荔智惠技术团队沟通第一期「权益券」接入。目标是先跑通最小闭环：荔智惠负责小程序入口、商品展示、领取/支付动作；我方平台负责创建权益券、查询权益券、核销权益券、同步交付状态。

## 一期目标

用户在荔智惠小程序领取或购买权益后，荔智惠调用我方接口，我方为该用户创建一张可使用的权益券。用户随后可在我方网页完成 AI 报告生成，或在荔智惠小程序预约咨询时使用对应权益。

## 建议上架的权益

| productId | 名称 | 用户权益 | 建议场景 |
| --- | --- | --- | --- |
| `lzh_ai_report_trial` | AI 报告免费体验券 | 免费/优惠体验一次 AI 升学报告 | 首次获客 |
| `lzh_strategy_session` | 全球留学战略咨询抵扣券 | 抵扣一次 45 分钟留学战略咨询 | 报告后转化 |

## 对接流程

1. 荔智惠小程序展示权益券或服务商品。
2. 用户领取、兑换或支付成功。
3. 荔智惠调用我方「领券接口」。
4. 我方创建权益券，并返回券 ID、券码和有效期。
5. 用户使用权益时，我方调用核销逻辑，防止重复使用。
6. 报告生成完成或咨询预约完成后，我方同步交付状态。

## 接口约定

生产域名待定，以下用 `https://api.example.com` 表示。

### 1. 领券接口

`POST /api/v1/lizhihui/coupons/claim`

荔智惠在用户领取或支付成功后调用。

请求示例：

```json
{
  "partnerUserId": "lzh_user_123456",
  "partnerOrderId": "LZH202605230001",
  "productId": "lzh_ai_report_trial",
  "userMobile": "13800000000",
  "userName": "张同学",
  "claimedAt": "2026-05-23T10:30:00+08:00"
}
```

返回示例：

```json
{
  "success": true,
  "coupon": {
    "couponId": "cpn_9f3a21",
    "couponCode": "LZH-GPN-A8K2P1",
    "productId": "lzh_ai_report_trial",
    "status": "active",
    "expiresAt": "2026-08-21T23:59:59+08:00"
  }
}
```

幂等要求：`partnerOrderId` 必须唯一。同一个 `partnerOrderId` 重复请求时，应返回同一张券，不重复发券。

### 2. 查询用户权益券

`GET /api/v1/lizhihui/coupons?partnerUserId=lzh_user_123456`

返回示例：

```json
{
  "success": true,
  "coupons": [
    {
      "couponId": "cpn_9f3a21",
      "couponCode": "LZH-GPN-A8K2P1",
      "productId": "lzh_ai_report_trial",
      "status": "active",
      "expiresAt": "2026-08-21T23:59:59+08:00"
    }
  ]
}
```

### 3. 核销权益券

`POST /api/v1/lizhihui/coupons/redeem`

请求示例：

```json
{
  "couponCode": "LZH-GPN-A8K2P1",
  "partnerUserId": "lzh_user_123456",
  "redeemScene": "ai_report_generation",
  "redeemRefId": "report_202605230001"
}
```

返回示例：

```json
{
  "success": true,
  "couponId": "cpn_9f3a21",
  "status": "redeemed",
  "redeemedAt": "2026-05-23T11:05:00+08:00"
}
```

### 4. 交付状态通知

`POST /api/v1/lizhihui/events/fulfillment`

用于告诉荔智惠：报告已生成、咨询已预约或权益已完成。

请求示例：

```json
{
  "partnerUserId": "lzh_user_123456",
  "partnerOrderId": "LZH202605230001",
  "couponCode": "LZH-GPN-A8K2P1",
  "fulfillmentType": "ai_report_completed",
  "status": "completed",
  "completedAt": "2026-05-23T11:10:00+08:00"
}
```

## 安全验签

建议双方约定一个 `clientId` 和 `clientSecret`。每次请求都带以下 Header：

```text
X-Client-Id: lizhihui
X-Timestamp: 1779513000
X-Nonce: random-string
X-Signature: hex(hmac_sha256(clientSecret, timestamp + "." + nonce + "." + rawBody))
```

我方后端需要校验：

- 时间戳是否在 5 分钟内。
- `nonce` 是否重复。
- 签名是否一致。
- `partnerOrderId` 是否已处理过。

## 我方后端需要的数据表

最小版本建议包含：

- `users`：我方用户账户。
- `partner_users`：荔智惠用户 ID 与我方用户 ID 的绑定关系。
- `coupons`：权益券主表。
- `coupon_redemptions`：核销记录。
- `partner_events`：荔智惠请求与我方回调日志，便于排查问题。

## 二期：包月服务

包月服务不建议第一期就做。等权益券跑通后，可以把服务拆成：

- 月度 AI 报告权益：每月 1 次报告生成或报告更新。
- 月度路径复盘：每月 1 次规划建议更新。
- 顾问咨询抵扣：每月固定金额或固定次数抵扣。

荔智惠已有微信代扣能力时，建议由荔智惠负责微信签约、扣费、续费成功通知。我方只需要提供：

- 订阅开通通知接口。
- 续费成功发权益接口。
- 取消订阅通知接口。
- 查询当前会员权益接口。

二期接口可在一期稳定后再设计，避免一开始范围过大。
