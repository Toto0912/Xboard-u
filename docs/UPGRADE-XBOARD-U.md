# 从 Xboard 原版升级到 xboard-u

## 兼容范围

xboard-u 基于 `cedar2025/Xboard` 的 `e68fec50ef48d86f7666c5ff5e758f2a6e9fa313`（2026-10-29）。本轮不增加或修改数据库迁移，不改变表名、APP_KEY、密码哈希、用户 UUID、订阅 Token、节点 ID、机器 Token、节点通信接口或主题目录。

当前原版面板可沿用已有数据库和持久化文件切换代码/镜像，不需要重新安装面板或重新绑定机器。旧版本如尚未完成上游数据库迁移，应先在数据副本上验证相应上游升级；不能保证任意历史版本、第三方分支或自改插件都可直接切换。

原版空配置可以是 `[]`、`{}` 或 NULL。修复只在管理接口输出时把空 `cert_config` 统一为对象；不会批量改库。已经丢失的证书无法凭空恢复，升级后需重新填入一次。已有非空证书配置及未知扩展字段原样保留。

## Docker：复用原部署和数据

**aaPanel + Docker + 外置 MySQL** 已使用 MySQL 5.7.44 真实备份完成本地升级/回退验证，请优先阅读 [aaPanel + MySQL 升级指南](AAPANEL-MYSQL-UPGRADE.md)。生产只替换镜像并复用当前库，不需要导入测试备份。

以下命令用于升级已有安装；**不要运行 `xboard:install`、`key:generate`、`migrate:fresh` 或 `docker compose down -v`**。

### 1. 在新源码目录构建镜像

取得完整 xboard-u 源码后，在源码目录执行：

```sh
git submodule update --init --recursive
docker build -t xboard-u:local .
```

此镜像使用当前检出的代码，不会在构建时下载另一份官方源码。`composer.lock` 参与构建。管理前端继续使用固定版本的官方子模块，不需要修改或重编译其压缩脚本。

目前为本地开发版，尚无公开 xboard-u 面板镜像或一键在线升级地址；`xboard-node-u` 节点端则使用已发布的正式版。

### 2. 停写并备份

回到**原面板部署目录**，保留原 Compose 文件、项目名和全部挂载。先记录旧镜像的镜像 ID/摘要并保留，不要清理旧镜像。停止面板及所有写数据库的队列、计划任务和 WebSocket 服务；拆分部署要同时停止全部写入者。

备份必须放在源码和数据库目录以外，包含：

- `.env`（尤其 APP_KEY 和数据库连接）、自定义 `config/v2board.php` / 其他密钥文件。
- 完整数据库：SQLite 要在停写后用 SQLite `.backup`，或完整备份所在数据目录（含存在的 WAL/SHM），不能只复制一个正在写入的数据库文件。默认数据目录是 `.docker/.data`，自定义路径以现有配置为准。
- MySQL/MariaDB 使用一致性数据库备份，保留字符集、触发器等；外置数据库无需更换连接地址。
- `storage/theme`、`plugins`、已有上传文件和其他自定义挂载目录。
- 原 Compose 文件、覆盖文件、环境文件及实际命名卷信息；使用的 Redis 命名卷继续复用。

不要用新源码中的 `.env.example` 替换旧 `.env`。不要更改原 Compose 项目名、端口、网络、数据库或 Redis 卷名。

### 3. 只覆盖面板镜像

在原部署目录新建 `compose.xboard-u.yaml`：

```yaml
services:
  xboard:
    image: xboard-u:local
```

以下假定原文件名为 `compose.yaml`、服务名为 `xboard`。若你的名字不同，替换为原有名字；如果原来还有其他 `-f`、`--env-file` 或 `-p` 参数，继续保留。

```sh
docker compose -f compose.yaml -f compose.xboard-u.yaml config
docker compose -f compose.yaml -f compose.xboard-u.yaml up -d --no-deps xboard
docker compose -f compose.yaml -f compose.xboard-u.yaml logs --tail=100 xboard
```

`config` 用来确认合并后的挂载、网络和端口与原部署一致，其输出可能含环境变量，应仅在本机查看。拆分模式需要同时覆盖 `web`、`horizon`、`ws-server` 的面板镜像，其他服务继续沿用原配置。

入口程序沿用上游的 `xboard:update` 流程，检查迁移、插件和主题；当前已是对应上游数据库结构时，不产生新的表结构变更。升级时存在短暂服务中断，“无损”指数据及配置保留，不代表零停机。

### 4. 验收和回退

检查旧账号登录、套餐/订单/余额、原订阅链接、机器状态、节点流量上报和当前主题。打开此前为空的 TLS 高级设置，填入内容推送证书并完成内外两层保存，重新打开确认内容仍在。

发现异常时停止新服务，把覆盖文件的镜像改为之前记录的旧镜像，再用原项目名及原挂载启动。当前分支未改数据库结构，通常可直接切回；如升级跨越了上游迁移，必须在全部写入者停止后配套恢复备份数据库和文件，不能在新旧版本同时写库时回退。

## 源码部署

在独立目录准备并验证新代码：初始化固定的管理前端子模块，使用 `composer install --no-dev --prefer-dist --optimize-autoloader`，不要 `composer update` 或删除锁文件。

停写、备份后沿用原 `.env`、APP_KEY、数据库、`storage/theme`、`plugins`、数据目录及自定义配置，并保持 PHP 用户的读写权限。清除新运行目录中的过期配置/路由缓存，执行 `php artisan xboard:update`，再把网站根目录/服务工作目录切换到新代码，重启原有 Web、队列和 WS 服务。切换前需在副本验证 Octane、Supervisor/OpenRC 等进程配置；不要复制旧代码的 `bootstrap/cache`、`vendor` 或临时 PID 文件到新运行目录。

## 后续更新

原版 `update.sh` 和内置代码更新逻辑会拉取/重置原仓库，可能覆盖二开修改。xboard-u 改用已验证源码/镜像部署更新，旧更新入口只返回说明，不修改代码或数据。日后发布正式仓库/镜像后再提供对应的更新地址。

`xbctl upgrade` 只更新 xboard-node-u 节点端，与面板升级分别管理。
