# xboard-u

基于 [cedar2025/Xboard](https://github.com/cedar2025/Xboard) 的面板二次开发项目，搭配 [xboard-node-u](https://github.com/Toto0912/xboard-node-u) 使用。

当前版本：**v2.2.0**，配套节点端 xboard-node-u v2.2.0。

## 二次开发新功能（详见 [二次开发功能说明](docs/二次开发功能说明.md)）

- v2.2.0 补齐 [Stash XHTTP 订阅](docs/二次开发功能说明.md#stash-xhttp-订阅v220)，修复 [旧版 Clash 默认模板及空节点分组](docs/二次开发功能说明.md#旧版-clash-订阅兼容v220)。
- v2.2.0 修复 HY2 带宽映射，新增自动 BBR / Brutal 协商及 Masquerade，详见 [HY2 配置说明](docs/HYSTERIA2.md)。
- v2.1.2 修复 CDN 分离后的监听端口显示，并将 Xray 自定义出站和路由的生成示例与文档对齐。
- v2.1.1 为 Mihomo / Clash Meta、Stash 输出的 Reality 订阅自动启用 X25519MLKEM768 密钥交换选项。
- v2.1.0 优化设备同步、Redis、队列和数据库批量写入，修复重连时的设备状态清理，并默认下发 IPv4/IPv6 双栈监听。
- v2.0.0 新增 [CDN 套用](docs/二次开发功能说明.md#cdn-套用v200)，允许分别配置订阅入口和节点监听。

- v1.1.3 支持 Sing-box / Xray 原生自定义出站和路由，兼容旧面板出站格式。
- 新增 Fallback 配置，TLS / Reality 均使用 Xray 原生协议层回落，保留 Reality 原目标。
- v1.1.1 补齐 Clash Meta / Mihomo 的 XHTTP 上下行分离订阅转换，详见[配置说明](docs/二次开发功能说明.md#xhttp-上下行分离订阅v111)。
- 修复 TLS 内容推送保存，适配 xboard-node-u 安装，并更新默认订阅模板。

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

## 📖 安装与迁移

- [使用 aaPanel + Docker 部署（推荐，MySQL）](docs/AAPANEL-MYSQL-UPGRADE.md)
- [从原版 Xboard 迁移到 xboard-u](docs/UPGRADE-XBOARD-U.md)

## 许可

沿用 [MIT License](LICENSE)，保留上游版权信息。版本变化见 [CHANGELOG](CHANGELOG.md)。

## 自定义出站与路由

以下内容在面板的节点高级设置中填写，不在本地服务器配置文件中填写。

- [自定义出站](docs/CUSTOM-OUTBOUNDS.md)
- [自定义路由](docs/CUSTOM-ROUTES.md)
