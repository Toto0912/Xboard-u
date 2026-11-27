# xboard-u

基于 [cedar2025/Xboard](https://github.com/cedar2025/Xboard) 的面板二次开发项目，搭配 [xboard-node-u](https://github.com/Toto0912/xboard-node-u) 使用。

## 二次开发功能

v2.4 **全量开源管理端与用户端界面**，彻底移除原版闭源前端编译产物及补丁脚本。升级会运行数据库迁移，请先更新面板，再更新节点。详见 [v2.4 - lastest 二次开发功能说明](docs/v2.4%20-%20lastest%20二次开发功能说明.md#v242)。

支持以往版本的全部功能，详见 [v1.0 - v2.3 二次开发功能说明](docs/v1.0%20-%20v2.3%20二次开发功能说明.md)。
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

先备份数据库和配置，然后在原安装目录执行：

```bash
docker compose pull && docker compose up -d
```

旧面板镜像由 Docker 管理，Linux 默认存放在 `/var/lib/docker`（经典存储驱动）或 `/var/lib/containerd`（containerd 镜像存储）。如需清理，可在更新前用 `docker compose images -q xboard` 记下镜像 ID，确认新版运行正常后用 `docker image rm <旧镜像ID>` 删除旧镜像。

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
