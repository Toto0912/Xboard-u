function XboardEditorIcon({name, className = ''}) {
  const paths = {
    cloud: ['M6 18a4 4 0 0 1-.4-8 6.5 6.5 0 0 1 12.5-1.4A4.7 4.7 0 0 1 18 18Z'],
    server: ['M4 3h16v7H4zM4 14h16v7H4zM8 6.5h.01M8 17.5h.01M12 6.5h4M12 17.5h4'],
    lock: ['M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3M12 14v3'],
    route: ['M6 7v7a5 5 0 0 0 5 5h5M10 5h5a4 4 0 0 1 0 8h-4m0 0 3-3m-3 3 3 3'],
    out: ['M13 5h6v6m0-6L9 15M10 5H5v14h14v-5'],
    grid: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
    sync: ['M20 8a8 8 0 0 0-14-2L3 9m0-5v5h5M4 16a8 8 0 0 0 14 2l3-3m0 5v-5h-5'],
    arrow: ['M4 12h16m-5-5 5 5-5 5'],
    info: ['M12 11v6m0-10v.1'],
    sliders: ['M4 7h6m4 0h6M4 17h10m4 0h2'],
  };
  const circles = name === 'info' ? [[12,12,9]] : name === 'route' ? [[6,5,2],[18,19,2]] :
    name === 'sliders' ? [[12,7,2],[16,17,2]] : [];
  return Q.jsxs('svg', {viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round', className, 'aria-hidden': true,
    children: [...(paths[name] || paths.server).map((d,i) => Q.jsx('path', {d}, 'p'+i)),
      ...circles.map(([cx,cy,r],i) => Q.jsx('circle', {cx,cy,r}, 'c'+i))]});
}

function XboardEditorTab({name, text}) {
  jy('xboard-u');
  return Q.jsxs('span', {className: 'xb-tab-label', children: [
    Q.jsx(XboardEditorIcon, {name}), XboardT(text),
    name === 'cloud' && Q.jsx('span', {className: 'xb-new-badge', children: XboardT('NEW')})
  ]});
}

function XboardAdvancedHeading({form, protocol}) {
  jy('xboard-u');
  return Q.jsxs('div', {className: 'xb-advanced-heading', children: [
    Q.jsx('span', {className: 'xb-eyebrow', children: XboardT('ADVANCED SETTINGS')}),
    Q.jsxs(_tt, {className: 'xb-dialog-title', children: [
      Q.jsx(XboardEditorIcon, {name:'sliders'}), XboardT('高级设置')
    ]}),
    Q.jsxs('p', {className:'xb-dialog-description', children: [
      form.getValues('name') || XboardT('节点配置'), Q.jsx('span', {children:'·'}), String(protocol || '').toUpperCase()
    ]})
  ]});
}

function XboardConnectionHeading({form}) {
  jy('xboard-u');
  const separated = !!form.watch('cdn_settings')?.enabled;
  return Q.jsxs('div', {className:'xb-section-heading', children: [
    Q.jsxs('div', {children:[Q.jsx('span',{className:'xb-eyebrow',children:'CONNECTION'}),
      Q.jsx('h3',{children:XboardT('连接配置')})]}),
    Q.jsx('span',{className:'xb-side-badge',children:separated?XboardT('客户端配置'):XboardT('客户端与服务端')})
  ]});
}

function XboardCollapsibleGroup({title, hint, fields, className, fieldsClassName}) {
  return Q.jsxs('details',{className:'xb-secondary-details'+(className?' '+className:''),children:[
    Q.jsxs('summary',{children:[Q.jsx('span',{children:title}),Q.jsx('small',{children:hint})]}),
    Q.jsx('div',{className:fieldsClassName,children:fields})
  ]});
}

function XboardNodeBasicSection({children, extra, className}) {
  return Q.jsxs('div',{className: className || 'xb-basic-section',
    children:[...H.Children.toArray(children), extra]});
}

function XboardNodeEditorBody({children, className}) {
  jy('xboard-u');
  const fields = H.Children.toArray(children);
  const fieldIndex = name => fields.findIndex(field => H.isValidElement(field) &&
    field.props && field.props.name === name);
  // 可选字段（动态倍率、流量限制、自定义节点 ID、标签、权限组）在原始表单里是
  // 节点编辑容器的同级子节点，只有按字段名找出区间才能整体收进折叠面板。
  const groupStart = fieldIndex('rate_time_enable');
  const groupEnd = fieldIndex('group_ids');
  // 只有基础信息块可被克隆挂载时才收拢，避免上游结构变化时字段被整段丢弃。
  const grouped = groupStart > -1 && groupEnd > groupStart && H.isValidElement(fields[0]);
  const basic = grouped ? H.cloneElement(fields[0],{extra:Q.jsx(XboardCollapsibleGroup,{
    title:XboardT('更多节点属性'),hint:XboardT('动态倍率 · 流量限制 · 标签 · 权限组'),fieldsClassName:'xb-optional-fields',
    fields:fields.slice(groupStart,groupEnd + 1)})}) : fields[0];
  return Q.jsxs('div',{className,children:[
    basic,
    ...fields.slice(1, grouped ? groupStart : fields.length - 3),
    ...fields.slice(grouped ? groupEnd + 1 : fields.length - 3, fields.length - 3),
    Q.jsx(XboardCollapsibleGroup,{title:XboardT('归属与部署'),hint:XboardT('父级节点 · 路由组 · 绑定服务器'),
      className:'xb-assignment-details',fieldsClassName:'xb-assignment-fields',
      fields:fields.slice(-3)})
  ]});
}

