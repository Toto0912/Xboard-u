// Shares the pinned admin's i18next instance and language-change events.
const XboardTranslations = {
  "en-US": {
    "高级设置": "Advanced settings",
    "节点配置": "Node configuration",
    "连接配置": "Connection settings",
    "客户端配置": "Client settings",
    "客户端与服务端": "Client and server",
    "更多节点属性": "More node properties",
    "动态倍率 · 流量限制 · 标签 · 权限组": "Dynamic rate · Traffic limits · Tags · Access groups",
    "归属与部署": "Assignment and deployment",
    "父级节点 · 路由组 · 绑定服务器": "Parent node · Route group · Server binding",
    "客户端与服务端分离": "Separate client and server settings",
    "已开启": "Enabled",
    "未开启": "Disabled",
    "开启此功能可单独配置推送到服务端的内容，外部窗口的配置项仅作为对客户端的配置推送。": "Configure the server settings separately. The outer editor will supply only the client subscription settings.",
    "当前使用统一连接配置": "Using shared connection settings",
    "开启上方开关，即可单独设置服务端的地址、端口、安全性和传输参数。": "Enable the switch above to configure the server address, ports, security and transport separately.",
    "外层 · 客户端": "Outer · Client",
    "内层 · 服务端": "Inner · Server",
    "连接入口": "Connection endpoint",
    "CDN / 反向代理": "CDN / Reverse proxy",
    "需单独配置": "Configure separately",
    "Reality 需要端到端握手，普通 HTTP CDN 无法转发该握手。": "Reality requires an end-to-end handshake. A standard HTTP CDN cannot relay it.",
    "服务端配置": "Server settings",
    "分离开启后，下发至 xboard-node-u 的连接配置以此处为准。": "When separation is enabled, these connection settings are sent to xboard-node-u.",
    "同步配置": "Sync settings",
    "节点地址": "Node address",
    "供服务端配置使用，监听 IP 由现有节点端逻辑决定。": "Used for server configuration. The node backend determines the listening IP.",
    "连接端口": "Connection port",
    "保留服务端连接表单值。": "Stores the server connection port value.",
    "服务端端口": "Listening port",
    "xboard-node-u 实际监听端口。": "The port xboard-node-u listens on.",
    "Reality 目标站（可选）": "Reality target (optional)",
    "例如 example.com:443。为空时使用现有 Reality SNI 和端口规则。": "For example, example.com:443. Leave empty to use the existing Reality SNI and port rules.",
    "服务端多路复用": "Server multiplexing",
    "证书、自定义路由与出站仍在原高级设置菜单中配置。": "Configure certificates, custom routes and outbounds in their existing advanced settings tabs.",
    "切换协议将清除当前 CDN 服务端草稿。切换后可在 CDN套用中重新初始化。": "Changing the protocol will clear the CDN server draft. You can initialize it again in CDN settings.",
    "下行配置及 XHTTP 客户端专用参数留在客户端草稿。": "Download settings and XHTTP client-only parameters remain in the client draft.",
    "关闭后，节点将使用外层配置。Fallback 将按外层条件带回。": "Disabling separation will use the outer settings. Fallback will be carried over where compatible.",
    "外层连接参数不支持 Fallback，关闭分离后已清空外层回落目标。": "The outer connection settings do not support Fallback. The outer fallback target has been cleared.",
    "请先修正客户端传输 JSON。": "Fix the client transport JSON first.",
    "两侧目标内核不同。请在服务端编辑器中手动转换传输参数。": "The target cores differ. Convert the transport parameters manually in the server editor.",
    "用当前客户端草稿覆盖服务端连接参数？保留服务端 Reality 私钥、端口与 Fallback。": "Replace the server connection settings with the current client draft? The server Reality private key, port and Fallback will be retained.",
    "同步后的服务端参数不支持 Fallback，已清空回落目标。": "The synced server settings do not support Fallback. The fallback target has been cleared.",
    "协议加密": "Protocol encryption",
    "明文": "Plaintext",
    "请填写服务端节点地址、连接端口和有效的监听端口。": "Enter the server node address, connection port and a valid listening port.",
    "请先修正服务端传输 JSON。": "Fix the server transport JSON first.",
    "有效服务端目标内核 · ": "Effective server core · ",
    "（CDN 服务端配置）": " (CDN server settings)",
    "（节点编辑配置）": " (node editor settings)",
    "根据内核生成示例": "Generate core example",
    "按项目文档整理。将替换当前菜单和当前内核的 JSON 草稿。请按实际标签、地址和端口修改。": "Based on the project documentation. This replaces the JSON draft for the current tab and core. Adjust tags, addresses and ports.",
    "官方字段说明": "Official field reference",
    "确认填入": "Apply example",
    "取消": "Cancel",
    "目标内核": "Target core",
    "用于高级配置示例。实际内核由部署及订阅客户端决定。": "Used for advanced configuration examples. The deployed backend and subscription client determine the actual core.",
    "切换目标内核会打开该内核的独立草稿。当前草稿可切回查看。": "Switching cores opens a separate draft for that core. Switch back to view the current draft.",
    "服务名称": "Service name",
    "内核默认": "Core default",
    "传输协议": "Transport protocol",
    "用于编辑和校验。服务器部署内核仍由节点端选择。": "Used for editing and validation. The node backend selects the deployed server core.",
    "用于编辑和校验。订阅仍按请求的客户端格式输出。": "Used for editing and validation. Subscriptions use the requested client format.",
    "用于编辑和校验。未开启分离时，服务端也使用这套连接参数。": "Used for editing and validation. Without separation, the server also uses these connection parameters.",
    "传输方式": "Transport",
    "旧节点按传输推断界面内核。使用 Xray 的旧 HTTP/H2 或 V2Ray QUIC 节点需手动迁移。": "The editor infers the core from the transport for legacy nodes. Legacy Xray HTTP/H2 and V2Ray QUIC nodes require manual migration.",
    "当前目标内核与传输组合不在已适配范围内，请选择对应内核或手动迁移。": "This core and transport combination is unsupported. Select a compatible core or migrate manually.",
    "普通 TCP 无需路径和 Host。": "Plain TCP requires no path or Host.",
    "Sing-box HTTP，多个 Host 用逗号分隔。": "Sing-box HTTP: separate multiple Host values with commas.",
    "旧 V2Ray QUIC，必须启用 TLS。Hysteria2 需通过协议选择。": "Legacy V2Ray QUIC requires TLS. Select Hysteria2 in the protocol field.",
    "基础表单": "Basic form",
    "JSON 配置": "JSON configuration",
    "收起更多参数": "Hide more parameters",
    "更多参数": "More parameters",
    "完整传输 JSON": "Full transport JSON",
    "更多传输参数 JSON": "Additional transport JSON",
    "请填写有效的传输参数对象。更多参数不能重复声明基础表单字段。": "Enter a valid transport object. Additional parameters must not duplicate the basic form fields.",
    "格式化": "Format",
    "恢复默认": "Restore defaults",
    "填入官方示例": "Insert official example",
    "上下行分离示例": "Split upload/download example",
    "清除完整传输参数，包含路径及 Host。": "Clear all transport parameters, including path and Host.",
    "清除更多参数，保留基础表单。": "Clear additional parameters and keep the basic form.",
    " 将替换完整传输参数。": " This replaces all transport parameters.",
    " 将替换更多参数。": " This replaces the additional parameters.",
    "官方文档": "Official documentation",
    "按官方说明整理。下行服务端须另外配置。": "Based on the official documentation. Configure the download server separately.",
    "按官方文档整理，仅包含当前编辑器开放的字段。可选性能参数供学习，可按实际环境调整。": "Based on the official documentation, limited to fields supported by this editor. Adjust optional performance parameters to your environment.",
    "旧配置允许跳过证书校验。Xray 已移除此选项，请改用可验证的证书。": "The legacy configuration skips certificate verification. Xray removed this option. Use a verifiable certificate.",
    "关闭跳过证书校验": "Enable certificate verification",
    "Fallback（服务端）": "Fallback (server)",
    "已启用客户端与服务端分离，请在“高级设置 → CDN套用”中修改。": "Client/server separation is enabled. Edit this in Advanced settings → CDN settings.",
    "VLESS 额外加密与协议层回落不能同时使用（TLS / Reality 均适用）；保存时此项按空值处理。": "Additional VLESS encryption cannot be combined with protocol-layer fallback under TLS or Reality. This field is cleared when saved.",
    "Reality 握手通过后的协议层回落，例如明文 HTTP 网站 127.0.0.1:8080；不覆盖 Reality 目标站。普通浏览器仍转发到上方 Reality 目标。": "Protocol-layer fallback after a successful Reality handshake, such as a plaintext HTTP site at 127.0.0.1:8080. The Reality target is preserved and receives ordinary browser connections.",
    "TLS 解密后的回落目标，例如 127.0.0.1:8080；通常填写明文 HTTP 网站端口。": "Fallback target after TLS decryption, such as 127.0.0.1:8080. Usually a plaintext HTTP server.",
    "Fallback（可选）": "Fallback (optional)",
    "仅 Xray 内核生效": "Xray only",
    "127.0.0.1:8080 或 example.com:80": "127.0.0.1:8080 or example.com:80",
    "节点端使用 Xray 时生效，sing-box 会忽略此项。格式不正确的输入在保存时按空值处理。": "Applies to Xray backends. Sing-box ignores this field. Invalid input is cleared when saved.",
    "当前节点入站标签": "Node inbound tag",
    "CDN套用": "CDN settings",
    "证书配置": "Certificates",
    "自定义出站": "Custom outbounds",
    "自定义路由": "Custom routes",
    "多路复用": "Multiplexing",
    "保存": "Save",
    "保存节点": "Save node",
    "请先修正传输 JSON。": "Fix the transport JSON first.",
    "节点地址和连接端口供客户端连接。服务端监听端口在高级设置 → CDN套用中修改。": "Clients use this address and connection port. Set the server listening port in Advanced settings → CDN settings.",
    "在高级设置 → CDN套用中设置服务端端口": "Set the server port in Advanced settings → CDN settings",
    "支持 Sing-box 原生 type 配置、Xray 原生出站及旧 protocol/settings 格式；按服务端实际内核生效。": "Supports native Sing-box type objects, native Xray outbounds and legacy protocol/settings objects. Applied by the deployed server core.",
    "填写实际内核的 rules 数组。Sing-box 使用 action/outbound，Xray 使用 outboundTag；无匹配条件的规则可能接管全部流量。": "Enter the rules array for the deployed core. Sing-box uses action/outbound and Xray uses outboundTag. Rules without match conditions may capture all traffic.",
    "ADVANCED SETTINGS": "ADVANCED SETTINGS",
    "CONNECTION": "CONNECTION",
    "NEW": "NEW",
    "已停止支持": "No longer supported",
    "当前 Flow 已停止支持，请选择 none 或 xtls-rprx-vision。": "This Flow is no longer supported. Select none or xtls-rprx-vision.",
    "path": "Path",
    "host": "Host",
    "mode": "Mode"
  },
  "ru-RU": {
    "高级设置": "Расширенные настройки",
    "节点配置": "Настройки узла",
    "连接配置": "Настройки подключения",
    "客户端配置": "Настройки клиента",
    "客户端与服务端": "Клиент и сервер",
    "更多节点属性": "Дополнительные свойства узла",
    "动态倍率 · 流量限制 · 标签 · 权限组": "Динамический коэффициент · Лимиты трафика · Теги · Группы доступа",
    "归属与部署": "Привязка и развёртывание",
    "父级节点 · 路由组 · 绑定服务器": "Родительский узел · Группа маршрутов · Привязка сервера",
    "客户端与服务端分离": "Раздельные настройки клиента и сервера",
    "已开启": "Включено",
    "未开启": "Выключено",
    "开启此功能可单独配置推送到服务端的内容，外部窗口的配置项仅作为对客户端的配置推送。": "Настраивайте параметры сервера отдельно. Параметры внешнего окна будут использоваться только в подписках клиентов.",
    "当前使用统一连接配置": "Используются общие настройки подключения",
    "开启上方开关，即可单独设置服务端的地址、端口、安全性和传输参数。": "Включите переключатель выше, чтобы отдельно настроить адрес сервера, порты, безопасность и транспорт.",
    "外层 · 客户端": "Внешние · Клиент",
    "内层 · 服务端": "Внутренние · Сервер",
    "连接入口": "Точка подключения",
    "CDN / 反向代理": "CDN / Обратный прокси",
    "需单独配置": "Настраивается отдельно",
    "Reality 需要端到端握手，普通 HTTP CDN 无法转发该握手。": "Reality требует сквозного рукопожатия. Обычная HTTP CDN не может его передать.",
    "服务端配置": "Настройки сервера",
    "分离开启后，下发至 xboard-node-u 的连接配置以此处为准。": "При включённом разделении эти настройки подключения отправляются в xboard-node-u.",
    "同步配置": "Синхронизировать",
    "节点地址": "Адрес узла",
    "供服务端配置使用，监听 IP 由现有节点端逻辑决定。": "Используется в настройках сервера. IP прослушивания определяется узлом.",
    "连接端口": "Порт подключения",
    "保留服务端连接表单值。": "Сохраняет значение порта подключения сервера.",
    "服务端端口": "Порт прослушивания",
    "xboard-node-u 实际监听端口。": "Порт, который прослушивает xboard-node-u.",
    "Reality 目标站（可选）": "Целевой сервер Reality (необязательно)",
    "例如 example.com:443。为空时使用现有 Reality SNI 和端口规则。": "Например, example.com:443. Если поле пустое, используются текущие SNI Reality и правила порта.",
    "服务端多路复用": "Мультиплексирование на сервере",
    "证书、自定义路由与出站仍在原高级设置菜单中配置。": "Сертификаты, пользовательские маршруты и исходящие подключения настраиваются в соответствующих вкладках.",
    "切换协议将清除当前 CDN 服务端草稿。切换后可在 CDN套用中重新初始化。": "Смена протокола удалит черновик настроек сервера CDN. Его можно заново создать во вкладке CDN.",
    "下行配置及 XHTTP 客户端专用参数留在客户端草稿。": "Настройки скачивания и параметры XHTTP только для клиента остаются в черновике клиента.",
    "关闭后，节点将使用外层配置。Fallback 将按外层条件带回。": "После отключения разделения узел использует внешние настройки. Fallback переносится, если они совместимы.",
    "外层连接参数不支持 Fallback，关闭分离后已清空外层回落目标。": "Внешние настройки подключения не поддерживают Fallback. Внешний адрес Fallback очищен.",
    "请先修正客户端传输 JSON。": "Сначала исправьте JSON транспорта клиента.",
    "两侧目标内核不同。请在服务端编辑器中手动转换传输参数。": "Целевые ядра различаются. Преобразуйте параметры транспорта вручную в редакторе сервера.",
    "用当前客户端草稿覆盖服务端连接参数？保留服务端 Reality 私钥、端口与 Fallback。": "Заменить настройки подключения сервера текущим черновиком клиента? Закрытый ключ Reality, порт и Fallback сервера сохранятся.",
    "同步后的服务端参数不支持 Fallback，已清空回落目标。": "Синхронизированные настройки сервера не поддерживают Fallback. Адрес Fallback очищен.",
    "协议加密": "Шифрование протокола",
    "明文": "Без шифрования",
    "请填写服务端节点地址、连接端口和有效的监听端口。": "Укажите адрес серверного узла, порт подключения и допустимый порт прослушивания.",
    "请先修正服务端传输 JSON。": "Сначала исправьте JSON транспорта сервера.",
    "有效服务端目标内核 · ": "Используемое ядро сервера · ",
    "（CDN 服务端配置）": " (настройки сервера CDN)",
    "（节点编辑配置）": " (настройки редактора узла)",
    "根据内核生成示例": "Создать пример для ядра",
    "按项目文档整理。将替换当前菜单和当前内核的 JSON 草稿。请按实际标签、地址和端口修改。": "На основе документации проекта. Заменяет черновик JSON для текущей вкладки и ядра. Укажите свои теги, адреса и порты.",
    "官方字段说明": "Официальное описание полей",
    "确认填入": "Применить пример",
    "取消": "Отмена",
    "目标内核": "Целевое ядро",
    "用于高级配置示例。实际内核由部署及订阅客户端决定。": "Используется для примеров расширенных настроек. Фактическое ядро определяется развёрнутым сервером и клиентом подписки.",
    "切换目标内核会打开该内核的独立草稿。当前草稿可切回查看。": "При смене ядра открывается отдельный черновик. Вернитесь к прежнему ядру, чтобы увидеть текущий черновик.",
    "服务名称": "Имя службы",
    "内核默认": "По умолчанию",
    "传输协议": "Транспортный протокол",
    "用于编辑和校验。服务器部署内核仍由节点端选择。": "Используется для редактирования и проверки. Ядро сервера выбирается на узле.",
    "用于编辑和校验。订阅仍按请求的客户端格式输出。": "Используется для редактирования и проверки. Подписка выдаётся в запрошенном формате клиента.",
    "用于编辑和校验。未开启分离时，服务端也使用这套连接参数。": "Используется для редактирования и проверки. Без разделения сервер использует те же параметры подключения.",
    "传输方式": "Транспорт",
    "旧节点按传输推断界面内核。使用 Xray 的旧 HTTP/H2 或 V2Ray QUIC 节点需手动迁移。": "Для старых узлов ядро в редакторе определяется по транспорту. Старые узлы Xray HTTP/H2 и V2Ray QUIC требуют ручного переноса.",
    "当前目标内核与传输组合不在已适配范围内，请选择对应内核或手动迁移。": "Это сочетание ядра и транспорта не поддерживается. Выберите совместимое ядро или выполните перенос вручную.",
    "普通 TCP 无需路径和 Host。": "Обычный TCP не требует path или Host.",
    "Sing-box HTTP，多个 Host 用逗号分隔。": "Sing-box HTTP: разделяйте несколько значений Host запятыми.",
    "旧 V2Ray QUIC，必须启用 TLS。Hysteria2 需通过协议选择。": "Старый V2Ray QUIC требует TLS. Hysteria2 выбирается в поле протокола.",
    "基础表单": "Основные поля",
    "JSON 配置": "Настройки JSON",
    "收起更多参数": "Скрыть дополнительные параметры",
    "更多参数": "Дополнительные параметры",
    "完整传输 JSON": "Полный JSON транспорта",
    "更多传输参数 JSON": "JSON дополнительных параметров",
    "请填写有效的传输参数对象。更多参数不能重复声明基础表单字段。": "Введите корректный объект параметров транспорта. Дополнительные параметры не должны повторять основные поля.",
    "格式化": "Форматировать",
    "恢复默认": "Сбросить",
    "填入官方示例": "Вставить официальный пример",
    "上下行分离示例": "Пример разделения загрузки и скачивания",
    "清除完整传输参数，包含路径及 Host。": "Очистить все параметры транспорта, включая path и Host.",
    "清除更多参数，保留基础表单。": "Очистить дополнительные параметры, сохранив основные поля.",
    " 将替换完整传输参数。": " Все параметры транспорта будут заменены.",
    " 将替换更多参数。": " Дополнительные параметры будут заменены.",
    "官方文档": "Официальная документация",
    "按官方说明整理。下行服务端须另外配置。": "На основе официальной документации. Сервер скачивания настраивается отдельно.",
    "按官方文档整理，仅包含当前编辑器开放的字段。可选性能参数供学习，可按实际环境调整。": "На основе официальной документации, только поля этого редактора. Необязательные параметры производительности можно настроить под свою среду.",
    "旧配置允许跳过证书校验。Xray 已移除此选项，请改用可验证的证书。": "В старых настройках отключена проверка сертификата. В Xray эта опция удалена. Используйте проверяемый сертификат.",
    "关闭跳过证书校验": "Включить проверку сертификата",
    "Fallback（服务端）": "Fallback (сервер)",
    "已启用客户端与服务端分离，请在“高级设置 → CDN套用”中修改。": "Включены раздельные настройки клиента и сервера. Измените это в разделе «Расширенные настройки → CDN».",
    "VLESS 额外加密与协议层回落不能同时使用（TLS / Reality 均适用）；保存时此项按空值处理。": "Дополнительное шифрование VLESS несовместимо с Fallback уровня протокола при TLS и Reality. При сохранении поле очищается.",
    "Reality 握手通过后的协议层回落，例如明文 HTTP 网站 127.0.0.1:8080；不覆盖 Reality 目标站。普通浏览器仍转发到上方 Reality 目标。": "Fallback уровня протокола после успешного рукопожатия Reality, например HTTP-сайт без TLS на 127.0.0.1:8080. Цель Reality сохраняется и принимает обычные подключения браузера.",
    "TLS 解密后的回落目标，例如 127.0.0.1:8080；通常填写明文 HTTP 网站端口。": "Адрес Fallback после расшифровки TLS, например 127.0.0.1:8080. Обычно это HTTP-сервер без TLS.",
    "Fallback（可选）": "Fallback (необязательно)",
    "仅 Xray 内核生效": "Только Xray",
    "127.0.0.1:8080 或 example.com:80": "127.0.0.1:8080 или example.com:80",
    "节点端使用 Xray 时生效，sing-box 会忽略此项。格式不正确的输入在保存时按空值处理。": "Применяется к узлам Xray. Sing-box игнорирует это поле. Некорректное значение очищается при сохранении.",
    "当前节点入站标签": "Тег входящего подключения узла",
    "CDN套用": "CDN",
    "证书配置": "Сертификаты",
    "自定义出站": "Исходящие подключения",
    "自定义路由": "Маршруты",
    "多路复用": "Мультиплексирование",
    "保存": "Сохранить",
    "保存节点": "Сохранить узел",
    "请先修正传输 JSON。": "Сначала исправьте JSON транспорта.",
    "节点地址和连接端口供客户端连接。服务端监听端口在高级设置 → CDN套用中修改。": "Клиенты используют этот адрес и порт подключения. Порт прослушивания сервера задаётся в разделе «Расширенные настройки → CDN».",
    "在高级设置 → CDN套用中设置服务端端口": "Задайте порт сервера в разделе «Расширенные настройки → CDN»",
    "支持 Sing-box 原生 type 配置、Xray 原生出站及旧 protocol/settings 格式；按服务端实际内核生效。": "Поддерживаются исходящие подключения Sing-box с полем type, Xray и старый формат protocol/settings. Применяются в соответствии с ядром сервера.",
    "填写实际内核的 rules 数组。Sing-box 使用 action/outbound，Xray 使用 outboundTag；无匹配条件的规则可能接管全部流量。": "Введите массив rules для используемого ядра. Sing-box использует action/outbound, Xray — outboundTag. Правила без условий могут перехватывать весь трафик.",
    "ADVANCED SETTINGS": "РАСШИРЕННЫЕ НАСТРОЙКИ",
    "CONNECTION": "ПОДКЛЮЧЕНИЕ",
    "NEW": "НОВОЕ",
    "已停止支持": "Больше не поддерживается",
    "当前 Flow 已停止支持，请选择 none 或 xtls-rprx-vision。": "Это значение Flow больше не поддерживается. Выберите none или xtls-rprx-vision.",
    "path": "Путь",
    "host": "Host",
    "mode": "Режим"
  }
};
for (const [language, messages] of Object.entries(XboardTranslations)) {
  lL.addResourceBundle(language, 'xboard-u', messages, true, true);
}

