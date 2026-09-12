# RED A8 Mind Worker

R 的常驻后台：Private Mind、自己决定下次醒来、连续主动消息、Cron heartbeat、KV 状态和 A8 同步接口。

## 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/hexiangyu481-commits/-erdan-lab-mobile/tree/main/red-a8-worker)

部署时：

- Worker 名建议使用 `red-a8-mind-live`，避免和旧的 Hello World Worker 冲突。
- `OPENROUTER_API_KEY`：填写 R 后台专用 OpenRouter Key。
- `RED_SHARED_TOKEN`：填写 32-64 位随机字符串，并自行保存。
- `RED_STATE`：由 Cloudflare 根据 Wrangler 配置自动创建并绑定 KV。
- Cron：`* * * * *`，由 Wrangler 配置自动创建，每分钟只检查是否到 R 自己设定的 `nextWakeAt`。

部署完成后访问 `/health`。正确结果应是 JSON，包含 `"ok":true` 和 `"name":"red-a8-mind"`，而不是 `Hello World!`。

> OpenRouter Key 和 RED_SHARED_TOKEN 不进入 Git 仓库。
