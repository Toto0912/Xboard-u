# 使用 aaPanel + Docker 部署 xboard-u

适合 aaPanel 管理 Nginx 和 MySQL、Docker 运行面板的全新安装。流程参考[原项目部署指南](https://github.com/cedar2025/Xboard/blob/master/docs/en/installation/aapanel-docker.md)，面板仓库及镜像改为 xboard-u。

已有 Xboard 面板请阅读[迁移指南](UPGRADE-XBOARD-U.md)，不要对已有数据库执行安装命令。

## 环境要求

- Linux 服务器，建议至少 1 核 CPU、2 GB 内存及 10 GB 可用空间。
- aaPanel、Git、Docker 和 Docker Compose v2。
- 在 aaPanel 中安装 Nginx、MySQL 5.7 或更新版本。
- 宿主机无需另装 PHP 和 Redis；Docker 镜像已包含所需运行环境。

## 1. 准备运行环境

没有 aaPanel 时，先按 [aaPanel 官方说明](https://www.aapanel.com/new/download.html)安装。已有 aaPanel 可跳过。

如尚未安装 Docker，沿用原项目的安装命令：

```bash
curl -sSL https://get.docker.com | bash
```

安装后确认 Docker 已运行，并在 aaPanel 中安装 Nginx 和 MySQL。

## 2. 创建网站和数据库

在 aaPanel 的“网站 → 添加站点”中：

1. 填写面板域名。
2. 数据库选择 MySQL，创建一个空数据库，并记下数据库名、用户名和密码。
3. PHP 版本选择“纯静态”。

## 3. 下载并初始化面板

进入新网站目录，将 `your-domain` 换成实际网站目录名：

```bash
cd /www/wwwroot/your-domain
```

仅在**新建的空站点**中删除 aaPanel 自动生成的默认页面。已有网站的文件、数据库和 `.env` 不要清理：

```bash
# 存在 .user.ini 时先解除它的只读属性
if [ -f .user.ini ]; then chattr -i .user.ini; fi
rm -f .htaccess 404.html 502.html index.html .user.ini
```

按原版流程克隆仓库、准备 host 网络编排，然后初始化：

```bash
git clone -b main --depth 1 https://github.com/Toto0912/Xboard-u.git ./
cp compose.host.sample.yaml compose.yaml
touch .env
docker compose run -it --rm xboard php artisan xboard:install
```

交互界面选择 MySQL，填写刚创建的空数据库信息；aaPanel 的 MySQL 运行在宿主机时，通常填写 `127.0.0.1` 和 `3306`。Redis 选择容器内置 Redis。

> 请保存安装时显示的管理后台地址、管理员邮箱和密码。
>
> xboard-u 使用 `main` 分支，因此比原项目的 `compose` 分支多了创建空 `.env` 的步骤。应用代码和管理前端来自镜像，不需要在宿主机安装依赖或初始化前端子模块。

## 4. 启动面板

```bash
docker compose up -d
```

## 5. 配置 Nginx 反向代理

在 aaPanel 的网站配置中将根路径转发到 `http://127.0.0.1:7001`，替换原有的根路径 `location`，不要重复添加。配置示例：

```nginx
location ^~ / {
    proxy_pass http://127.0.0.1:7001;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
    proxy_read_timeout 60s;
    proxy_buffering off;
    proxy_cache off;
}
```

保存并重新加载 Nginx，为域名配置 HTTPS，然后通过域名访问面板。容器内置 Caddy 统一处理 7001 端口上的网页及 WebSocket，不需要另加 `/ws/` 代理或单独暴露 8076 端口。

## 更新与日常管理

先备份数据库、`.env`、主题及插件，再进入原网站目录更新。命令与原版一致：

```bash
docker compose pull && docker compose up -d
```

容器启动时会执行 `php artisan xboard:update`，无需再次运行安装命令。

```bash
docker compose logs --tail=100 -f  # 查看日志
docker compose restart           # 重启面板
docker compose stop              # 停止面板
```

编排默认使用 `ghcr.io/toto0912/xboard-u:latest`，只跟随正式发布版本。持久化配置和数据继续保存在原目录及原 Redis 卷中，更新时不要删除它们。