function XboardT(message) {
  return lL.t(message, {ns: 'xboard-u', keySeparator: false, nsSeparator: false, defaultValue: message});
}

// Fill missing node-editor translations in the pinned upstream locale.
lL.addResourceBundle('ru-RU', 'server', {
  "columns": {
    "groups": {
      "empty": "--"
    },
    "actions_dropdown": {
      "reset_traffic": {
        "title": "Подтвердить сброс трафика",
        "description": "Входящий и исходящий трафик будут обнулены, а блокировка узла снята. Продолжить?",
        "confirm": "Сбросить трафик",
        "label": "Сбросить трафик"
      },
      "reset_traffic_success": "Трафик сброшен"
    }
  },
  "form": {
    "traffic_limit": {
      "label": "Лимит трафика",
      "placeholder": "0 — без ограничений",
      "hint": "Лимит трафика узла в ГБ. 0 — без ограничений",
      "error_numeric": "Лимит трафика должен быть числом",
      "error_gte_zero": "Лимит трафика должен быть не меньше 0"
    },
    "banned": {
      "label": "Отключить узел",
      "description": "Отключённый узел недоступен"
    }
  },
  "dynamic_form": {
    "multiplex": {
      "enabled": {
        "label": "Мультиплексирование"
      },
      "brutal": {
        "enabled": {
          "label": "TCP Brutal"
        },
        "up_mbps": {
          "label": "Скорость отправки"
        },
        "down_mbps": {
          "label": "Скорость скачивания"
        }
      }
    },
    "ech": {
      "config": {
        "label": "Конфигурация ECH (PEM)"
      },
      "config_path": {
        "placeholder": "/etc/sing-box/ech.pem"
      },
      "key": {
        "label": "Ключ ECH"
      },
      "key_path": {
        "placeholder": "/etc/sing-box/ech.key"
      }
    },
    "anytls": {
      "tls": {
        "server_name": {
          "label": "Имя сервера (SNI)",
          "placeholder": "Используется для проверки сертификата, если домен отличается от адреса узла"
        },
        "allow_insecure": "Отключить проверку сертификата"
      },
      "padding_scheme": {
        "description": "Каждая строка задаёт правило дополнения. Формат: stop=8, 0=30-30",
        "label": "Схема дополнения",
        "placeholder": "Введите правила дополнения",
        "use_default": "Схема по умолчанию",
        "edit_btn": "Изменить схему дополнения",
        "configured": "Настроено правил: {{count}}",
        "not_configured": "Не настроено"
      }
    },
    "shadowsocks": {
      "cipher": {
        "label": "Метод шифрования",
        "placeholder": "Выберите метод шифрования",
        "search_placeholder": "Найдите или введите метод шифрования...",
        "description": "Выберите готовый метод шифрования или введите свой",
        "preset_group": "Готовые методы шифрования",
        "custom_group": "Свой метод шифрования",
        "current_value": "Текущее значение",
        "use_custom": "Использовать",
        "no_results": "Подходящий метод шифрования не найден",
        "custom_hint": "Можно ввести свой метод шифрования, например aes-256-cfb",
        "custom_label": "Пользовательский"
      },
      "plugin": {
        "label": "Плагин",
        "placeholder": "Выберите плагин",
        "obfs_hint": "Пример формата: obfs=http;obfs-host=www.bing.com;path=/",
        "v2ray_hint": "WebSocket: mode=websocket;host=mydomain.me;path=/;tls=true. QUIC: mode=quic;host=mydomain.me",
        "gost_hint": "Пример формата: mode=websocket;host=mydomain.me;path=/;tls=true",
        "shadow_tls_hint": "Пример формата: host=cloud.tencent.com;password=auth_password;version=3",
        "restls_hint": "Пример формата: host=www.microsoft.com;password=auth_password;version-hint=tls13;restls-script=300?100<1,400~100",
        "kcptun_hint": "Пример формата: key=psk;crypt=aes-128-gcm;mode=fast;mtu=1350"
      },
      "plugin_opts": {
        "label": "Параметры плагина",
        "description": "Введите параметры в формате key=value;key2=value2",
        "placeholder": "Пример: mode=tls;host=bing.com"
      },
      "client_fingerprint": "Отпечаток клиента",
      "client_fingerprint_placeholder": "Выберите отпечаток клиента",
      "client_fingerprint_description": "Имитация отпечатка клиента для снижения риска обнаружения",
      "obfs": {
        "label": "Обфускация",
        "placeholder": "Выберите метод обфускации",
        "none": "Нет",
        "http": "HTTP"
      },
      "obfs_settings": {
        "path": "Путь",
        "host": "Host"
      },
      "cert_config": {
        "tab": "Сертификат TLS",
        "cert_mode": {
          "label": "Режим сертификата",
          "description": "Выберите способ управления сертификатами",
          "self_description": "Самоподписанный: создаётся узлом автоматически на 10 лет",
          "http_description": "HTTP-01: порт 80 должен быть доступен",
          "dns_description": "DNS-01: проверка через записи DNS с поддержкой подстановочных сертификатов",
          "content_description": "Содержимое: передача сертификата и ключа на узел"
        },
        "domain": {
          "label": "Домен",
          "placeholder": "example.com"
        },
        "email": {
          "label": "Почта для уведомлений",
          "placeholder": "admin@example.com"
        },
        "http_port": {
          "label": "Порт проверки",
          "description": "Порт проверки ACME (по умолчанию 80)"
        },
        "dns_provider": {
          "label": "DNS-провайдер",
          "doc_link": "Настройка DNS-провайдера"
        },
        "dns_env": {
          "label": "Переменные окружения (ключи API)",
          "description_short": "Одна пара KEY=VALUE в строке"
        },
        "cert_content": {
          "label": "Содержимое сертификата"
        },
        "key_content": {
          "label": "Содержимое закрытого ключа"
        },
        "none_desc": "Настройки TLS отключены"
      }
    },
    "vmess": {
      "tls": {
        "label": "TLS",
        "placeholder": "Выберите защиту",
        "disabled": "Выключено",
        "enabled": "Включено"
      },
      "tls_settings": {
        "server_name": {
          "label": "Имя сервера (SNI)",
          "placeholder": "Оставьте пустым, если не используется"
        },
        "allow_insecure": "Отключить проверку сертификата?"
      },
      "network": {
        "label": "Транспортный протокол",
        "placeholder": "Выберите транспортный протокол"
      }
    },
    "trojan": {
      "server_name": {
        "label": "Имя сервера (SNI)",
        "placeholder": "Используется для проверки сертификата, если адрес узла отличается от имени в сертификате"
      },
      "allow_insecure": "Отключить проверку сертификата?",
      "reality_settings": {
        "server_name": {
          "label": "Целевой сайт (dest)",
          "placeholder": "Например, example.com"
        },
        "server_port": {
          "label": "Порт",
          "placeholder": "e.g., 443"
        },
        "allow_insecure": "Отключить проверку сертификата?",
        "private_key": {
          "label": "Закрытый ключ"
        },
        "public_key": {
          "label": "Открытый ключ"
        },
        "short_id": {
          "label": "Короткий ID",
          "placeholder": "Необязательно. Чётное число символов, не более 16",
          "description": "Список shortId для различения клиентов. Используйте шестнадцатеричные символы 0–f",
          "generate": "Создать Short ID",
          "success": "Short ID создан"
        },
        "key_pair": {
          "generate": "Создать пару ключей",
          "success": "Пара ключей создана",
          "error": "Не удалось создать пару ключей"
        }
      },
      "network": {
        "label": "Транспортный протокол",
        "placeholder": "Выберите транспортный протокол"
      }
    },
    "hysteria": {
      "version": {
        "label": "Версия протокола",
        "placeholder": "Версия протокола"
      },
      "alpn": {
        "label": "ALPN",
        "placeholder": "ALPN"
      },
      "obfs": {
        "label": "Обфускация",
        "type": {
          "label": "Реализация обфускации",
          "placeholder": "Выберите реализацию обфускации",
          "salamander": "Salamander"
        },
        "password": {
          "label": "Пароль обфускации",
          "placeholder": "Введите пароль обфускации",
          "generate_success": "Пароль обфускации создан"
        }
      },
      "tls": {
        "server_name": {
          "label": "Имя сервера (SNI)",
          "placeholder": "Используется для проверки сертификата, если адрес узла отличается от имени в сертификате"
        },
        "allow_insecure": "Отключить проверку сертификата?"
      },
      "bandwidth": {
        "up": {
          "label": "Скорость отправки",
          "placeholder": "Введите скорость отправки",
          "suffix": "Mbps",
          "bbr_tip": ", оставьте пустым для использования BBR"
        },
        "down": {
          "label": "Скорость скачивания",
          "placeholder": "Введите скорость скачивания",
          "suffix": "Mbps",
          "bbr_tip": ", оставьте пустым для использования BBR"
        }
      }
    },
    "vless": {
      "tls": {
        "label": "Защита",
        "placeholder": "Выберите защиту",
        "none": "Нет",
        "tls": "TLS",
        "reality": "Reality"
      },
      "tls_settings": {
        "server_name": {
          "label": "Имя сервера (SNI)",
          "placeholder": "Оставьте пустым, если не используется"
        },
        "allow_insecure": "Отключить проверку сертификата?"
      },
      "reality_settings": {
        "server_name": {
          "label": "Целевой сайт (dest)",
          "placeholder": "Например, example.com"
        },
        "server_port": {
          "label": "Порт",
          "placeholder": "e.g., 443"
        },
        "allow_insecure": "Отключить проверку сертификата?",
        "private_key": {
          "label": "Закрытый ключ"
        },
        "public_key": {
          "label": "Открытый ключ"
        },
        "short_id": {
          "label": "Короткий ID",
          "placeholder": "Необязательно. Чётное число символов, не более 16",
          "description": "Список shortId для различения клиентов. Используйте шестнадцатеричные символы 0–f",
          "generate": "Создать Short ID",
          "success": "Short ID создан"
        },
        "key_pair": {
          "generate": "Создать пару ключей",
          "success": "Пара ключей создана",
          "error": "Не удалось создать пару ключей"
        }
      },
      "network": {
        "label": "Транспортный протокол",
        "placeholder": "Выберите транспортный протокол"
      },
      "flow": {
        "label": "Управление потоком",
        "placeholder": "Выберите управление потоком"
      },
      "encryption": {
        "label": "Шифрование VLESS",
        "description": "Включить шифрование VLESS",
        "server_label": "decryption",
        "server_placeholder": "./xray vlessenc",
        "server_description": "",
        "client_label": "encryption",
        "client_placeholder": "./xray vlessenc",
        "client_description": "",
        "generate_hint": "./xray vlessenc"
      }
    },
    "tuic": {
      "version": {
        "label": "Версия протокола",
        "placeholder": "Выберите версию TUIC"
      },
      "password": {
        "label": "Пароль",
        "placeholder": "Введите пароль",
        "generate_success": "Пароль создан"
      },
      "congestion_control": {
        "label": "Управление перегрузкой",
        "placeholder": "Выберите алгоритм управления перегрузкой"
      },
      "udp_relay_mode": {
        "label": "Режим ретрансляции UDP",
        "placeholder": "Выберите режим ретрансляции UDP"
      },
      "tls": {
        "server_name": {
          "label": "Имя сервера (SNI)",
          "placeholder": "Используется для проверки сертификата, если домен отличается от адреса узла"
        },
        "allow_insecure": "Отключить проверку сертификата?",
        "alpn": {
          "label": "ALPN",
          "placeholder": "Выберите протоколы ALPN",
          "empty": "Нет доступных протоколов ALPN"
        }
      }
    },
    "socks": {
      "version": {
        "label": "Версия протокола",
        "placeholder": "Выберите версию SOCKS"
      },
      "tls": {
        "label": "TLS",
        "placeholder": "Выберите защиту",
        "disabled": "Выключено",
        "enabled": "Включено"
      },
      "tls_settings": {
        "server_name": {
          "label": "Имя сервера (SNI)",
          "placeholder": "Оставьте пустым, если не используется"
        },
        "allow_insecure": "Отключить проверку сертификата?"
      },
      "network": {
        "label": "Транспортный протокол",
        "placeholder": "Выберите транспортный протокол"
      }
    },
    "naive": {
      "tls_settings": {
        "server_name": {
          "label": "Имя сервера (SNI)",
          "placeholder": "Используется для проверки сертификата, если домен отличается от адреса узла"
        },
        "allow_insecure": "Отключить проверку сертификата"
      },
      "tls": {
        "label": "TLS",
        "placeholder": "Выберите защиту",
        "disabled": "Выключено",
        "enabled": "Включено",
        "server_name": {
          "label": "Имя сервера (SNI)",
          "placeholder": "Используется для проверки сертификата, если домен отличается от адреса узла"
        },
        "allow_insecure": "Отключить проверку сертификата"
      }
    },
    "http": {
      "tls_settings": {
        "server_name": {
          "label": "Имя сервера (SNI)",
          "placeholder": "Используется для проверки сертификата, если домен отличается от адреса узла"
        },
        "allow_insecure": "Отключить проверку сертификата"
      },
      "tls": {
        "label": "TLS",
        "placeholder": "Выберите защиту",
        "disabled": "Выключено",
        "enabled": "Включено",
        "server_name": {
          "label": "Имя сервера (SNI)",
          "placeholder": "Используется для проверки сертификата, если домен отличается от адреса узла"
        },
        "allow_insecure": "Отключить проверку сертификата"
      }
    },
    "mieru": {
      "transport": {
        "label": "Транспортный протокол",
        "placeholder": "Выберите транспортный протокол"
      },
      "traffic_pattern": {
        "label": "Шаблон трафика (Base64)",
        "placeholder": "Введите строку Base64 для настройки сети",
        "success": "Шаблон трафика создан"
      }
    },
    "routing": {
      "outbounds_tab": "Исходящие подключения",
      "routes_tab": "Маршруты",
      "outbounds": "Исходящие подключения (JSON)",
      "routes": "Маршруты (JSON)",
      "error": {
        "must_be_array": "Требуется массив JSON []",
        "invalid_json": "Некорректный формат JSON"
      }
    },
    "advanced": {
      "tls_tab": "TLS"
    }
  },
  "network_settings": {
    "edit_protocol": "Изменить протокол",
    "edit_protocol_config": "Настроить протокол",
    "use_template": "Использовать шаблон {{template}}",
    "json_config_placeholder": "Введите настройки JSON",
    "json_config_placeholder_with_template": "Введите настройки JSON или выберите шаблон выше",
    "validation": {
      "must_be_object": "Настройки должны быть объектом JSON",
      "invalid_json": "Некорректный формат JSON"
    },
    "errors": {
      "save_failed": "Ошибка сохранения"
    }
  },
  "common": {
    "cancel": "Отмена",
    "confirm": "Подтвердить"
  }
}, true, true);
lL.addResourceBundle('en-US', 'server', {columns:{actions_dropdown:{reset_traffic:{label:'Reset traffic'}}}}, true, true);
lL.addResourceBundle('en-US', 'server', {columns:{actions_menu:{reset_traffic:'Reset traffic'}}}, true, true);
lL.addResourceBundle('ru-RU', 'server', {columns:{actions_menu:{reset_traffic:'Сбросить трафик'}}}, true, true);
lL.addResourceBundle('en-US', 'server', {
  dynamic_form: {hysteria: {hop_interval: {
    label: 'Port hopping interval (seconds)',
    placeholder: 'For example, 30',
    description: 'Time between port hops, in seconds'
  }}}
}, true, true);
lL.addResourceBundle('ru-RU', 'server', {
  dynamic_form: {hysteria: {hop_interval: {
    label: 'Интервал смены портов (секунды)',
    placeholder: 'Например, 30',
    description: 'Интервал между сменами портов в секундах'
  }}}
}, true, true);
