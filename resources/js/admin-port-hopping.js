function XboardHY2Range(value, minimum = 1, maximum = 65535) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,10}(?:-\d{1,10})?$/.test(text)) return null;
  const [first, last = first] = text.split('-').map(Number);
  return Number.isSafeInteger(first) && Number.isSafeInteger(last) &&
    first >= minimum && last <= maximum && first <= last ? [first, last] : null;
}

function XboardHY2RangeText(range) {
  return range[0] === range[1] ? String(range[0]) : range.join('-');
}

function XboardHY2PortPlaceholder(form) {
  return form.watch('type') === 'hysteria' && Number(form.watch('protocol_settings.version') || 2) === 2
    ? XboardT('例如：60000 或 60000-65000') : '';
}

function XboardServerPortDisplay(connection) {
  const current = connection?.cdn_settings?.enabled ? connection.cdn_settings.server : connection;
  return current?.protocol_settings?.hy2_settings?.port_range || current?.server_port || '';
}

function XboardSetServerPort(form, field, value, settings = 'protocol_settings') {
  form.setValue(field, value, {shouldDirty:true,shouldValidate:true});
  if (form.getValues('type') === 'hysteria' && Number(form.getValues(settings+'.version') || 2) === 2) {
    const range = XboardHY2Range(value);
    form.setValue(settings+'.hy2_settings.port_range',
      range && range[0] !== range[1] ? XboardHY2RangeText(range) : null, {shouldDirty:true});
  }
}

function XboardValidateHopping(values) {
  if (values.type !== 'hysteria' || Number(values.protocol_settings?.version || 2) !== 2) return true;
  const error = message => { gE.error(XboardT(message)); return false; };
  if (values.protocol_settings?.hop_interval_invalid) return error('间隔至少 5 秒，支持 10 或 10-30。');
  const connections = values.cdn_settings?.enabled ? [values, values.cdn_settings.server] : [values];
  for (const connection of connections) {
    if (!connection || !XboardHY2Range(connection.port) || !XboardHY2Range(connection.server_port))
      return error('端口须为 1-65535 内的整数或连续范围。');
  }
  return true;
}

function XboardHY2HopFields({form}) {
  jy('xboard-u');
  const type = form.watch('type');
  const settings = form.watch('protocol_settings') || {};
  const ports = XboardHY2Range(form.watch('port'));
  const enabled = !!ports && ports[0] !== ports[1];
  const value = settings.hop_interval == null ? '' : String(settings.hop_interval) +
    (Number(settings.hop_interval_max) > Number(settings.hop_interval) ? '-'+settings.hop_interval_max : '');
  const [raw, setRaw] = H.useState(value);
  const [error, setError] = H.useState(false);
  const sent = H.useRef(value);
  H.useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setRaw(value);
      setError(false);
    }
  }, [value]);
  H.useEffect(() => {
    if (!enabled && type === 'hysteria' && Number(settings.version || 2) === 2 && error) {
      setRaw(value);
      setError(false);
      form.setValue('protocol_settings.hop_interval_invalid',false);
    }
  }, [enabled,type,settings.version,error]);
  if (type !== 'hysteria' || Number(settings.version || 2) !== 2) return null;
  const write = event => {
    const text = event.target.value;
    setRaw(text);
    const range = text.trim() ? XboardHY2Range(text, 5, 2147483647) : null;
    const invalid = !!text.trim() && !range;
    setError(invalid);
    form.setValue('protocol_settings.hop_interval_invalid', invalid, {shouldDirty:true});
    if (invalid) return;
    const min = range?.[0] ?? null;
    const max = range && range[1] > range[0] ? range[1] : null;
    sent.current = min == null ? '' : String(min) + (max ? '-'+max : '');
    form.setValue('protocol_settings.hop_interval', min, {shouldDirty:true});
    form.setValue('protocol_settings.hop_interval_max', max, {shouldDirty:true});
  };
  return Q.jsxs('label', {className:'block space-y-2', 'data-hy2-hop-interval':'',children:[
    Q.jsx('span',{className:'text-xs font-medium',children:XboardT('端口跳跃间隔（秒）')}),
    Q.jsx(u8e,{type:'text',value:raw,disabled:!enabled,onChange:write,
      'aria-label':XboardT('端口跳跃间隔（秒）'),'aria-invalid':error,
      placeholder:XboardT('例如：10 或 10-30，默认 30')}),
    error && Q.jsx('span',{role:'alert',className:'text-xs text-destructive',children:XboardT('间隔至少 5 秒，支持 10 或 10-30。')})
  ]});
}