function XboardCdnLayout({form, protocol, cdn, server, client, revision, toggle, sync, text, change, describe}) {
  const {t} = jy('server');
  const enabled = !!cdn?.enabled;
  const reality = Number(client.tls) === 2 || Number(server?.protocol_settings?.tls) === 2;
  const stage = (label, address, detail, kind) => Q.jsxs('div', {className:'xb-summary-stage', children:[
    Q.jsxs('span',{className:'xb-summary-label',children:[Q.jsx('i',{className:kind}),label]}),
    Q.jsx('strong',{children:address}),Q.jsx('small',{children:detail})
  ]});
  return Q.jsxs('section', {className:'xb-cdn', 'data-xboard-cdn':'', children:[
    Q.jsxs('div', {className:'xb-split-card',children:[
      Q.jsxs('div',{className:'xb-split-top',children:[
        Q.jsx('span',{className:'xb-split-icon',children:Q.jsx(XboardEditorIcon,{name:'cloud'})}),
        Q.jsxs('div',{className:'xb-split-title',children:[
          Q.jsx('h3',{id:'xb-split-title',children:XboardT('客户端与服务端分离')}),
          Q.jsx('span',{className:enabled?'xb-state-on':'xb-state-off',children:enabled?XboardT('已开启'):XboardT('未开启')})]}),
        Q.jsxs('label',{className:'xb-switch',children:[
          Q.jsx('input',{type:'checkbox',role:'switch','aria-labelledby':'xb-split-title',checked:enabled,
            onChange:event=>toggle(event.target.checked)}),Q.jsx('span',{'aria-hidden':true})]})
      ]}),
      Q.jsx('p',{children:XboardT('开启此功能可单独配置推送到服务端的内容，外部窗口的配置项仅作为对客户端的配置推送。')})
    ]}),
    !enabled && Q.jsxs('div',{className:'xb-disabled-state',children:[
      Q.jsx(XboardEditorIcon,{name:'server'}),Q.jsx('h3',{children:XboardT('当前使用统一连接配置')}),
      Q.jsx('p',{children:XboardT('开启上方开关，即可单独设置服务端的地址、端口、安全性和传输参数。')})]}),
    enabled && Q.jsxs('div',{className:'xb-origin-section',children:[
      Q.jsxs('div',{className:'xb-connection-summary','aria-live':'polite',children:[
        stage(XboardT('外层 · 客户端'),form.getValues('host')+':'+form.getValues('port'),describe(client),'xb-dot-blue'),
        Q.jsx(XboardEditorIcon,{name:'arrow',className:'xb-summary-arrow'}),
        Q.jsxs('div',{className:'xb-summary-edge',children:[Q.jsx(XboardEditorIcon,{name:'cloud'}),
          Q.jsx('strong',{children:reality?XboardT('连接入口'):XboardT('CDN / 反向代理')}),Q.jsx('small',{children:XboardT('需单独配置')})]}),
        Q.jsx(XboardEditorIcon,{name:'arrow',className:'xb-summary-arrow'}),
        stage(XboardT('内层 · 服务端'),server.host+':'+server.server_port,describe(server.protocol_settings),'xb-dot-green')
      ]}),
      reality && Q.jsx('p',{className:'xb-info-note',children:XboardT('Reality 需要端到端握手，普通 HTTP CDN 无法转发该握手。')}),
      Q.jsxs('div',{className:'xb-origin-heading',children:[
        Q.jsxs('div',{children:[Q.jsxs('h3',{children:[Q.jsx(XboardEditorIcon,{name:'server'}),XboardT('服务端配置'),
          Q.jsx('span',{className:'xb-protocol-badge',children:String(protocol).toUpperCase()})]}),
          Q.jsx('p',{children:XboardT('分离开启后，下发至 xboard-node-u 的连接配置以此处为准。')})]}),
        Q.jsxs(Lf,{type:'button',variant:'outline',onClick:sync,children:[Q.jsx(XboardEditorIcon,{name:'sync'}),XboardT('同步配置')]})
      ]}),
      Q.jsxs('div',{className:'xb-origin-addresses',children:[
        text(XboardT('节点地址'),'host',XboardT('供服务端配置使用，监听 IP 由现有节点端逻辑决定。')),
        Q.jsxs('div',{className:'xb-two-columns',children:[
          text(XboardT('连接端口'),'port',XboardT('保留服务端连接表单值。')),
          text(XboardT('服务端端口'),'server_port',XboardT('xboard-node-u 实际监听端口。'))
        ]})
      ]}),
      Number(server.protocol_settings.tls)===2 && Q.jsxs('label',{className:'xb-reality-target',children:[
        Q.jsx('span',{children:XboardT('Reality 目标站（可选）')}),
        Q.jsx(u8e,{value:server.protocol_settings.reality_settings?.dest||'',
          onChange:event=>change('protocol_settings.reality_settings.dest',event.target.value)}),
        Q.jsx('small',{children:XboardT('例如 example.com:443。为空时使用现有 Reality SNI 和端口规则。')})
      ]}),
      Q.jsx(o5t,{serverType:protocol,value:server.protocol_settings,side:'server',
        onChange:settings=>change('protocol_settings',settings)},revision),
      Object.hasOwn(s5t[protocol]?.schema?.shape||{},'multiplex') && Q.jsxs('details',{className:'xb-multiplex-details',children:[
        Q.jsx('summary',{children:XboardT('服务端多路复用')}),
        Q.jsx(w4t,{form,t,prefix:'cdn_settings.server.protocol_settings.multiplex'})
      ]}),
      Q.jsxs('p',{className:'xb-origin-footnote',children:[Q.jsx(XboardEditorIcon,{name:'info'}),
        XboardT('证书、自定义路由与出站仍在原高级设置菜单中配置。')]})
    ]})
  ]});
}
