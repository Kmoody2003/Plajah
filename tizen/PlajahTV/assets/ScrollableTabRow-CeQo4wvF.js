import{r as s,j as t,C as v,a5 as k}from"./index-CRiTVTbV.js";const j=({children:a,className:f="",innerClassName:b="",scrollStep:d=240})=>{const l=s.useRef(null),[n,m]=s.useState(!1),[i,x]=s.useState(!1),r=s.useCallback(()=>{const e=l.current;e&&(m(e.scrollLeft>4),x(e.scrollLeft<e.scrollWidth-e.clientWidth-4))},[]);s.useEffect(()=>{const e=l.current;if(!e)return;const o=setTimeout(r,0);e.addEventListener("scroll",r,{passive:!0});const u=new ResizeObserver(r);return u.observe(e),()=>{clearTimeout(o),e.removeEventListener("scroll",r),u.disconnect()}},[r,a]);const c=e=>{var o;(o=l.current)==null||o.scrollBy({left:e*d,behavior:"smooth"})},h=`linear-gradient(to right, ${n?"transparent 0px, black 44px":"black 0px"}, ${i?"black calc(100% - 44px), transparent 100%":"black 100%"})`;return t.jsxs("div",{className:`relative flex items-center w-full ${f}`,children:[t.jsx("button",{onClick:()=>c(-1),"aria-label":"Scroll tabs left",className:`
          absolute left-0 z-20 hidden md:flex
          items-center justify-center w-6 h-6 rounded-full
          bg-white/10 border border-white/10 hover:bg-white/20
          text-white/50 hover:text-white
          transition-all duration-200 shrink-0
          ${n?"opacity-100":"opacity-0 pointer-events-none"}
        `,children:t.jsx(v,{size:12})}),t.jsx("div",{ref:l,className:`flex items-center overflow-x-auto scrollbar-hide w-full ${b}`,style:{maskImage:h,WebkitMaskImage:h},children:a}),t.jsx("button",{onClick:()=>c(1),"aria-label":"Scroll tabs right",className:`
          absolute right-0 z-20 hidden md:flex
          items-center justify-center w-6 h-6 rounded-full
          bg-white/10 border border-white/10 hover:bg-white/20
          text-white/50 hover:text-white
          transition-all duration-200 shrink-0
          ${i?"opacity-100":"opacity-0 pointer-events-none"}
        `,children:t.jsx(k,{size:12})})]})};export{j as S};
