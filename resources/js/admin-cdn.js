function XboardConnectionContext() {
  return XboardConnectionContext.value ??= H.createContext({});
}

function XboardCanChangeProtocol(form, protocol) {
  const cdn = form.getValues('cdn_settings');
  if (!cdn?.server || cdn.type === protocol) return true;
  if (!window.confirm(XboardT('切换协议将清除当前 CDN 服务端草稿。切换后可在 CDN套用中重新初始化。'))) return false;
  form.setValue('cdn_settings', null, {shouldDirty: true});
  return true;
}

function XboardConnectionDraft(form, current) {
  const settings = structuredClone(form.getValues('protocol_settings') || {});
  delete settings.cert_config;
  delete settings.routing;
  if (['xhttp', 'splithttp'].includes(settings.network) && XboardTransportObject(settings.network_settings?.extra)) {
    const extra = settings.network_settings.extra;
    const clientOnly = ['downloadSettings', 'xmux', 'noGRPCHeader', 'scMinPostsIntervalMs'];
    if (clientOnly.some(key => Object.hasOwn(extra, key))) {
      for (const key of clientOnly) delete extra[key];
      gE.info(XboardT('下行配置及 XHTTP 客户端专用参数留在客户端草稿。'));
    }
  }
  if (current) {
    const saved = current.protocol_settings;
    settings.xray_fallback = saved.xray_fallback;
    if (saved.reality_settings || settings.reality_settings) {
      settings.reality_settings = {...settings.reality_settings};
      for (const key of ['private_key', 'dest', 'server_port']) {
        delete settings.reality_settings[key];
        if (saved.reality_settings && Object.hasOwn(saved.reality_settings, key)) {
          settings.reality_settings[key] = saved.reality_settings[key];
        }
      }
    }
  }
  return {
    host: form.getValues('host'),
    port: form.getValues('port'),
    server_port: form.getValues('server_port') || form.getValues('port'),
    protocol_settings: settings
  };
}

function XboardConvertTransport(settings, kernel) {
  const network = ({raw: 'tcp', websocket: 'ws'})[settings.network] || settings.network || 'tcp';
  const params = settings.network_settings || {};
  const fields = {
    tcp: [], ws: ['path', 'host', 'headers'], grpc: ['serviceName', 'service_name'],
    httpupgrade: ['path', 'host']
  }[network];
  if (!fields || Object.keys(params).some(key => !fields.includes(key))) return null;

  const result = {...params};
  if (network === 'ws') {
    const entries = Object.entries(result.headers || {});
    if (entries.some(([key]) => key.toLowerCase() !== 'host')) return null;
    const host = result.host ?? entries[0]?.[1];
    if (entries.some(([, value]) => typeof value !== 'string' || value !== host)) return null;
    delete result.host;
    delete result.headers;
    if (host) {
      if (kernel === 'singbox') result.headers = {Host: host};
      else result.host = host;
    }
  }
  if (network === 'grpc') {
    const service = result.service_name ?? result.serviceName;
    if (result.service_name != null && result.serviceName != null && result.service_name !== result.serviceName) {
      return null;
    }
    delete result.service_name;
    delete result.serviceName;
    if (service != null) result[kernel === 'singbox' ? 'service_name' : 'serviceName'] = service;
  }
  return {network, network_settings: result, target_kernel: kernel};
}

