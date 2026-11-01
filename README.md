# xboard-u

基于 [cedar2025/Xboard](https://github.com/cedar2025/Xboard) 的面板二次开发项目，搭配 [xboard-node-u](https://github.com/Toto0912/xboard-node-u) 使用。

当前版本 **v0.1.0**，基线为官方 `e68fec50ef48d86f7666c5ff5e758f2a6e9fa313`（2026-10-29）。源码：[Toto0912/Xboard-u](https://github.com/Toto0912/Xboard-u)，发布资源：[Releases](https://github.com/Toto0912/Xboard-u/releases)，镜像：`ghcr.io/toto0912/xboard-u:v0.1.0`（Linux amd64 / arm64）。

## 本轮改动

- 修复 TLS 内容推送配置保存成功后重新打开为空的问题：空配置在管理接口统一输出为对象，已有证书、私钥和扩展字段保留，不批量改库。
- 新建机器和已有机器的“复制安装命令”均使用 xboard-node-u 正式 Release；自动识别 Alpine/OpenRC 和普通 Linux，root 直接运行，普通用户通过 sudo，默认 sing-box。安装后统一使用 `xbctl` 管理。
- Docker 构建当前检出的 xboard-u 代码，不再重新克隆并覆盖成官方版本。
- 沿用原版数据库、配置和节点通信接口，支持保留数据切换到 xboard-u。

## TLS 内容推送

打开节点 → 高级设置 → 证书模式选 `content (Cert Push)`，填写证书及私钥，先保存高级设置，再保存外层节点编辑窗口。重新打开后模式和内容应保留。

问题源于已有节点的空配置（JSON `[]`）使前端嵌套字段在提交时丢失，修复覆盖使用相同证书设置的协议。已经丢失的内容需要在升级后重新填写；已有正确配置无需修改。升级后刷新管理页，让列表重新读取数据。

## Docker 一键新装

需要已安装 Docker、Compose v2、Bash、curl 和 sha256sum。以下命令用于**全新安装**，默认目录 `/opt/xboard-u`；脚本遇到非空目录会退出，避免覆盖已有面板。资源从本仓库正式 Release 下载并校验 SHA256，镜像从 GitHub Container Registry 拉取。

### aaPanel + Docker + MySQL（推荐）

在服务器终端以 root 执行；已有面板请直接阅读下方升级说明：

```sh
curl -fL https://github.com/Toto0912/Xboard-u/releases/latest/download/install.sh -o /tmp/xboard-u-install.sh && bash /tmp/xboard-u-install.sh --layout host
```

交互界面选择 MySQL，填写 aaPanel 中**新建的空数据库**信息；host 模式可通过 `127.0.0.1` 连接宿主机 MySQL。不要填入已有生产库。Nginx 反向代理到 `127.0.0.1:7001`，WebSocket 按原版方式启用。

### 普通 Docker + SQLite

```sh
curl -fL https://github.com/Toto0912/Xboard-u/releases/latest/download/install.sh -o /tmp/xboard-u-install.sh && bash /tmp/xboard-u-install.sh --sqlite
```

默认访问 `http://服务器地址:7001`，保存初始化时输出的管理员凭据和管理入口。使用 `--dir /绝对路径` 修改新装目录，`--version v0.1.0` 固定版本，`--download-only` 只下载配置。脚本不会安装 Docker，也不会修改已有防火墙或反向代理。

安装后进入运行目录管理：

```sh
cd /opt/xboard-u
docker compose logs --tail=100 -f xboard  # 查看日志
docker compose restart xboard            # 重启面板
docker compose stop xboard               # 停止面板
```

## 原版无损升级

**已有面板不要执行上述新装命令。** 保留原 `.env`、APP_KEY、数据库、主题、插件和自定义文件，只切换经过验证的代码/镜像；不需要重新导入用户或绑定节点。

请阅读 [完整升级与回退说明](docs/UPGRADE-XBOARD-U.md)，包括 SQLite/MySQL 备份、保留 Compose 项目名和挂载、镜像切换与回退。当前分支没有新增或修改数据库迁移；任意历史版本或第三方修改仍需在副本验证。无损指数据和配置保留，不代表零停机。

使用官方推荐的 **aaPanel + Docker + MySQL** 部署时，请阅读 [专用升级指南](docs/AAPANEL-MYSQL-UPGRADE.md)。已用 MySQL 5.7.44 的真实备份验证全部 33 张表的数据/结构保留及镜像回退，并通过 Nginx 完成 WS 和 HY2 联动测试。

原版会覆盖二开代码的自更新入口已停用，目前使用源码/镜像部署更新。节点端仍通过 `xbctl upgrade` 单独更新。

发布附件中的 `compose.xboard-u.yaml` 是**升级覆盖文件**，仅修改 `xboard` 服务的镜像；不能单独作为完整编排启动。先备份和停写，再按升级文档在原编排目录合并使用。不要下载新装编排文件覆盖原编排。

## 从源码构建

```sh
git clone --recurse-submodules https://github.com/Toto0912/Xboard-u.git
cd Xboard-u
git checkout v0.1.0
git submodule update --init --recursive
docker build -t xboard-u:local .
```

构建使用当前检出的代码、锁定依赖和管理前端。运行时在单独目录复制合适的 Compose 模板，将面板镜像改为 `xboard-u:local`。Release 的 `xboard-u-source-with-admin.tar.gz` 已包含固定管理前端；GitHub 自动生成的 Source code 压缩包不包含子模块内容。源码直接运行需要 PHP >= 8.2.35、原版所需扩展及 Redis 等依赖。

## 开发与验证

测试只在隔离源码副本和独立数据库/Redis 中执行。安装锁定的开发依赖后运行 `vendor/bin/phpunit`；结果和限制见 [验证说明](docs/VALIDATION.md)。不要让测试连接生产数据库或 Redis。

管理前端保留固定的官方 Git 子模块，本轮未修改压缩 JS 和用户主题。[原版说明](docs/UPSTREAM-README.md) 及历史安装文档中的官方仓库/镜像地址只作为上游参考。

## 许可

沿用 [MIT License](LICENSE) 并保留上游版权信息，变更见 [CHANGELOG.md](CHANGELOG.md)。
