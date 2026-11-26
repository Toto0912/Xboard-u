# xboard-u

基于 [cedar2025/Xboard](https://github.com/cedar2025/Xboard) 的面板二次开发项目，搭配 [xboard-node-u](https://github.com/Toto0912/xboard-node-u) 使用。

当前面板与配套节点版本均为 **v2.4.1**。

## 二次开发功能

- **v2.4.1** 改进节点撤权、流量上报去重、支付对账与套餐名额预留。升级会运行数据库迁移，先更新面板，再更新节点。[本版发布说明](docs/releases/v2.4.1.md)
- [v2.4 系列功能说明](docs/v2.4%20-%20lastest%20二次开发功能说明.md) · [v1.0 至 v2.3 功能说明](docs/v1.0%20-%20v2.3%20二次开发功能说明.md)

### 已有功能

  - **全量开源管理端与用户端界面**：彻底移除原版闭源前端编译产物及补丁脚本，采用 React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + Shadcn UI 完整重构管理后台（`admin-frontend/`，覆盖 18 个模块、离线版 Monaco Editor、中／英／俄三语、拖拽排序）与默认用户端（`user-frontend/`，支持 8 种语言，含 RTL），统一深海蓝／牛奶白双主题配色。
  - **HY2 端口跳跃与带宽／伪装**：支持连接／服务连续端口范围、固定或随机跳跃间隔及节点端自动转发（详见 [HY2 端口跳跃](docs/HY2-PORT-HOPPING.md)），并支持 [带宽方向换算与 Masquerade 伪装](docs/HYSTERIA2.md)。
  - **CDN 套用（客户端／服务端分离）**：支持推送到客户端的订阅参数与下发到节点的服务端监听参数分别设置与一键同步（详见 [CDN 套用](docs/v1.0%20-%20v2.3%20二次开发功能说明.md#v200)）。
  - **现代客户端订阅转换与默认模板升级**：补齐 Clash Meta / Mihomo 与 Stash 的 [XHTTP 上下行分离](docs/v1.0%20-%20v2.3%20二次开发功能说明.md#v111)，为 Mihomo / Stash Reality 订阅自动启用 `X25519MLKEM768` 密钥交换，完善新版 Surge（VLESS / XHTTP / TUIC / HY2）与旧版 Clash 兼容，并刷新 Sing-box、Clash、Clash Meta / Stash、Surge 默认订阅模板。
  - **自定义出站、路由与 Fallback 回落**：支持 Sing-box / Xray 原生[自定义出站](docs/CUSTOM-OUTBOUNDS.md)与[自定义路由](docs/CUSTOM-ROUTES.md)（兼容旧面板格式），以及 VLESS / Trojan [Fallback 回落](docs/v1.0%20-%20v2.3%20二次开发功能说明.md#v112)。
  - **双栈监听与在线／统计优化**：默认下发双栈监听 `listen_ip: "::"`，优化设备快照同步、队列预算与流量写入，并将节点「在线人数」调整为按最近 10 分钟内单次上报达 64 KiB 门槛去重统计。

## 🚀 Quick Start

适合使用 SQLite 快速部署全新面板。请先安装 Git、Docker 和 Docker Compose v2，在终端执行：

```bash
git clone -b main --depth 1 https://github.com/Toto0912/Xboard-u.git && \
cd Xboard-u && \
cp compose.sample.yaml compose.yaml && \
touch .env && \
docker compose run -it --rm \
    -e ENABLE_SQLITE=true \
    -e ENABLE_REDIS=true \
    -e ADMIN_ACCOUNT=admin@example.com \
    xboard php artisan xboard:install && \
docker compose up -d
```

> 安装后访问：`http://服务器IP:7001`。请保存安装时显示的管理员邮箱、密码和管理后台地址。
>
> `admin@example.com` 可替换成自己的管理员邮箱。已有面板请使用迁移指南，不要重新初始化。

### 更新

先备份数据库和配置，然后在原安装目录执行，与原版相同：

```bash
docker compose pull && docker compose up -d
```

### 支付渠道停用与 BTCPay 旧单对账

旧 Coinbase Commerce 渠道在本版自动停用，历史收款记录保留。对仍受支持的支付插件，停用渠道会关闭新结账。请保留原渠道配置和验签密钥，让已签发的付款单继续接收到账通知。已取消订单的已核实收款可用 `php artisan payment:review-cancelled` 查询。

BTCPay 新发票使用结账时保存的站点币种和含手续费金额，欠付容差设为零。回调会重新查询网关发票，确认足额结算后开通。

升级前签发的发票固定使用 CNY，部分旧订单没有保存当时的站点币种。面板会将能够关联原渠道、核实结算且金额匹配的这类收款登记为 `verify_history`，留待人工核账。运行 `php artisan payment:review-additional --trade-no=订单号` 可查看记录。请对照网关发票及原订单处理后再标记已核对。

### 节点流量上报去重

使用配套 Compose 时，先更新面板，再更新或重启节点即可。面板在流量批次迁移完成后自动宣告这项能力，旧 `.env` 中的 `TRAFFIC_BATCH_V1_ENABLED` 可以保留，其取值已不再参与协商。自定义部署按原升级流程执行 `php artisan migrate --force`，多实例部署应先将所有提供节点 API 的实例更新到支持批次接收的版本。

兼容节点在握手时切换，机器模式也会在周期发现时刷新。一直保持 WebSocket 在线的静态节点可随升级重启以重新握手。旧版节点继续沿用原协议。升级前已发出且回执丢失的旧上报没有批次编号，无法追溯去重。

如果部署为迁移和面板运行分别使用数据库账号，请授予面板账号读取主库迁移记录表（默认为 `migrations`）的权限。读取被拒绝时，能力协商返回 HTTP 503，恢复权限后节点可在下次协商时切换。

节点把待确认批次写入持久化目录。配套 Compose 已挂载 `./data`，自定义部署默认使用 `kernel.config_dir/traffic-batches`，也可用 `XBOARD_NODE_TRAFFIC_DIR` 指定可写持久目录。保留原面板 URL 和节点 ID，以便重启后续传。向外部系统写数据的流量插件可用 `$server['traffic_batch']` 中的 `server_id` 和 `batch_id` 去重。

批次回执表示面板已把本批流量和待办任务存入数据库。使用异步队列时，请确保新版 Horizon 或自建 worker 消费 `traffic_batch`，并保持 Laravel 每分钟调度。运行 `php artisan traffic:batches --status` 可查看待办数量、最老待办时长、重复请求和内容冲突。

**回退时保留批次接收端、消费者、调度器及数据库回执。** 若需停止协商新批次，可先退到仍支持批次接收且能关闭能力宣告的面板版本，让节点重新协商。等所有节点（含离线后恢复的节点）补传完成、面板待办清空后，再撤下接收服务。保留去重记录供以后升级使用。

## 📖 安装与迁移

- [使用 aaPanel + Docker 部署（推荐，MySQL）](docs/AAPANEL-MYSQL-UPGRADE.md)
- [从原版 Xboard 迁移到 xboard-u](docs/UPGRADE-XBOARD-U.md)

## 许可

沿用 [MIT License](LICENSE)，保留上游版权信息。版本变化见 [CHANGELOG](CHANGELOG.md)。

## 自定义出站与路由

以下内容在面板的节点高级设置中填写，不在本地服务器配置文件中填写。

- [自定义出站](docs/CUSTOM-OUTBOUNDS.md)
- [自定义路由](docs/CUSTOM-ROUTES.md)

HY2 配置：[带宽与伪装](docs/HYSTERIA2.md) · [端口跳跃](docs/HY2-PORT-HOPPING.md)。
