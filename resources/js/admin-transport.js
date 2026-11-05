function XboardDefaultKernel(network, protocol) {
  return ['ws', 'grpc', 'httpupgrade', 'http', 'h2', 'quic'].includes(network) ||
    ['hysteria', 'tuic', 'anytls', 'naive', 'mieru'].includes(protocol) ? 'singbox' : 'xray';
}

function XboardFlowInput({form, t}) {
  jy('xboard-u');
  const flow = form.watch('flow') || 'none';
  const supported = ['none', 'xtls-rprx-vision'];
  const obsolete = !supported.includes(flow);
  const options = obsolete ? [flow, ...supported] : supported;
  return Q.jsx($y, {
    control: form.control, name: 'flow',
    render: ({field}) => Q.jsxs(Gy, {children: [
      Q.jsx(Zy, {className: 'font-mono text-[12px] text-foreground/80',
        children: t('dynamic_form.vless.flow.label')}),
      Q.jsx(Yy, {children: Q.jsxs(yzt, {
        onValueChange: value => field.onChange(value === 'none' ? null : value),
        value: field.value || 'none',
        children: [
          Q.jsx(Czt, {className: 'font-mono text-xs', children: Q.jsx(wzt, {
            placeholder: t('dynamic_form.vless.flow.placeholder')
          })}),
          Q.jsx(Nzt, {children: options.map(value => Q.jsx(Lzt, {
            value, disabled: !supported.includes(value),
            children: value + (!supported.includes(value) ? ' (' + XboardT('已停止支持') + ')' : '')
          }, value))})
        ]
      })}),
      obsolete && Q.jsx(Xy, {className: 'text-xs text-destructive',
        children: XboardT('当前 Flow 已停止支持，请选择 none 或 xtls-rprx-vision。')})
    ]})
  });
}

function XboardKernelSelect({form, protocol}) {
  jy('xboard-u');
  return Q.jsxs('label', {className: 'block space-y-1 text-xs', children: [
    Q.jsx('span', {children: XboardT('目标内核')}),
    Q.jsx('select', {className: 'w-full rounded border bg-background p-2',
      value: form.watch('target_kernel') || XboardDefaultKernel(null, protocol),
      onChange: event => form.setValue('target_kernel', event.target.value, {shouldDirty: true}),
      children: [['singbox', 'Sing-box'], ['xray', 'Xray']].map(([value, label]) =>
        Q.jsx('option', {value, children: label}, value))
    }),
    Q.jsx('span', {className: 'block text-muted-foreground', children: XboardT('用于高级配置示例。实际内核由部署及订阅客户端决定。')})
  ]});
}

function XboardTransportObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function XboardTransportEditor({form, protocol}) {
  jy('xboard-u');
  const {side, cdn} = H.useContext(XboardConnectionContext());
  const service = side === 'server';
  const rawNetwork = form.watch('network') || 'tcp';
  const network = ({raw: 'tcp', splithttp: 'xhttp', websocket: 'ws', h2: 'http'})[rawNetwork] || rawNetwork;
  const kernel = form.watch('target_kernel') || XboardDefaultKernel(network);
  const current = form.watch('network_settings');
  const explicitKernel = form.watch('target_kernel');
  const params = XboardTransportObject(current) ? current : {};
  const [full, setFull] = H.useState(false);
  const [more, setMore] = H.useState(false);
  const [text, setText] = H.useState(null);
  const [preview, setPreview] = H.useState(null);
  const drafts = H.useRef(new Map());
  const key = kernel + ':' + network;
  const allowed = kernel === 'xray' ? ['tcp', 'ws', 'grpc', 'httpupgrade', 'xhttp'] :
    ['tcp', 'ws', 'grpc', 'httpupgrade', 'http', 'quic'];
  const names = {tcp: 'TCP / RAW', ws: 'WebSocket', grpc: 'gRPC', httpupgrade: 'HTTPUpgrade',
    xhttp: 'XHTTP', http: 'HTTP', quic: 'V2Ray QUIC'};
  const wsHost = network === 'ws' && kernel === 'singbox';
  const baseKeys = {
    ws: wsHost ? ['path'] : ['path', 'host'],
    xhttp: ['mode', 'path', 'host'],
    grpc: [kernel === 'xray' ? 'serviceName' : 'service_name'],
    http: ['host', 'path'],
    httpupgrade: ['path', 'host']
  }[network] || [];
  const extra = network === 'xhttp' ? (params.extra || {}) :
    Object.fromEntries(Object.entries(params).filter(([name]) => !baseKeys.includes(name)));
  if (wsHost && XboardTransportObject(extra.headers)) {
    const {Host, ...headers} = extra.headers;
    if (Object.keys(headers).length) extra.headers = headers;
    else delete extra.headers;
  }
  const active = full ? params : extra;
  const display = text ?? JSON.stringify(active, null, 2);
  const write = value => form.setValue('network_settings', value, {shouldDirty: true});
  const apply = object => {
    if (full) {
      write(object);
      return;
    }
    if (network === 'xhttp') {
      write({...params, extra: object});
      return;
    }
    const next = Object.fromEntries(baseKeys.filter(name => Object.hasOwn(params, name))
      .map(name => [name, params[name]]));
    if (wsHost && params.headers?.Host != null) {
      next.headers = {...object.headers, Host: params.headers.Host};
    }
    write({...object, ...next});
  };
  const updateJson = value => {
    setText(value);
    try {
      const parsed = JSON.parse(value);
      if (!XboardTransportObject(parsed) || ['type', 'streamSettings', 'inbounds', 'outbounds']
        .some(name => Object.hasOwn(parsed, name)) ||
        (!full && baseKeys.some(name => Object.hasOwn(parsed, name))) ||
        (!full && wsHost && Object.keys(parsed.headers || {}).some(name => name.toLowerCase() === 'host'))) {
        throw new Error('invalid transport object');
      }
      apply(parsed);
      form.setValue('target_kernel', kernel);
      form.setValue('transport_draft_invalid', false);
    } catch {
      form.setValue('transport_draft_invalid', true);
    }
  };
  const invalid = form.watch('transport_draft_invalid');
  const switchTo = (nextKernel, nextNetwork) => {
    drafts.current.set(key, {params: current, text, invalid, full, more});
    const cached = drafts.current.get(nextKernel + ':' + nextNetwork);
    if (!cached && nextKernel !== kernel && !window.confirm(XboardT('切换目标内核会打开该内核的独立草稿。当前草稿可切回查看。'))) return;
    form.setValue('target_kernel', nextKernel, {shouldDirty: true});
    form.setValue('network', nextNetwork, {shouldDirty: true});
    // An unmarked legacy config can be assigned its inferred kernel without losing fields.
    write(cached?.params ?? (nextNetwork === network && nextKernel === kernel ? current : {}) ?? {});
    form.setValue('transport_draft_invalid', !!cached?.invalid);
    setText(cached?.text ?? null);
    if (cached) {
      setFull(cached.full);
      setMore(cached.more);
    }
  };
  const setBase = (name, value) => {
    setText(null);
    form.setValue('target_kernel', kernel);
    const next = {...params};
    if (name === 'ws-host') {
      const headers = {...params.headers};
      delete headers.Host;
      if (value) headers.Host = value;
      if (Object.keys(headers).length) next.headers = headers;
      else delete next.headers;
    } else if (!value) {
      delete next[name];
    } else {
      next[name] = network === 'http' && name === 'host' ? value.split(',').map(host => host.trim()) : value;
    }
    write(next);
  };
  const showExample = kind => {
    const example = XboardTransportExample(kernel, network, service, kind);
    const object = kind === 'default' ? {} : full ? example.object :
      network === 'xhttp' ? example.object.extra || {} :
      Object.fromEntries(Object.entries(example.object).filter(([name]) => !baseKeys.includes(name)));
    if (!full && wsHost && object.headers) {
      const {Host, ...headers} = object.headers;
      if (Object.keys(headers).length) object.headers = headers;
      else delete object.headers;
    }
    setPreview({...example, object, kind});
  };
  const button = (label, onClick, disabled = false) => Q.jsx(Lf, {
    type: 'button', variant: 'outline', size: 'sm', onClick, disabled, children: label
  });
  const input = name => Q.jsxs('label', {className: 'block space-y-1 text-xs', children: [
    Q.jsx('span', {children: ({'ws-host': 'Host', grpc: XboardT('服务名称')})[name] || XboardT(name)}),
    name === 'mode' ? Q.jsx('select', {className: 'w-full rounded border bg-background p-2',
      value: params.mode || '', disabled: !!invalid, onChange: event => setBase(name, event.target.value),
      children: ['', 'auto', 'packet-up', 'stream-up', 'stream-one'].map(value =>
        Q.jsx('option', {value, children: value || XboardT('内核默认')}, value))
    }) : Q.jsx(u8e, {value: (name === 'ws-host' ? params.headers?.Host ?? params.host : params[name]) ?? '',
      disabled: !!invalid, onChange: event => setBase(name, event.target.value)})
  ]}, name);
  return Q.jsxs('section', {className: 'xb-transport-card', 'data-xboard-transport': protocol, children: [
    Q.jsxs('div', {className: 'xb-transport-heading', children: [
      Q.jsxs('h3', {children: [Q.jsx(XboardEditorIcon, {name: 'grid'}), XboardT('传输协议')]}),
      Q.jsx('span', {children: service ? XboardT('服务端配置') : XboardT('连接配置')})
    ]}),
    Q.jsxs('label', {className: 'block space-y-1 text-xs', children: [
      Q.jsx('span', {children: XboardT('目标内核')}),
      Q.jsx('select', {className: 'w-full rounded border bg-background p-2', value: kernel,
        onChange: event => switchTo(event.target.value, network),
        children: [['singbox', 'Sing-box'], ['xray', 'Xray']].map(([value, label]) =>
          Q.jsx('option', {value, children: label}, value))
      }),
      Q.jsx('span', {className: 'block text-muted-foreground', children: service
        ? XboardT('用于编辑和校验。服务器部署内核仍由节点端选择。')
        : cdn?.enabled ? XboardT('用于编辑和校验。订阅仍按请求的客户端格式输出。')
          : XboardT('用于编辑和校验。未开启分离时，服务端也使用这套连接参数。')})
    ]}),
    Q.jsxs('label', {className: 'block space-y-1 text-xs', children: [
      Q.jsx('span', {children: XboardT('传输方式')}),
      Q.jsx('select', {className: 'w-full rounded border bg-background p-2', value: network,
        onChange: event => switchTo(kernel, event.target.value),
        children: [...new Set([...allowed, network])].map(value =>
          Q.jsx('option', {value, disabled: !allowed.includes(value), children: names[value] || value}, value))
      })
    ]}),
    !explicitKernel && ['ws', 'grpc', 'httpupgrade', 'http', 'quic'].includes(network) &&
      Q.jsx('p', {className: 'text-xs text-muted-foreground',
        children: XboardT('旧节点按传输推断界面内核。使用 Xray 的旧 HTTP/H2 或 V2Ray QUIC 节点需手动迁移。')}),
    !allowed.includes(network) && Q.jsx('p', {className: 'text-xs text-destructive',
      children: XboardT('当前目标内核与传输组合不在已适配范围内，请选择对应内核或手动迁移。')}),
    network === 'tcp' && Q.jsx('p', {className: 'text-xs text-muted-foreground', children: XboardT('普通 TCP 无需路径和 Host。')}),
    network === 'http' && Q.jsx('p', {className: 'text-xs text-muted-foreground', children: XboardT('Sing-box HTTP，多个 Host 用逗号分隔。')}),
    network === 'quic' && Q.jsx('p', {className: 'text-xs text-muted-foreground', children: XboardT('旧 V2Ray QUIC，必须启用 TLS。Hysteria2 需通过协议选择。')}),
    Q.jsxs('div', {className: 'xb-transport-modes', children: [
      button(XboardT('基础表单'), () => {setFull(false); setText(null);}, !!invalid || !full),
      button(XboardT('JSON 配置'), () => {setFull(true); setText(null);}, !!invalid || full)
    ]}),
    !full && Q.jsxs('div', {className: 'xb-transport-fields', children: [
      ...baseKeys.map(input), wsHost && input('ws-host'),
      button(more ? XboardT('收起更多参数') : XboardT('更多参数'), () => setMore(!more))
    ]}),
    (full || more) && Q.jsxs('div', {className: 'xb-transport-json space-y-2', children: [
      Q.jsx(aZt, {'aria-label': full ? XboardT('完整传输 JSON') : XboardT('更多传输参数 JSON'),
        className: 'min-h-32 font-mono text-xs', spellCheck: false, value: display,
        onChange: event => updateJson(event.target.value)}),
      invalid && Q.jsx('p', {role: 'alert', className: 'text-xs text-destructive',
        children: XboardT('请填写有效的传输参数对象。更多参数不能重复声明基础表单字段。')}),
      Q.jsxs('div', {className: 'flex flex-wrap gap-2', children: [
        button(XboardT('格式化'), () => setText(null), !!invalid),
        button(XboardT('恢复默认'), () => showExample('default')),
        button(XboardT('填入官方示例'), () => showExample('example'), !allowed.includes(network)),
        network === 'xhttp' && !service && button(XboardT('上下行分离示例'), () => showExample('split'))
      ]})
    ]}),
    preview && Q.jsxs('section', {className: 'xb-example-preview space-y-2', children: [
      Q.jsx('p', {children: preview.kind === 'default'
        ? full ? XboardT('清除完整传输参数，包含路径及 Host。') : XboardT('清除更多参数，保留基础表单。')
        : preview.detail + (full ? XboardT(' 将替换完整传输参数。') : XboardT(' 将替换更多参数。'))}),
      preview.source && Q.jsx('a', {href: preview.source, target: '_blank', rel: 'noreferrer', children: XboardT('官方文档')}),
      Q.jsx('pre', {className: 'max-h-40 overflow-auto', children: JSON.stringify(preview.object, null, 2)}),
      Q.jsxs('div', {className: 'flex flex-wrap gap-2', children: [
        button(XboardT('确认填入'), () => {
          form.setValue('target_kernel', kernel);
          apply(preview.object);
          form.setValue('transport_draft_invalid', false);
          setText(null);
          setPreview(null);
        }),
        button(XboardT('取消'), () => setPreview(null))
      ]})
    ]})
  ]});
}