function XboardCdnFields({form, protocol}) {
  const {t} = jy('server');
  const cdn = form.watch('cdn_settings');
  const server = cdn?.server;
  const client = form.watch('protocol_settings') || {};
  const [revision, bump] = H.useReducer(value => value + 1, 0);
  const write = value => form.setValue('cdn_settings', value, {shouldDirty: true});
  const toggle = enabled => {
    if (!enabled && !window.confirm(XboardT('关闭后，节点将使用外层配置。Fallback 将按外层条件带回。'))) return;
    const next = server || XboardConnectionDraft(form);
    if (!enabled) {
      const fallback = next.protocol_settings.xray_fallback || '';
      const allowed = XboardFallbackAllowed(protocol, client);
      form.setValue('protocol_settings.xray_fallback', allowed ? fallback : '', {shouldDirty: true});
      if (fallback && !allowed) {
        gE.info(XboardT('外层连接参数不支持 Fallback，关闭分离后已清空外层回落目标。'));
      }
    }
    write({enabled, type: protocol, server: next});
  };
  const change = (field, value) => form.setValue('cdn_settings.server.' + field, value, {shouldDirty: true});
  const sync = () => {
    if (client.transport_draft_invalid) {
      gE.error(XboardT('请先修正客户端传输 JSON。'));
      return;
    }
    const originKernel = server.protocol_settings.target_kernel || XboardDefaultKernel(server.protocol_settings.network, protocol);
    const differentKernel = (client.target_kernel || XboardDefaultKernel(client.network, protocol)) !== originKernel;
    const transport = differentKernel ? XboardConvertTransport(client, originKernel) : null;
    if (differentKernel && !transport) {
      gE.error(XboardT('两侧目标内核不同。请在服务端编辑器中手动转换传输参数。'));
      return;
    }
    if (!window.confirm(XboardT('用当前客户端草稿覆盖服务端连接参数？保留服务端 Reality 私钥、端口与 Fallback。'))) return;
    const next = XboardConnectionDraft(form, server);
    if (transport) Object.assign(next.protocol_settings, transport);
    if (next.protocol_settings.xray_fallback && !XboardFallbackAllowed(protocol, next.protocol_settings)) {
      next.protocol_settings.xray_fallback = '';
      gE.info(XboardT('同步后的服务端参数不支持 Fallback，已清空回落目标。'));
    }
    write({enabled: true, type: protocol, server: next});
    bump();
  };
  const text = (label, field, hint) => Q.jsxs('label', {
    className: 'block min-w-0 space-y-1 text-xs',
    children: [
      Q.jsx('span', {children: label}),
      Q.jsx(u8e, {value: server[field] ?? '', onChange: event => change(field, event.target.value)}),
      Q.jsx('span', {className: 'block text-muted-foreground', children: hint})
    ]
  });
  const describe = settings => {
    const alwaysTls = ['hysteria', 'tuic', 'anytls'].includes(protocol);
    const security = alwaysTls ? 'TLS' : protocol === 'shadowsocks' ? XboardT('协议加密') :
      ({0: XboardT('明文'), 1: 'TLS', 2: 'Reality'})[settings.tls ?? 0];
    const transport = settings.network || settings.transport || (protocol === 'hysteria' || protocol === 'tuic' ? 'QUIC' : 'TCP');
    return security + ' / ' + transport;
  };
  return Q.jsx(XboardCdnLayout, {form, protocol, cdn, server, client, revision,
    toggle, sync, text, change, describe});
}

function XboardFallbackAllowed(protocol, settings) {
  return ['vless', 'trojan'].includes(protocol) &&
    [1, 2].includes(Number(settings.tls)) &&
    ['tcp', 'raw'].includes(settings.network || 'tcp') &&
    !(protocol === 'vless' && settings.encryption?.enabled &&
      settings.encryption.decryption && settings.encryption.decryption !== 'none');
}

function XboardCommitAdvanced(outer, draft, protocol, customTouched) {
  const values = draft.getValues();
  const cdn = values.cdn_settings;
  if (cdn?.enabled) {
    const server = cdn.server;
    if (!server.host?.trim() || !/^\d{1,5}(-\d{1,5})?$/.test(String(server.port)) ||
        !/^\d+$/.test(String(server.server_port)) || +server.server_port < 1 || +server.server_port > 65535) {
      gE.error(XboardT('请填写服务端节点地址、连接端口和有效的监听端口。'));
      return false;
    }
    if (server.protocol_settings.transport_draft_invalid) {
      gE.error(XboardT('请先修正服务端传输 JSON。'));
      return false;
    }
    if (!XboardFallbackAllowed(protocol, server.protocol_settings)) {
      server.protocol_settings.xray_fallback = '';
    }
    values.protocol_settings.xray_fallback = '';
  }
  for (const field of ['cdn_settings', 'cert_config', 'custom_outbounds', 'custom_routes', 'protocol_settings']) {
    if (Object.hasOwn(values, field) && (!field.startsWith('custom_') || customTouched[field])) {
      outer.setValue(field, structuredClone(values[field]), {shouldDirty: true});
    }
  }
  return true;
}

