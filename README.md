# xboard-u

基于 [cedar2025/Xboard](https://github.com/cedar2025/Xboard) 的面板二次开发项目，搭配 [xboard-node-u](https://github.com/Toto0912/xboard-node-u) 使用。

当前为 **0.1.0 本地开发版**，基线为官方 `e68fec50ef48d86f7666c5ff5e758f2a6e9fa313`（2026-10-29）。尚未发布公开面板仓库或镜像。

## 本轮改动

- 修复 TLS 内容推送配置保存成功后重新打开为空的问题：空配置在管理接口统一输出为对象，已有证书、私钥和扩展字段保留，不批量改库。
- 新建机器和已有机器的“复制安装命令”均使用 xboard-node-u 正式 Release；自动识别 Alpine/OpenRC 和普通 Linux，root 直接运行，普通用户通过 sudo，默认 sing-box。安装后统一使用 `xbctl` 管理。
- Docker 构建当前检出的 xboard-u 代码，不再重新克隆并覆盖成官方版本。
- 沿用原版数据库、配置和节点通信接口，支持保留数据切换到 xboard-u。

## TLS 内容推送

打开节点 → 高级设置 → 证书模式选 `content (Cert Push)`，填写证书及私钥，先保存高级设置，再保存外层节点编辑窗口。重新打开后模式和内容应保留。

问题源于已有节点的空配置（JSON `[]`）使前端嵌套字段在提交时丢失，修复覆盖使用相同证书设置的协议。已经丢失的内容需要在升级后重新填写；已有正确配置无需修改。升级后刷新管理页，让列表重新读取数据。

## 构建与新装

要求 Docker；源码运行要求 PHP >= 8.2.35 及原版要求的扩展、Redis 等依赖。在源码目录执行：

```sh
git submodule update --init --recursive
docker build -t xboard-u:local .
```

新装时在**单独的运行目录**使用本项目 `compose.sample.yaml`（复制为 `compose.yaml`），创建空 `.env` 文件，然后执行以下命令。仅适合全新数据库：

```sh
docker compose run -it --rm -e ENABLE_SQLITE=true -e ENABLE_REDIS=true -e ADMIN_ACCOUNT=admin@example.com xboard php artisan xboard:install
docker compose up -d
```

默认访问 `http://服务器地址:7001`，保存初始化时输出的管理员凭据。开发时依赖、数据库、日志、截图和测试产物都放在源码之外的运行副本。

## 原版无损升级

**已有面板不要执行上述新装命令。** 保留原 `.env`、APP_KEY、数据库、主题、插件和自定义文件，只切换经过验证的代码/镜像；不需要重新导入用户或绑定节点。

请阅读 [完整升级与回退说明](docs/UPGRADE-XBOARD-U.md)，包括 SQLite/MySQL 备份、保留 Compose 项目名和挂载、镜像切换与回退。当前分支没有新增或修改数据库迁移；任意历史版本或第三方修改仍需在副本验证。无损指数据和配置保留，不代表零停机。

原版会覆盖二开代码的自更新入口已停用，目前使用源码/镜像部署更新。节点端仍通过 `xbctl upgrade` 单独更新。

## 开发与验证

测试只在隔离源码副本和独立数据库/Redis 中执行。安装锁定的开发依赖后运行 `vendor/bin/phpunit`；结果和限制见 [验证说明](docs/VALIDATION.md)。不要让测试连接生产数据库或 Redis。

管理前端保留固定的官方 Git 子模块，本轮未修改压缩 JS 和用户主题。[原版说明](docs/UPSTREAM-README.md) 及历史安装文档中的官方仓库/镜像地址只作为上游参考。

## 许可

沿用 [MIT License](LICENSE) 并保留上游版权信息，变更见 [CHANGELOG.md](CHANGELOG.md)。
