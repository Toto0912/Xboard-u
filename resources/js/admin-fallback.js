// Inserted into the pinned admin module by AdminAssetPatcher. Reuses that
// module's React, react-hook-form and UI components (no second React runtime).
function XboardFallbackInput({form, protocol}) {
  const {cdn, side} = H.useContext(XboardConnectionContext());
  if (cdn?.enabled && side !== 'server') {
    const settings = cdn.server.protocol_settings;
    const fallback = XboardFallbackAllowed(protocol, settings) ? settings.xray_fallback : '';
    return Q.jsxs('div', {className: 'space-y-1 text-xs', children: [
      Q.jsx('label', {children: 'Fallback（服务端）'}),
      Q.jsx(u8e, {value: fallback || '', readOnly: true, disabled: true, 'aria-label': 'Fallback（服务端）'}),
      Q.jsx('p', {children: '已启用客户端与服务端分离，请在“高级设置 → CDN套用”中修改。'})
    ]});
  }
  const tls = Number(form.watch('tls'));
  const rawNetwork = form.watch('network') || 'tcp';
  const network = ({raw: 'tcp', splithttp: 'xhttp', h2: 'http'})[rawNetwork] || rawNetwork;
  if (![1, 2].includes(tls) || !['tcp', 'raw'].includes(network)) return null;
  const encryption = form.watch('encryption');
  const incompatible = protocol === 'vless' && encryption?.enabled &&
    encryption.decryption && encryption.decryption !== 'none';
  const description = incompatible
    ? 'VLESS 额外加密与协议层回落不能同时使用（TLS / Reality 均适用）；保存时此项按空值处理。'
    : tls === 2
      ? 'Reality 握手通过后的协议层回落，例如明文 HTTP 网站 127.0.0.1:8080；不覆盖 Reality 目标站。普通浏览器仍转发到上方 Reality 目标。'
      : 'TLS 解密后的回落目标，例如 127.0.0.1:8080；通常填写明文 HTTP 网站端口。';
  return Q.jsx($y, {
    control: form.control,
    name: 'xray_fallback',
    render: ({field}) => Q.jsxs(Gy, {
      'data-xboard-fallback': 'true',
      children: [
        Q.jsxs('div', {className: 'flex items-center gap-2', children: [
          Q.jsx(Zy, {className: 'font-mono text-[12px] text-foreground/80', children: 'Fallback（可选）'}),
          Q.jsx('span', {className: 'text-[11px] text-muted-foreground', children: '仅 Xray 内核生效'})
        ]}),
        Q.jsx(Yy, {children: Q.jsx(u8e, {
          ...field,
          value: field.value ?? '',
          disabled: Boolean(incompatible),
          className: 'font-mono text-xs',
          placeholder: '127.0.0.1:8080 或 example.com:80',
          autoComplete: 'off'
        })}),
        Q.jsx(Xy, {className: 'text-[11px] text-muted-foreground',
          children: '节点端使用 Xray 时生效，sing-box 会忽略此项。格式不正确的输入在保存时按空值处理。'}),
        Q.jsx('p', {className: 'text-[11px] text-muted-foreground', children: description})
      ]
    })
  });
}

// Both supported node kernels name the panel-managed inbound protocol + "-in".
// Read-only display: never write this derived value into the saved form.
function XboardInboundTag({protocol}) {
  if (typeof protocol !== 'string' || !protocol) return null;
  return Q.jsxs('div', {
    className: 'flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs',
    'data-xboard-inbound-label': 'true',
    children: [
      Q.jsx('span', {className: 'text-muted-foreground', children: '当前节点入站标签'}),
      Q.jsx('code', {className: 'font-mono text-foreground', 'data-xboard-inbound-tag': protocol + '-in', children: protocol + '-in'})
    ]
  });
}
