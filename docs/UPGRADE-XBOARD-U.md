# 从原版 Xboard 迁移到 xboard-u

适用于已经使用 Docker / aaPanel + Docker 部署的 Xboard。迁移只替换面板镜像，继续使用原数据库、`.env`、APP_KEY、主题、插件和节点配置，无需重新绑定机器。

xboard-u 基于原版 `e68fec5`（2026-10-29）。v1.1.x 不新增数据库列；v1.1.0 的订阅模板数据迁移仅替换已知的原版默认模板，保留管理员自定义内容。v1.1.1 只增加订阅转换，不新增迁移，可继续搭配 xboard-node-u v1.1.0。更早的历史版本或第三方修改，应先确认相应上游迁移及插件兼容情况。

## 1. 停止面板并备份

进入**原面板编排目录**。下面以 `compose.yaml`、服务名 `xboard` 为例；名称不同请替换，原来使用的项目名（`-p`）、覆盖文件（`-f`）和环境文件参数继续保留。

```bash
docker compose stop
cp -p compose.yaml compose.yaml.before-xboard-u
```

如果还有单独的队列、计划任务或 WebSocket 服务会写入同一个数据库，也一并停止。

备份以下内容，放在独立的备份目录：

- 当前数据库。MySQL 可使用 aaPanel 的数据库备份功能；SQLite 在停止全部写入后备份完整数据目录，包含存在的 WAL/SHM 文件。
- `.env`、自定义配置、`storage/theme`、`plugins`、上传文件和其他自定义挂载。
- 原编排文件、项目名以及实际使用的命名卷信息；保留旧镜像，便于回退。

不要清空 `.env`、更换 APP_KEY、重建数据库或执行 `xboard:install`，也不要运行 `docker compose down -v`。

## 2. 只修改镜像地址

在原 `compose.yaml` 中找到面板服务，将原镜像替换为：

```yaml
services:
  xboard:
    image: ghcr.io/toto0912/xboard-u:latest
```

以上仅展示需要修改的位置，**不要用这几行替换整个编排文件**。保留原网络、端口、环境变量、数据库连接、所有挂载和卷名，特别是 aaPanel 模式的 `network_mode: host`。

如果原来通过覆盖文件设置镜像，修改实际生效的那一处；拆分部署则同时替换 `web`、`horizon`、`ws-server` 中的面板镜像，其他服务不变。

无需克隆新仓库覆盖原站点，也无需重新导入数据库。

## 3. 拉取镜像并启动

沿用原版更新命令，在同一个目录、同一个 Compose 项目中执行：

```bash
docker compose pull && docker compose up -d
```

镜像启动时会执行原版的 `php artisan xboard:update`，自动运行必要的数据迁移。v1.1.0 的额外迁移只更新已知的旧默认订阅模板；用户、订单、余额、主题和节点配置继续使用，切换期间有短暂服务中断。需要使用面板 Fallback 时，建议先将 xboard-node-u 升级到同版本 v1.1.0。

## 4. 检查迁移结果

```bash
docker compose logs --tail=100
```

使用原账号检查套餐、余额、订单、订阅链接、机器状态和当前主题。升级后刷新管理页面，重新填写此前已丢失的 TLS 内容推送配置，并完成内外两层保存；已有正确证书配置无需修改。

月初流量重置等任务仍按原规则运行。

## 后续更新

完成迁移后，继续使用原版命令：

```bash
docker compose pull && docker compose up -d
```

无需运行 `git pull` 或旧版 `update.sh`，节点端仍由 `xbctl upgrade` 单独更新。

## 回退

停止面板，把编排中的镜像恢复为保留的旧镜像，并以相同项目名和挂载重新启动。若本次只改了镜像，也可恢复备份的完整编排文件：

```bash
docker compose stop
cp -p compose.yaml.before-xboard-u compose.yaml
docker compose up -d
```

v1.1.0 不改数据库结构，可沿用原数据库回退；仅回退镜像不会撤销默认订阅模板的数据更新。如需恢复旧模板，可从备份中恢复相应模板内容。跨越其他版本的迁移或需要撤销业务写入时，须在停止全部写入后配套恢复数据库和文件，避免覆盖迁移后新增的用户及订单。
