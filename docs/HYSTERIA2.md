# HY2 带宽、拥塞控制与伪装

本功能在 v2.2.0 引入，需使用 xboard-u v2.2.0 和 xboard-node-u v2.2.0。先更新节点端，再更新面板；仅更新面板不能让旧节点端识别新伪装配置。Hysteria 1 保持原有行为。

## 带宽如何填写

节点编辑页的上下行都是**客户端视角**，包括 CDN 分离后的内层表单：

| 面板填写 | 客户端订阅 | 服务端实际配置 |
| --- | --- | --- |
| 上行 23 Mbps | 上传 23 Mbps | 下载 23 Mbps |
| 下行 47 Mbps | 下载 47 Mbps | 上传 47 Mbps |

只在生成服务端配置时交换一次，订阅不会交换。`up_mbps/down_mbps` 通信字段及独立模式配置都是服务端视角，节点端不再交换。

- 两个方向均留空或为 0：使用 BBR，忽略客户端的带宽提示。
- 至少一个方向为正数：允许 Brutal 协商；该方向双方都有限制时取较小值，未填写方向不增加服务端限制。
- 客户端没有提供带宽时，仍可以走 BBR；填写带宽不表示强制所有客户端使用 Brutal。
- 输入单位为 Mbps（十进制，1 Mbps = 1,000,000 bit/s），范围为 0–1,000,000。负数、小数及非法内容会拒绝保存。

Sing-box 使用 `ignore_client_bandwidth`；Xray 使用 `finalMask.quicParams` 并通过 HY2 握手的 `auto` 响应通知客户端采用 BBR。此处是协议拥塞控制协商，与套餐限速、用户流量计费不同。

**升级注意：此前 Sing-box HY2 忽略的正值带宽现在会生效，旧记录的上下行也会按上述正确方向下发。请核对原有配置，尤其是两个方向不同的节点。**

## Masquerade 编辑区

在编辑 Hysteria 节点、选择 V2 后，带宽等基础选项下面会显示「伪装（Masquerade）」JSON 编辑器。

选择 `file`、`proxy` 或 `string`，点击「填入官方示例」，先预览，再确认替换草稿。示例列出当前内核支持的该类型字段；参数名随 Sing-box / Xray 改变。它们依据官方文档与项目内嵌内核实现整理，不是三个类型合在一起使用的配置。

- 留空或 `{}`：恢复默认 HTTP/3 404；「恢复默认」会要求确认清空。
- 无效 JSON、错误内核字段、不支持的字段、无效 URL / 状态码 / 响应头会阻止保存，不会静默清空旧配置。
- 切换内核时分别保留编辑中的草稿，不自动改写两种内核的字段。
- 保存、刷新、重新打开后会显示已保存配置。中文、英语、俄语与日间 / 夜间模式均沿用面板设置。
- 启用 CDN「客户端与服务端分离」后，只能在高级设置的服务端连接配置中编辑；外层配置不会覆盖服务端的 Masquerade。

三种类型可用字段：

| 类型 | Sing-box | Xray |
| --- | --- | --- |
| file | `type`, `directory` | `type`, `dir` |
| proxy | `type`, `url`, `rewrite_host` | `type`, `url`, `rewriteHost`, `insecure`, `xForwarded` |
| string | `type`, `status_code`, `headers`, `content` | `type`, `statusCode`, `headers`, `content` |

Sing-box 的响应头值支持字符串或字符串数组，Xray 使用字符串。`status_code/statusCode` 留空使用默认 200；显式指定时支持 200–599。反向代理 URL 必须是 HTTP(S)，不带用户名、密码或片段。

`file` 目录位于**节点服务器**，必须存在且节点服务有读取权限；`proxy` 目标由节点服务器访问；`insecure: true` 会关闭 Xray 伪装回源的证书校验，示例保持 `false`。这些配置不会上传网站文件、安装 Web 服务或自动申请证书，HY2 原有 TLS 证书配置仍然需要设置。

此处只配置 HY2 QUIC 端口对未认证 HTTP/3 请求的伪装，不会额外监听 TCP HTTP/HTTPS 端口。启用 Salamander / Gecko 混淆后，普通 HTTP/3 浏览器无法直接访问该端口，这是混淆的预期行为。

## 默认值与兼容性

不提供 QUIC 窗口、超时、MTU 等调参入口，也不往内核写入一组人为的性能默认值；它们沿用当前内核默认值。自动 BBR / Brutal 策略是单独的带宽策略。

新面板仅在服务端专用配置中下发 `hy2_settings.bandwidth_mode: auto` 及伪装对象，单节点和机器模式的 REST / WebSocket 使用同一份有效配置。客户端订阅会剔除这些字段，仅保留客户端需要的带宽、TLS、混淆等设置。

新节点端收到旧面板 / 原版 Xboard 不含 `hy2_settings` 的配置时，保留原协商默认行为，不主动强制 BBR。已下发的正值带宽仍按既有通信字段映射；旧面板不会自动获得本次面板端的方向换算。Xray HY2 的 Salamander / Gecko 混淆也已补齐映射。

## 参考

- [Hysteria 2：带宽与拥塞协商](https://v2.hysteria.network/docs/advanced/Full-Server-Config/#bandwidth)
- [Sing-box：Hysteria2 入站与 Masquerade](https://sing-box.sagernet.org/configuration/inbound/hysteria2/)
- [Xray：Hysteria 传输及 MasqObject](https://xtls.github.io/config/transports/hysteria.html#masqobject)

本地独立模式写法见配套节点端的 `docs/HYSTERIA2.md`。
