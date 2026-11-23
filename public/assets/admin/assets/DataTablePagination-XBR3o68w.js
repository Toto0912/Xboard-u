import{j as e}from"./query-CF8bXe8F.js";import{f as o,u,B as i,x as f}from"./index-Dgsm6II3.js";import{a as v,b as N,c as b,d as w,e as g}from"./skeleton-DSFkFpXo.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]],k=o("chevron-left",y);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=[["path",{d:"m11 17-5-5 5-5",key:"13zhaf"}],["path",{d:"m18 17-5-5 5-5",key:"h8a8et"}]],S=o("chevrons-left",C);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=[["path",{d:"m6 17 5-5-5-5",key:"xnjwq"}],["path",{d:"m13 17 5-5-5-5",key:"17xmmf"}]],z=o("chevrons-right",_);function L({total:l,selectedCount:r,page:m,pageSize:d,pageSizeOptions:p=[10,20,50,100,500],onPageChange:t,onPageSizeChange:j}){const{t:c}=u(),s=Math.max(0,Math.ceil(l/d)),a=s===0?1:Math.min(Math.max(1,m),s),h=a>1&&s>0,x=a<s&&s>0;return e.jsxs("div",{className:"flex flex-wrap items-center justify-between gap-4 px-1 py-2 text-xs text-muted-foreground",children:[e.jsx("div",{children:r!==void 0?c("table.selectedTotal",{selected:r,total:l}):c("table.totalOnly",{total:l})}),e.jsxs("div",{className:"flex flex-wrap items-center gap-4",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{children:c("table.perPage")}),e.jsxs(v,{value:String(d),onValueChange:n=>{j(Number(n)),t(1)},children:[e.jsx(N,{className:"h-8 w-[76px] text-xs",children:e.jsx(b,{})}),e.jsx(w,{children:p.map(n=>e.jsx(g,{value:String(n),children:n},n))})]})]}),e.jsx("span",{children:c("table.pageInfo",{page:s===0?1:a,totalPages:s})}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx(i,{type:"button",variant:"outline",size:"icon",className:"h-8 w-8",disabled:!h,onClick:()=>t(1),children:e.jsx(S,{className:"h-3.5 w-3.5"})}),e.jsx(i,{type:"button",variant:"outline",size:"icon",className:"h-8 w-8",disabled:!h,onClick:()=>t(a-1),children:e.jsx(k,{className:"h-3.5 w-3.5"})}),e.jsx(i,{type:"button",variant:"outline",size:"icon",className:"h-8 w-8",disabled:!x,onClick:()=>t(a+1),children:e.jsx(f,{className:"h-3.5 w-3.5"})}),e.jsx(i,{type:"button",variant:"outline",size:"icon",className:"h-8 w-8",disabled:!x,onClick:()=>t(s),children:e.jsx(z,{className:"h-3.5 w-3.5"})})]})]})]})}export{L as D};
