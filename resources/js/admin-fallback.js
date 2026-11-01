// Inserted into the pinned admin module by AdminAssetPatcher. Reuses that
// module's React, react-hook-form and UI components (no second React runtime).
function XboardFallbackInput({form, protocol}) {
  const tls = Number(form.watch('tls'));
  const network = form.watch('network') || 'tcp';
  if (![1, 2].includes(tls) || !['tcp', 'raw'].includes(network)) return null;
  const encryption = form.watch('encryption');
  const incompatible = protocol === 'vless' && tls === 1 && encryption?.enabled &&
    encryption.decryption && encryption.decryption !== 'none';
  const description = incompatible
    ? 'VLESS 额外加密与普通 TLS 回落不能同时使用；保存时此项按空值处理。'
    : tls === 2
      ? 'Reality 目标站，例如 127.0.0.1:8443；目标须提供 HTTPS / TLS 1.3，证书匹配上方 SNI。'
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
          placeholder: tls === 2 ? '127.0.0.1:8443 或 example.com:443' : '127.0.0.1:8080 或 example.com:80',
          autoComplete: 'off'
        })}),
        Q.jsx(Xy, {className: 'text-[11px] text-muted-foreground',
          children: '节点端使用 Xray 时生效，sing-box 会忽略此项。格式不正确的输入在保存时按空值处理。'}),
        Q.jsx('p', {className: 'text-[11px] text-muted-foreground', children: description})
      ]
    })
  });
}
