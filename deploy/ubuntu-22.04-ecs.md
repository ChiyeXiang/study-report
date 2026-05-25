# Ubuntu 22.04 ECS 部署步骤

以下命令在 ECS 上执行。RDS 使用内网地址时，必须在同一 VPC 的 ECS 上跑迁移和后端服务。

## 1. 安装基础依赖

```bash
sudo apt update
sudo apt install -y curl git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v
npm -v
```

## 2. 上传项目

把项目放到：

```bash
sudo mkdir -p /var/www/gpn
sudo chown -R $USER:$USER /var/www/gpn
cd /var/www/gpn
```

可以用 `git clone`，也可以用 `scp/rsync` 上传当前项目文件。

## 3. 配置后端环境变量

```bash
cd /var/www/gpn/backend
cp .env.production.example .env
nano .env
```

把 `.env` 填成服务器真实配置。敏感信息只放在 `.env`，不要写入前端文件。

必填项：

```text
PORT=8787
HOST=127.0.0.1
APP_ORIGIN=*
JWT_SECRET=一串足够长的随机字符串
DB_HOST=你的RDS内网地址
DB_PORT=3306
DB_NAME=report_platform
DB_USER=report_app
DB_PASSWORD=你的RDS密码
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_API_KEY=你的DashScope API Key
LLM_MODEL=qwen-plus
SMS_PROVIDER=mock
LIZHIHUI_SIGNING_SECRET=和荔智惠约定的签名密钥
ADMIN_API_KEY=运营接口密钥
```

短信服务商未正式接入前，`SMS_PROVIDER=mock` 可以跑通注册/登录；正式上线面向真实用户前，需要改成真实短信 provider。

## 4. 安装依赖并建表

```bash
cd /var/www/gpn/backend
npm install --omit=dev
npm run migrate
```

`npm run migrate` 会连接 RDS 并创建/补齐核心表。

## 5. 启动后端

```bash
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
curl http://127.0.0.1:8787/api/health
```

## 6. 部署前端静态文件

```bash
sudo mkdir -p /var/www/gpn-frontend
sudo rsync -av --exclude backend --exclude .git /var/www/gpn/ /var/www/gpn-frontend/
```

编辑前端 API 地址：

```bash
nano /var/www/gpn-frontend/js/config.js
```

如果前端和 API 使用同一个域名，并通过 Nginx 代理 `/api/`，可以配置：

```js
window.GPN_CONFIG = {
  BACKEND_API_BASE: '',
  USE_MOCK: false
};
```

如果 API 单独域名，例如 `https://api.yourdomain.com`，则填完整 API 域名。

## 7. 配置 Nginx

```bash
sudo cp /var/www/gpn/deploy/nginx-gpn.conf.example /etc/nginx/sites-available/gpn
sudo nano /etc/nginx/sites-available/gpn
sudo ln -sf /etc/nginx/sites-available/gpn /etc/nginx/sites-enabled/gpn
sudo nginx -t
sudo systemctl reload nginx
```

先用公网 IP 访问确认页面和 API 可用；域名解析完成后，再配置 HTTPS 证书。

## 8. 常用运维命令

```bash
pm2 status
pm2 logs gpn-backend
pm2 restart gpn-backend
curl http://127.0.0.1:8787/api/health
```

## 9. 正式短信接入还需要提供

- 短信服务商名称，建议阿里云短信
- AccessKey ID
- AccessKey Secret
- 短信签名名称
- 验证码模板 Code
- 模板变量格式，例如 `{ "code": "123456" }`