function XboardEffectiveKernel(values, protocol) {
  const settings = values.cdn_settings?.enabled
    ? values.cdn_settings.server.protocol_settings : values.protocol_settings || {};
  return settings.target_kernel || XboardDefaultKernel(settings.network, protocol);
}

function XboardCustomDrafts(form, protocol) {
  const settings = form.watch('protocol_settings');
  const cdn = form.watch('cdn_settings');
  const kernel = XboardEffectiveKernel({protocol_settings: settings, cdn_settings: cdn}, protocol);
  const [drafts, setDrafts] = H.useState({});
  const [touched, setTouched] = H.useState({});
  const active = drafts[kernel] || {};
  const write = (kind, value) => {
    setDrafts(old => ({...old, [kernel]: {...old[kernel], [kind]: value}}));
    setTouched(old => ({...old, [kernel]: {...old[kernel], [kind]: true}}));
  };
  const load = values => {
    const toJson = input => Array.isArray(input) && input.length ? JSON.stringify(input, null, 2) : '';
    setDrafts({[XboardEffectiveKernel(values, protocol)]: {
      custom_outbounds: toJson(values.custom_outbounds),
      custom_routes: toJson(values.custom_routes)
    }});
    setTouched({});
  };
  return [
    active.custom_outbounds || '', value => write('custom_outbounds', value),
    active.custom_routes || '', value => write('custom_routes', value),
    load, kernel, touched[kernel] || {}
  ];
}

function XboardCustomExample({kind, form, kernel, protocol, onApply}) {
  jy('xboard-u');
  const [preview, setPreview] = H.useState(false);
  const cdn = form.watch('cdn_settings');
  const sing = kernel === 'singbox';
  const outbounds = kind === 'outbounds';
  const tag = 'example-socks-' + kernel;
  const port = String((cdn?.enabled ? cdn.server.server_port : form.watch('server_port')) || 443);
  const source = sing
    ? outbounds ? 'https://sing-box.sagernet.org/configuration/outbound/socks/' : 'https://sing-box.sagernet.org/configuration/route/rule/'
    : outbounds ? 'https://xtls.github.io/config/outbounds/socks.html' : 'https://xtls.github.io/config/routing.html#ruleobject';
  const sample = outbounds
    ? sing
      ? {type: 'socks', tag, server: '127.0.0.1', server_port: 1234, username: 'testuser', password: 'testpass'}
      : {tag, protocol: 'socks', settings: {address: '127.0.0.1', port: 1234, user: 'testuser', pass: 'testpass'}}
    : sing ? {inbound: [protocol + '-in'], action: 'route', outbound: tag}
      : {localPort: port, outboundTag: tag};
  const json = JSON.stringify([sample], null, 2);
  const action = (label, onClick) => Q.jsx(Lf, {type: 'button', size: 'sm', variant: 'outline', onClick, children: label});
  return Q.jsxs('div', {className: 'xb-custom-example', children: [
    Q.jsx('p', {children: XboardT('有效服务端目标内核 · ') + (sing ? 'Sing-box' : 'Xray') +
      (cdn?.enabled ? XboardT('（CDN 服务端配置）') : XboardT('（节点编辑配置）'))}),
    action(XboardT('根据内核生成示例'), () => setPreview(true)),
    preview && Q.jsxs('div', {className: 'xb-example-preview space-y-2', children: [
      Q.jsx('p', {children: XboardT('按项目文档整理。将替换当前菜单和当前内核的 JSON 草稿。请按实际标签、地址和端口修改。')}),
      Q.jsx('a', {href: source, target: '_blank', rel: 'noreferrer', children: XboardT('官方字段说明')}),
      Q.jsx('pre', {className: 'max-h-52 overflow-auto', children: json}),
      Q.jsxs('div', {className: 'flex gap-2', children: [
        action(XboardT('确认填入'), () => {onApply(json); setPreview(false);}),
        action(XboardT('取消'), () => setPreview(false))
      ]})
    ]})
  ]});
}
