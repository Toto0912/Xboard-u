function XboardHY2Example(kernel, type) {
  if (kernel === 'xray') {
    return type === 'file' ? {type, dir:'/var/www/example'} : type === 'proxy'
      ? {type, url:'https://www.example.com', rewriteHost:true, insecure:false, xForwarded:false}
      : {type:'string', statusCode:200, headers:{'Content-Type':'text/plain; charset=utf-8'}, content:'Hello, world!'};
  }
  return type === 'file' ? {type, directory:'/var/www/example'} : type === 'proxy'
    ? {type, url:'https://www.example.com', rewrite_host:true}
    : {type:'string', status_code:200, headers:{'Content-Type':['text/plain; charset=utf-8']}, content:'Hello, world!'};
}

function XboardHY2Editor({form}) {
  jy('xboard-u');
  const context = H.useContext(XboardConnectionContext());
  const version = Number(form.watch('version') || 2);
  const kernel = form.watch('target_kernel') || 'singbox';
  const extra = form.watch('hy2_settings');
  const object = extra?.masquerade;
  const serialized = object && Object.keys(object).length ? JSON.stringify(object, null, 2) : '';
  const [raw, setRaw] = H.useState(serialized);
  const [exampleType, setExampleType] = H.useState('proxy');
  const [preview, setPreview] = H.useState(false);
  const sent = H.useRef(serialized);
  const currentKernel = H.useRef(kernel);
  const drafts = H.useRef(new Map());
  const separated = !!context.cdn?.enabled && context.side !== 'server';
  const write = text => {
    setRaw(text);
    let value;
    try {
      value = text.trim() ? JSON.parse(text) : null;
      if (value !== null && (!XboardTransportObject(value) || Array.isArray(value))) throw Error();
      if (value && !Object.keys(value).length) value = null;
    } catch (_) {
      form.setValue('hy2_draft_invalid', true, {shouldDirty:true});
      return;
    }
    sent.current = value ? JSON.stringify(value,null,2) : '';
    form.setValue('hy2_settings', {bandwidth_mode:'auto',kernel,...(value ? {masquerade:value} : {})}, {shouldDirty:true});
    form.setValue('hy2_draft_invalid', false, {shouldDirty:true});
  };
  H.useEffect(() => {
    if (currentKernel.current !== kernel) {
      drafts.current.set(currentKernel.current,raw);
      currentKernel.current = kernel;
      // A saved form is populated asynchronously. Adopt its matching core's
      // value instead of treating initial hydration as a user core switch.
      if (extra?.kernel === kernel) {
        sent.current = serialized;
        setRaw(serialized);
      } else {
        write(drafts.current.get(kernel) || '');
      }
      setPreview(false);
    } else if (serialized !== sent.current) {
      sent.current = serialized;
      setRaw(serialized);
    }
  }, [kernel,serialized]);
  if (version !== 2) return null;
  if (separated) return Q.jsx('p',{className:'text-xs text-muted-foreground',children:XboardT('Masquerade 在 CDN套用的服务端配置中编辑。')});
  const sample = JSON.stringify(XboardHY2Example(kernel,exampleType),null,2);
  const link = kernel === 'xray' ? 'https://xtls.github.io/config/transports/hysteria.html#masqobject' : 'https://sing-box.sagernet.org/configuration/inbound/hysteria2/#masqueradetype';
  const button = (label,onClick) => Q.jsx(Lf,{type:'button',variant:'outline',size:'sm',className:'h-9 shrink-0 px-3 text-sm leading-none',onClick,children:XboardT(label)});
  const bandwidth = Number(form.watch('bandwidth.up') || 0) > 0 || Number(form.watch('bandwidth.down') || 0) > 0;
  return Q.jsxs('section',{className:'space-y-3 rounded-xl border bg-card p-4',children:[
    Q.jsxs('div',{className:'flex flex-wrap items-center justify-between gap-2',children:[
      Q.jsx('h4',{className:'font-medium',children:XboardT('伪装（Masquerade）')}),
      Q.jsx('span',{className:'text-xs text-muted-foreground',children:kernel==='xray'?'Xray':'Sing-box'})]}),
    Q.jsx('p',{className:'text-xs text-muted-foreground',children:XboardT('仅服务端使用。留空返回 HTTP/3 404；QUIC 参数沿用内核默认值。')}),
    Q.jsx('p',{className:'text-xs text-muted-foreground',children:XboardT('带宽按客户端视角填写：上行对应服务端下行，下行对应服务端上行。')}),
    Q.jsx('p',{className:'text-xs text-muted-foreground',children:XboardT(bandwidth?'带宽已设置：参与 Brutal 协商，采用双方限制中的较小值。':'带宽留空：使用 BBR，并忽略客户端带宽提示。')}),
    Q.jsxs('div',{'data-hy2-toolbar':'',className:'flex flex-wrap items-center gap-2',children:[
      Q.jsx('select',{'aria-label':XboardT('伪装类型'),className:'h-9 rounded-md border bg-background px-3 text-sm leading-none',value:exampleType,onChange:e=>setExampleType(e.target.value),children:['proxy','file','string'].map(value=>Q.jsx('option',{value,children:value},value))}),
      button('填入官方示例',()=>setPreview(true)),
      button('恢复默认',()=>{if (!raw.trim() || window.confirm(XboardT('清空后恢复默认 404，是否继续？'))) write('');}),
      button('格式化',()=>{try {write(JSON.stringify(JSON.parse(raw),null,2));} catch (_) {gE.error(XboardT('请填写有效的 JSON 对象。'));}}),
      Q.jsx('a',{href:link,target:'_blank',rel:'noreferrer',className:'inline-flex h-9 items-center whitespace-nowrap text-sm text-primary underline underline-offset-4',children:XboardT('官方字段说明')})]}),
    preview && Q.jsxs('div',{className:'space-y-2 rounded-lg border bg-muted/40 p-3',children:[
      Q.jsx('p',{className:'text-xs',children:XboardT('按官方文档与当前内核整理的完整类型示例。确认后替换草稿，请修改占位地址或目录。')}),
      Q.jsx('pre',{className:'max-h-52 overflow-auto text-xs',children:sample}),
      Q.jsxs('div',{className:'flex gap-2',children:[button('确认填入',()=>{write(sample);setPreview(false);}),button('取消',()=>setPreview(false))]})]}),
    Q.jsx('textarea',{'aria-label':'Masquerade JSON',className:'min-h-40 w-full rounded-lg border bg-background p-3 font-mono text-xs',value:raw,onChange:e=>write(e.target.value),spellCheck:false,placeholder:'{}'}),
    form.watch('hy2_draft_invalid') && Q.jsx('p',{className:'text-xs text-destructive',children:XboardT('请填写有效的 JSON 对象。')})
  ]});
}
