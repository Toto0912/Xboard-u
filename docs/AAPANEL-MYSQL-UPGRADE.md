# aaPanel + Docker + MySQL：保留数据升级

适用于官方推荐的 aaPanel 原生 Nginx、宿主机 MySQL、Docker 面板部署。官方模板使用 `network_mode: host`，因此面板可以通过 `127.0.0.1:3306` 访问宿主机 MySQL，Nginx 继续反代到 `127.0.0.1:7001`。

本指南只替换面板镜像。**升级不需要重装面板、重建数据库，也不需要把用于测试的旧 SQL 备份导回生产库。**

## 已验证的范围

2026-11-01，使用一份 MySQL 5.7.44 导出的真实数据备份进行本地演练：

- 全量导入 33 张表，分别比较每张表的所有行、表结构及自增状态。
- 验证官方镜像启动 → xboard-u → 重复更新 → 重启 → 回退官方镜像 → 再次升级。
- 暂停本地业务调度后，所有阶段的数据库内容、结构、测试 `.env`、APP_KEY 及挂载文件校验一致。
- 原备份的密码哈希、UUID、订阅 Token、节点/机器配置、证书、余额、订单、套餐、主题设置及插件记录都在全表比对范围内。
- 单独的功能副本通过 Nginx 验证合成账号登录、节点列表、TLS 内容保存/重新打开、机器命令和节点鉴权。
- 正式版 xboard-node-u v1.0.2 通过 Nginx 完成 WebSocket 机器鉴权和状态上报，并使用面板下发的临时证书完成 HY2 代理及客户端证书验证。

本地模拟了 Linux host 网络的 localhost 语义及相同反向代理链路，没有安装 aaPanel 管理界面，也没有连接任何 VPS。所有数据库副本都处于无外网出口的隔离网络中。

## 1. 准备新镜像，保留旧镜像

在独立源码目录构建或载入已经验证的 `xboard-u:local` 镜像，不要覆盖原网站目录中的配置和数据。当前面板尚未发布公共镜像。

```sh
git submodule update --init --recursive
docker build -t xboard-u:local .
```

在 aaPanel 中确认原面板容器名、编排目录、服务名和项目名。不要新建另一个编排来替代原编排；项目名改变会改变默认命名卷名称。

以下命令的容器名需要换成 aaPanel 中的原容器名；后续示例假定服务名为 `xboard`：

```sh
PANEL_CONTAINER="原面板容器名"
PROJECT_NAME="$(docker inspect "$PANEL_CONTAINER" --format '{{index .Config.Labels "com.docker.compose.project"}}')"
OLD_IMAGE="$(docker inspect "$PANEL_CONTAINER" --format '{{.Image}}')"
test -n "$PROJECT_NAME" && test -n "$OLD_IMAGE"
docker image tag "$OLD_IMAGE" xboard-before-u:backup
```

保留旧镜像，不要在升级验收前清理它。后续命令应在**原编排目录**执行；沿用原有的 `-f` 文件和 `--env-file` 参数，文件名、服务名不同则按实际替换。

## 2. 停写并备份

停止原面板容器，以同时停止其 Web、Octane 内置调度、队列和 WS 进程。只关闭 Horizon 队列并不能停止 Octane 的内置调度。如有额外 aaPanel 计划任务或其他写数据库的进程，也应一起暂停。

```sh
docker compose -p "$PROJECT_NAME" -f compose.yaml stop xboard
```

宿主机 MySQL 无需停止。在 aaPanel 数据库管理中为**当前生产库**创建完整备份，并确认备份可恢复；保留必要的触发器、事件和存储过程定义。另行备份原 `.env`、编排文件、`storage/theme`、`plugins`、自定义配置、上传文件等，放在独立的备份目录。

保留原 APP_KEY、数据库连接、MySQL 字符集和现有授权。不要用 `.env.example` 覆盖 `.env`，不要执行 `xboard:install`、`key:generate`、`migrate:fresh` 或 `docker compose down -v`。

## 3. 只替换原编排中的面板镜像

在原编排目录创建 `compose.xboard-u.yaml`：

```yaml
services:
  xboard:
    image: xboard-u:local
```

覆盖文件只包含镜像，不写网络、端口、数据库服务或挂载。原 `network_mode: host`、`.env`、外置 MySQL、Redis 命名卷和其他挂载继续沿用。

```sh
docker compose -p "$PROJECT_NAME" -f compose.yaml -f compose.xboard-u.yaml config --images
docker compose -p "$PROJECT_NAME" -f compose.yaml -f compose.xboard-u.yaml up -d --no-deps xboard
docker compose -p "$PROJECT_NAME" -f compose.yaml -f compose.xboard-u.yaml logs --tail=100 xboard
```

也可以在 aaPanel 原编排中修改同一服务的镜像并重建该服务。Nginx、SSL、Cloudflare、MySQL 地址、数据库名和用户均不需要因本轮升级而改变。

启动入口会执行原有 `xboard:update`。本轮没有新增或修改数据库迁移；对本次验证的数据库，更新检查没有改变原有表结构和记录。

## 4. 验收

- 使用原账号检查登录、余额、套餐、订单和原订阅链接。
- 检查节点/机器列表、状态上报和 WebSocket 通信。
- 检查原主题、插件文件和配置。
- 验证 TLS 内容推送：内外两层保存后重新打开，确认模式及证书内容保留。

月初流量重置、到期处理等继续按原规则运行。导入较旧备份后发生符合套餐规则的流量重置属于正常业务，不能单凭流量计数变化判断升级丢失数据。本次静态数据比对仅在本地 Redis 暂时持有调度锁；没有修改生产调度或流量重置逻辑，也不建议在生产长期阻止调度。

## 5. 回退

若需回退，先停止新面板，再将 `compose.xboard-u.yaml` 中的镜像改成已保留的 `xboard-before-u:backup`，以相同项目名和相同挂载启动。

```sh
docker compose -p "$PROJECT_NAME" -f compose.yaml -f compose.xboard-u.yaml stop xboard
docker compose -p "$PROJECT_NAME" -f compose.yaml -f compose.xboard-u.yaml up -d --no-deps xboard
```

本轮相同数据库结构下，已验证仅切换回旧镜像可恢复运行，不需要恢复数据库。若跨越其他上游迁移或发生了需要撤销的数据写入，应停写后配套恢复数据库及文件。不要在新旧版本同时写库时恢复备份，也不要用本次测试用的历史备份覆盖升级后的新订单和用户数据。

## SQL 备份无法覆盖的部分

数据库导出不包含生产 `.env`/APP_KEY、主题包、用户插件代码、上传文件及 aaPanel/Nginx/SSL 配置。本地使用测试 `.env` 和已有本地主题资源验证挂载保留；生产必须保留实际文件。本次没有进行真实支付、邮件发送、生产管理员密码登录或公网压力测试。