function XboardTransportExample(kernel, network, service, kind) {
  if (kind === 'default') return {object: {}};
  const sing = kernel === 'singbox';
  const slug = ({tcp: 'raw', ws: 'websocket'})[network] || network;
  const source = sing ? 'https://sing-box.sagernet.org/configuration/shared/v2ray-transport/#' + slug :
    network === 'xhttp' ? 'https://github.com/XTLS/Xray-core/discussions/4113' :
    'https://xtls.github.io/config/transports/' + slug + '.html';
  const object = {
    tcp: service && !sing ? {acceptProxyProtocol: false} : {},
    ws: sing ? {path: '/ws', max_early_data: 2048, early_data_header_name: 'Sec-WebSocket-Protocol',
      ...(service ? {} : {headers: {Host: 'example.com'}})} :
      {path: '/ws', host: 'example.com', ...(service ? {acceptProxyProtocol: false} : {})},
    grpc: sing ? {service_name: 'TunService', idle_timeout: '15s', ping_timeout: '15s',
      ...(service ? {} : {permit_without_stream: false})} : {serviceName: 'TunService'},
    http: {host: ['example.com'], path: '/', method: 'GET', idle_timeout: '15s', ping_timeout: '15s'},
    httpupgrade: {host: 'example.com', path: '/upgrade',
      ...(sing ? {headers: {}} : service ? {acceptProxyProtocol: false} : {})},

    xhttp: {mode: 'auto', path: '/xhttp', host: 'example.com', extra: {xPaddingBytes: '100-1000'}},
    quic: {}
  }[network] || {};
  if (kind === 'split') {
    object.extra = {};
    object.extra.downloadSettings = {
      address: 'download.example.com', port: 443, network: 'xhttp', security: 'tls',
      tlsSettings: {serverName: 'download.example.com'}, xhttpSettings: {path: '/down'}
    };
  }
  return {object, source, detail: kind === 'split'
    ? XboardT('按官方说明整理。下行服务端须另外配置。')
    : XboardT('按官方文档整理，仅包含当前编辑器开放的字段。可选性能参数供学习，可按实际环境调整。')};
}

function XboardTlsAllowInsecure({form, label}) {
  jy('xboard-u');
  const kernel = form.watch('target_kernel') || XboardDefaultKernel(form.watch('network'));
  const insecure = form.watch('tls_settings.allow_insecure');
  if (kernel === 'xray') {
    return insecure ? Q.jsxs('div', {className: 'space-y-1 text-xs', children: [
      Q.jsx('p', {children: XboardT('旧配置允许跳过证书校验。Xray 已移除此选项，请改用可验证的证书。')}),
      Q.jsx(Lf, {type: 'button', variant: 'outline', size: 'sm',
        onClick: () => form.setValue('tls_settings.allow_insecure', false, {shouldDirty: true}),
        children: XboardT('关闭跳过证书校验')})
    ]}) : null;
  }
  return Q.jsx($y, {
    control: form.control, name: 'tls_settings.allow_insecure',
    render: ({field}) => Q.jsxs(Gy, {children: [
      Q.jsx(Zy, {className: 'font-mono text-xs', children: label}),
      Q.jsx(Yy, {children: Q.jsx(oZt, {checked: !!field.value, onCheckedChange: field.onChange})})
    ]})
  });
}
