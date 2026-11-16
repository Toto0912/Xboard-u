# xboard-u

基于 [cedar2025/Xboard](https://github.com/cedar2025/Xboard) 的面板二次开发项目，搭配 [xboard-node-u](https://github.com/Toto0912/xboard-node-u) 使用。

当前版本：**v2.3.0**，配套节点端 xboard-node-u v2.3.0。

## 二次开发新功能（详见 [二次开发功能说明](docs/二次开发功能说明.md)）

- v2.3.0 新增 [HY2 端口跳跃](docs/HY2-PORT-HOPPING.md)，支持范围端口、固定／随机间隔及节点端自动转发。
- v2.1.1 推送到 Mihomo 内核代理工具的 Reality 订阅将自动启用 X25519MLKEM768 密钥交换选项，以兼容新版 Xray 内核。
- v2.0.0 新增高级配置：[CDN 套用](docs/二次开发功能说明.md#v200)。推送到客户端的订阅、推送到服务端的参数可以分别设置。
- v1.1.3 支持 Sing-box / Xray 原生自定义出站和路由，兼容旧面板出站格式。
- v1.1.2 新增 [Fallback 回落](docs/二次开发功能说明.md#v112)功能。
- v1.1.1 补齐 Clash Meta / Mihomo 的 [XHTTP 上下行分离订阅转换](docs/二次开发功能说明.md#v111)。

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

HY2 配置：[带宽与伪装](docs/HYSTERIA2.md) · [端口跳跃](docs/HY2-PORT-HOPPING.md)。
