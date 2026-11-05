<?php

namespace App\Support;

use RuntimeException;

final class AdminAssetPatcher
{
    // The upstream distributes compiled admin assets. Keep the submodule
    // untouched and generate a small, reproducible extension during builds.
    private const UPSTREAM_SHA256 = 'f04f09a95bfdb04fa5132e336bf87c364d4e360cb95774872ff18eb69e9bcd77';

    public static function patch(string $source, string $component): string
    {
        if (hash('sha256', $source) !== self::UPSTREAM_SHA256) {
            throw new RuntimeException('Admin bundle changed: review the fallback extension before building.');
        }
        foreach (['A4t' => 'vless', 'W4t' => 'trojan'] as $schema => $protocol) {
            $old = $schema . '=(e,t)=>py({tls:';
            $new = $schema . '=(e,t)=>py({xray_fallback:cy().optional().default(""),tls:';
            if (substr_count($source, $old) !== 1) {
                throw new RuntimeException('Unexpected admin schema anchor: ' . $protocol);
            }
            $source = str_replace($old, $new, $source);
            $marker = 'dynamic_form.' . $protocol . '.network.label';
            if (substr_count($source, $marker) !== 1) {
                throw new RuntimeException('Unexpected admin transport anchor: ' . $protocol);
            }
            $position = strpos($source, $marker);
            $prefix = substr($source, 0, $position);
            $field = 'Q.jsx($y,{control:e.control,name:"network",';
            $insert = strrpos($prefix, $field);
            if ($insert === false || $position - $insert > 300) {
                throw new RuntimeException('Cannot locate the transport field: ' . $protocol);
            }
            $source = substr_replace($source, 'Q.jsx(XboardFallbackInput,{form:e,protocol:"' . $protocol . '"}),', $insert, 0);
        }
        foreach ([
            'Q.jsx(aZt,{value:g,' => '支持 Sing-box 原生 type 配置、Xray 原生出站及旧 protocol/settings 格式；按服务端实际内核生效。',
            'Q.jsx(aZt,{value:_,' => '填写实际内核的 rules 数组。Sing-box 使用 action/outbound，Xray 使用 outboundTag；无匹配条件的规则可能接管全部流量。',
        ] as $anchor => $hint) {
            if (substr_count($source, $anchor) !== 1) {
                throw new RuntimeException('Unexpected custom configuration editor anchor.');
            }
            $source = str_replace($anchor, 'Q.jsx("p",{className:"text-xs text-muted-foreground",children:XboardT(' . json_encode($hint, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . ')}),' . $anchor, $source);
        }
        // The advanced form is protocol-specific and does not retain a type
        // field. Pass the outer editor's selected protocol explicitly.
        foreach ([
            'function l5t({form:e,certPath:' => 'function l5t({form:e,protocol:inboundProtocol,certPath:',
            'Q.jsx(l5t,{form:x,certPath:' => 'Q.jsx(l5t,{form:x,protocol:l,certPath:',
            'Q.jsx(aZt,{value:_,' => 'Q.jsx(XboardInboundTag,{protocol:inboundProtocol}),Q.jsx(aZt,{value:_,',
        ] as $anchor => $replacement) {
            if (substr_count($source, $anchor) !== 1) {
                throw new RuntimeException('Unexpected inbound tag display anchor.');
            }
            $source = str_replace($anchor, $replacement, $source);
        }
        $replacements = [
            'function l5t({form:e,protocol:inboundProtocol,certPath:'
                => 'function l5t({form:outer,protocol:inboundProtocol,certPath:',
            'hasMultiplex:n=!1}){const{t:i}=jy("server"),[r,s]'
                => 'hasMultiplex:n=!1}){const e=Nv({defaultValues:{}});const{t:i}=jy("server"),[r,s]',
            'E=(t="cert")=>{let i=t;'
                => 'E=(t="cert")=>{e.reset(structuredClone(outer.getValues()));let i=t;',
            '[g,p]=H.useState(""),[m,f]=H.useState(null),[_,v]=H.useState("")'
                => '[g,p,_,v,loadCustom,activeKernel,customTouched]=XboardCustomDrafts(e,inboundProtocol),[m,f]=H.useState(null)',
            'const r=e.getValues(u),o=e.getValues(h);var c;p(Array.isArray(r)&&r.length>0?JSON.stringify(r,null,2):""),v(Array.isArray(o)&&o.length>0?JSON.stringify(o,null,2):"")'
                => 'var c;loadCustom(outer.getValues())',
            'Q.jsx(aZt,{value:g,onChange:'
                => 'Q.jsx(XboardCustomExample,{kind:"outbounds",form:e,kernel:activeKernel,protocol:inboundProtocol,onApply:p}),Q.jsx(aZt,{value:g,onChange:',
            'Q.jsx(aZt,{value:_,onChange:'
                => 'Q.jsx(XboardCustomExample,{kind:"routes",form:e,kernel:activeKernel,protocol:inboundProtocol,onApply:v}),Q.jsx(aZt,{value:_,onChange:',
            '!(c=e.getValues(d))'
                => '!(c=outer.getValues(d))',
            'gridTemplateColumns:`repeat(${2+(l?1:0)+(n?1:0)}, minmax(0, 1fr))`'
                => 'gridTemplateColumns:`repeat(${3+(l?1:0)+(n?1:0)}, minmax(92px, 1fr))`,display:"grid",justifyContent:"start",overflowX:"auto"',
            'children:[l&&Q.jsx(ow,{value:"cert"'
                => 'children:[Q.jsx(ow,{value:"cdn",children:XboardT("CDN套用")}),l&&Q.jsx(ow,{value:"cert"',
            'max-h-[60vh] min-h-[350px] overflow-y-auto px-6 py-4",children:[Q.jsx(aw'
                => 'min-h-0 overflow-y-auto px-6 py-4",style:{maxHeight:"52dvh"},children:[Q.jsx(aw,{value:"cdn",forceMount:true,hidden:o!=="cdn",children:r&&Q.jsx(XboardCdnFields,{form:e,protocol:inboundProtocol})}),Q.jsx(aw',
            'const t=x.getValues(),n=parseFloat(t.transfer_enable_gb'
                => 'const t=x.getValues();if(t.protocol_settings?.transport_draft_invalid)return gE.error(XboardT("请先修正传输 JSON。"));const n=parseFloat(t.transfer_enable_gb',
            'return!t})()&&s(!1)'
                => 'return!t})()&&XboardCommitAdvanced(outer,e,inboundProtocol,customTouched)&&s(!1)',
            'custom_routes:gy(hy()).default([]),protocol_settings:'
                => 'custom_routes:gy(hy()).default([]),cdn_settings:hy().optional(),protocol_settings:',
            'custom_routes:[],protocol_settings:{},listen_address:'
                => 'custom_routes:[],cdn_settings:null,protocol_settings:{},listen_address:',
            'let r=n;if(i?.schema)'
                => 'let r=n;if(!XboardCanChangeProtocol(x,t))return;if(i?.schema)',
            'r&&(l?Q.jsx(o5t,{serverType:l,value:w,onChange:L})'
                => 'x.watch("cdn_settings")?.enabled&&Q.jsx("p",{className:"text-xs text-muted-foreground",children:XboardT("节点地址和连接端口供客户端连接。服务端监听端口在高级设置 → CDN套用中修改。")}),r&&(l?Q.jsx(o5t,{serverType:l,value:w,onChange:L,cdn:x.watch("cdn_settings")})',
            'o5t=({serverType:e,value:t,onChange:n})'
                => 'o5t=({serverType:e,value:t,onChange:n,cdn,side})',
            'Q.jsx(c,{form:l,t:i})'
                => 'Q.jsx(XboardConnectionContext().Provider,{value:{cdn,side},children:Q.jsxs(Q.Fragment,{children:[!["vless","vmess","trojan"].includes(e)&&Q.jsx(XboardKernelSelect,{form:l,protocol:e}),Q.jsx(c,{form:l,t:i})]})})',
            'onClick:()=>{const e=t.value;e&&x.setValue("server_port",e)}'
                => 'disabled:!!x.watch("cdn_settings")?.enabled,onClick:()=>{const e=t.value;e&&x.setValue("server_port",e)}',
            'children:e("form.submit")'
                => 'children:XboardT("保存节点")',
            'children:i("common.save","Save")'
                => 'children:XboardT("保存")',
            'placeholder:e("form.server_port.placeholder"),className:"h-9 font-mono text-xs",...t'
                => 'placeholder:e("form.server_port.placeholder"),className:"h-9 font-mono text-xs",...t,disabled:!!x.watch("cdn_settings")?.enabled,title:x.watch("cdn_settings")?.enabled?XboardT("在高级设置 → CDN套用中设置服务端端口"):undefined',
            'flex flex-row items-center justify-between border-t bg-muted/20 px-6 py-4 sm:space-x-0'
                => 'flex flex-row flex-wrap items-center justify-end gap-2 border-t bg-muted/20 px-3 py-3 sm:space-x-0',
        ];
        foreach ($replacements as $anchor => $replacement) {
            if (substr_count($source, $anchor) !== 1) {
                throw new RuntimeException('Unexpected CDN admin anchor: ' . $anchor);
            }
            $source = str_replace($anchor, $replacement, $source);
        }
        foreach (['vmess.tls_settings', 'vless.tls_settings', 'trojan'] as $field) {
            $marker = 'dynamic_form.' . $field . '.allow_insecure';
            if (substr_count($source, $marker) !== 1) {
                throw new RuntimeException('Unexpected TLS compatibility anchor: ' . $marker);
            }
            $position = strpos($source, $marker);
            $start = strrpos(substr($source, 0, $position), 'Q.jsx($y,{control:e.control,name:"tls_settings.allow_insecure",');
            $end = strpos($source, '})})]})})', $position);
            if ($start === false || $end === false || $end - $start > 800) {
                throw new RuntimeException('Unexpected TLS switch: ' . $marker);
            }
            $end += strlen('})})]})})');
            $source = substr_replace($source, 'Q.jsx(XboardTlsAllowInsecure,{form:e,label:t("' . $marker . '")})', $start, $end - $start);
        }
        foreach (['vless', 'vmess', 'trojan'] as $protocol) {
            $position = strpos($source, 'dynamic_form.' . $protocol . '.network.label');
            $start = strrpos(substr($source, 0, $position), 'Q.jsx($y,{control:e.control,name:"network",');
            $end = strpos($source, ']})})', $position);
            if ($start === false || $end === false || $end - $start > 1200) {
                throw new RuntimeException('Unexpected CDN transport component: ' . $protocol);
            }
            // The nested select ends before the form field's children array.
            $end = strpos($source, '})]})})', $end);
            if ($end === false || $end - $start > 1200) {
                throw new RuntimeException('Unexpected CDN transport component end: ' . $protocol);
            }
            $end += strlen('})]})})');
            $source = substr_replace($source, 'Q.jsx(XboardTransportEditor,{form:e,protocol:"' . $protocol . '"})', $start, $end - $start);
        }
        $reality = 'reality_settings:py({server_port:';
        if (substr_count($source, $reality) !== 2) {
            throw new RuntimeException('Unexpected Reality schema anchors.');
        }
        $source = str_replace($reality, 'reality_settings:py({dest:cy().nullable().optional(),server_port:', $source);
        $anchor = 'a=H.useMemo(()=>o?.schema||fy(hy()),[e])';
        if (substr_count($source, $anchor) !== 1) {
            throw new RuntimeException('Unexpected target kernel schema anchor.');
        }
        $source = str_replace($anchor, 'a=H.useMemo(()=>o?.schema?.extend({target_kernel:cy().nullable().optional(),transport_draft_invalid:uy().optional()})||fy(hy()),[e])', $source);
        $flowOptions = 'flowOptions:["none","xtls-rprx-direct","xtls-rprx-splice","xtls-rprx-vision"]';
        $flowField = 'Q.jsx($y,{control:e.control,name:"flow",render:({field:e})=>Q.jsxs(Gy,{children:[Q.jsx(Zy,{className:"font-mono text-[12px] text-foreground/80",children:t("dynamic_form.vless.flow.label")}),Q.jsx(Yy,{children:Q.jsxs(yzt,{onValueChange:t=>e.onChange("none"===t?null:t),value:e.value||"none",children:[Q.jsx(Czt,{className:"font-mono text-xs",children:Q.jsx(wzt,{placeholder:t("dynamic_form.vless.flow.placeholder")})}),Q.jsx(Nzt,{children:P4t.flowOptions.map(e=>Q.jsx(Lzt,{value:e,children:e},e))})]})})]})})';
        if (substr_count($source, $flowOptions) !== 1 || substr_count($source, $flowField) !== 1) {
            throw new RuntimeException('Unexpected VLESS flow editor anchors.');
        }
        $source = str_replace($flowOptions, 'flowOptions:["none","xtls-rprx-vision"]', $source);
        $source = str_replace($flowField, 'Q.jsx(XboardFlowInput,{form:e,t})', $source);
        // Presentation-only layout anchors; preserve the original form and handlers.
        $layoutReplacements = [
            'Q.jsxs(ptt,{className:"max-w-xl gap-0 overflow-hidden p-0 sm:rounded-2xl"' => 'Q.jsxs(ptt,{className:"xb-node-dialog max-w-xl gap-0 overflow-hidden p-0 sm:rounded-2xl"',
            'Q.jsx(ptt,{className:"max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-2xl"' => 'Q.jsx(ptt,{className:"xb-advanced-dialog max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-2xl"',
            'Q.jsxs(mtt,{className:"border-b bg-muted/20 px-6 pb-4 pt-6"' => 'Q.jsxs(mtt,{className:"xb-node-head border-b bg-muted/20 px-6 pb-4 pt-6"',
            'className:"flex h-[75vh] min-h-[500px] flex-col"' => 'className:"xb-node-shell flex h-[75vh] min-h-[500px] flex-col"',
            'Q.jsxs("div",{className:"flex-1 space-y-8 overflow-y-auto px-6 py-6"' => 'Q.jsxs(XboardNodeEditorBody,{className:"xb-node-body flex-1 space-y-8 overflow-y-auto px-6 py-6"',
            'children:[Q.jsxs("div",{className:"space-y-4",children:[Q.jsxs("div",{className:"flex gap-4",children:[Q.jsx($y,{control:x.control,name:"name"' => 'children:[Q.jsxs(XboardNodeBasicSection,{className:"xb-basic-section",children:[Q.jsxs("div",{className:"flex gap-4",children:[Q.jsx($y,{control:x.control,name:"name"',
            'Q.jsxs("div",{className:"space-y-4",children:[Q.jsx("div",{className:"flex space-x-2",children:Q.jsx($y,{control:x.control,name:"host"' => 'Q.jsxs("div",{className:"xb-connection-section space-y-4",children:[Q.jsx(XboardConnectionHeading,{form:x}),Q.jsx("div",{className:"flex space-x-2",children:Q.jsx($y,{control:x.control,name:"host"',
            'Q.jsxs(Q.Fragment,{children:[!["vless","vmess","trojan"].includes(e)&&Q.jsx(XboardKernelSelect,{form:l,protocol:e}),Q.jsx(c,{form:l,t:i})]})' => 'Q.jsxs("div",{className:"xb-protocol-fields",children:[!["vless","vmess","trojan"].includes(e)&&Q.jsx(XboardKernelSelect,{form:l,protocol:e}),Q.jsx(c,{form:l,t:i})]})',
            'className:"flex flex-row flex-wrap items-center justify-end gap-2 border-t bg-muted/20 px-3 py-3 sm:space-x-0"' => 'className:"xb-node-footer flex flex-row flex-wrap items-center justify-end gap-2 border-t bg-muted/20 px-3 py-3 sm:space-x-0"',
            'Q.jsxs(mtt,{className:"px-6 pb-2 pt-6"' => 'Q.jsxs(mtt,{className:"xb-advanced-head px-6 pb-2 pt-6"',
            'Q.jsx("div",{className:"mb-2 flex items-center justify-between",children:Q.jsx(_tt,{className:"font-mono text-sm tracking-wide",children:i("dynamic_form.advanced.dialog_title","Advanced Protocol Configuration")})})' => 'Q.jsx(XboardAdvancedHeading,{form:outer,protocol:inboundProtocol})',
            'className:"grid w-full rounded-lg bg-muted/50 p-1"' => 'className:"xb-tabs grid w-full rounded-lg bg-muted/50 p-1"',
            'className:"min-h-0 overflow-y-auto px-6 py-4",style:{maxHeight:"52dvh"}' => 'className:"xb-advanced-body min-h-0 overflow-y-auto px-6 py-4"',
            'Q.jsxs(ftt,{className:"border-t bg-muted/20 px-6 py-4"' => 'Q.jsxs(ftt,{className:"xb-advanced-footer border-t bg-muted/20 px-6 py-4"',
            'onClick:()=>E(l?"cert":n?"multiplex":"outbounds")' => 'onClick:()=>E("cdn")',
            'children:[Q.jsx(ow,{value:"cdn",children:XboardT("CDN套用")}),l&&Q.jsx(ow,{value:"cert",className:"text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",children:i("dynamic_form.advanced.tls_tab","TLS")}),n&&Q.jsx(ow,{value:"multiplex",className:"text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",children:i("dynamic_form.advanced.multiplex_tab","Multiplex")}),Q.jsx(ow,{value:"outbounds",className:"text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",children:i("dynamic_form.routing.outbounds_tab","Outbounds")}),Q.jsx(ow,{value:"routes",className:"text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",children:i("dynamic_form.routing.routes_tab","Routes")})]' => 'children:[l&&Q.jsx(ow,{value:"cert",children:Q.jsx(XboardEditorTab,{name:"lock",text:XboardT("证书配置")})}),Q.jsx(ow,{value:"outbounds",children:Q.jsx(XboardEditorTab,{name:"out",text:XboardT("自定义出站")})}),Q.jsx(ow,{value:"routes",children:Q.jsx(XboardEditorTab,{name:"route",text:XboardT("自定义路由")})}),n&&Q.jsx(ow,{value:"multiplex",children:Q.jsx(XboardEditorTab,{name:"grid",text:XboardT("多路复用")})}),Q.jsx(ow,{value:"cdn",children:Q.jsx(XboardEditorTab,{name:"cloud",text:XboardT("CDN套用")})})]',
        ];
        $layoutStart = strpos($source, 'o5t=({serverType:');
        $layoutEnd = strpos($source, 'function b5t(', $layoutStart);
        if ($layoutStart === false || $layoutEnd === false) {
            throw new RuntimeException('Cannot locate the scoped node editor.');
        }
        $layoutSource = substr($source, $layoutStart, $layoutEnd - $layoutStart);
        foreach ($layoutReplacements as $anchor => $replacement) {
            if (substr_count($layoutSource, $anchor) !== 1) {
                throw new RuntimeException('Unexpected node editor layout anchor: ' . $anchor);
            }
            $layoutSource = str_replace($anchor, $replacement, $layoutSource);
        }
        $source = substr_replace($source, $layoutSource, $layoutStart, $layoutEnd - $layoutStart);
        return $source . "\n;" . $component . "\n";
    }

    public static function readComponents(string $root): string
    {
        return implode("\n; ", array_map(
            fn (string $name) => file_get_contents($root . '/resources/js/' . $name . '.js'),
            ['admin-i18n', 'admin-fallback', 'admin-cdn', 'admin-transport', 'admin-editor']
        ));
    }

    public static function prepare(string $root): array
    {
        $admin = $root . '/public/assets/admin';
        $manifest = json_decode(file_get_contents($admin . '/manifest.json'), true, flags: JSON_THROW_ON_ERROR);
        $entry = $manifest['index.html']['file'] ?? '';
        if (!preg_match('/\Aassets\/[a-zA-Z0-9_-]+\.js\z/D', $entry)) {
            throw new RuntimeException('Missing pinned admin entry. Initialize the admin submodule.');
        }
        $source = file_get_contents($admin . '/' . $entry);
        $component = self::readComponents($root);
        $patched = self::patch($source, $component);
        $output = substr($entry, 0, -3) . '.xboard-u-' . substr(hash('sha256', $patched), 0, 12) . '.js';
        if (file_put_contents($admin . '/' . $output, $patched) === false) {
            throw new RuntimeException('Cannot write generated admin entry.');
        }
        $metadata = [$entry => $output];
        $directory = $root . '/public/assets/xboard-u';
        if (!is_dir($directory) && !mkdir($directory, 0755, true)) {
            throw new RuntimeException('Cannot create admin metadata directory.');
        }
        $css = file_get_contents($root . '/resources/css/admin-editor.css');
        $cssName = 'admin-editor-' . substr(hash('sha256', $css), 0, 12) . '.css';
        if (file_put_contents($directory . '/' . $cssName, $css) === false) {
            throw new RuntimeException('Cannot write node editor stylesheet.');
        }
        $metadata['__editor_css'] = $cssName;
        if (file_put_contents($directory . '/admin-entry.json', json_encode($metadata, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)) === false) {
            throw new RuntimeException('Cannot write generated admin metadata.');
        }
        return $metadata;
    }
}
