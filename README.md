# xboard-u

基于 [cedar2025/Xboard](https://github.com/cedar2025/Xboard) 的面板二次开发项目，搭配 [xboard-node-u](https://github.com/Toto0912/xboard-node-u) 使用。

## ✨ 功能

- 修复 HY2 等节点 TLS 内容推送配置保存后重新打开为空的问题。
- 机器安装命令使用 xboard-node-u 正式发布资源，支持普通 Linux 和 Alpine/OpenRC。
- 保留原版数据库、主题及节点通信接口，支持从原版迁移。
- 提供 Linux amd64 / arm64 Docker 镜像：`ghcr.io/toto0912/xboard-u:latest`。

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
