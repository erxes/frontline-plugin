/**
 * The site's stylesheet, inline in each page so a page is one request. The help center's colours
 * and fonts arrive as CSS variables on `<body>`; each falls back to a neutral default.
 */
export const SITE_CSS = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;
  font:16px/1.6 var(--hc-font,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif);
  color:var(--hc-text,#334155);background:var(--hc-body,#f8fafc)}
main{flex:1}
h1,h2,h3{font-family:var(--hc-heading-font,inherit);color:var(--hc-heading,#0f172a);line-height:1.25;margin:0}
a{color:var(--hc-link,var(--hc-brand));text-underline-offset:3px}
a:hover{color:var(--hc-link-hover,var(--hc-brand))}
img{max-width:100%;height:auto}
:focus-visible{outline:2px solid var(--hc-brand);outline-offset:2px}
.hc-skip{position:absolute;left:-999px;top:8px;background:#fff;color:#0f172a;padding:8px 12px;border-radius:6px;z-index:10}
.hc-skip:focus{left:8px}
.hc-wrap{width:100%;max-width:1080px;margin:0 auto;padding:0 20px}
.hc-header{background:var(--hc-header);color:var(--hc-header-text)}
.hc-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px;flex-wrap:wrap}
.hc-brand{display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none;font-weight:600;font-size:17px}
.hc-brand:hover{color:inherit}
.hc-brand img{height:32px;width:auto;max-width:160px;object-fit:contain}
.hc-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:var(--hc-header-text);color:var(--hc-header);font-weight:700}
.hc-header nav{display:flex;gap:4px;flex-wrap:wrap}
.hc-header nav a{color:inherit;text-decoration:none;padding:6px 12px;border-radius:999px;font-size:15px;opacity:.85}
.hc-header nav a:hover,.hc-header nav a[aria-current]{opacity:1;background:color-mix(in srgb,var(--hc-header-text) 14%,transparent)}
.hc-hero{background:var(--hc-header);color:var(--hc-header-text);padding:40px 0 56px;background-size:cover;background-position:center}
.hc-hero h1{color:inherit;font-size:clamp(28px,5vw,44px);letter-spacing:-.02em}
.hc-hero p{margin:12px 0 0;max-width:640px;opacity:.85;font-size:18px}
.hc-search{display:flex;margin-top:28px;max-width:640px;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgb(0 0 0 / .15);overflow:hidden}
.hc-search input{flex:1;min-width:0;border:0;padding:14px 16px;font:inherit;color:#0f172a;background:transparent}
.hc-search input:focus{outline:none}
.hc-search:focus-within{outline:2px solid var(--hc-header-text);outline-offset:2px}
.hc-search button{border:0;padding:0 20px;font:inherit;font-weight:600;cursor:pointer;background:var(--hc-button);color:var(--hc-button-text)}
.hc-section{padding-block:40px}
.hc-section h2,.hc-page-title{font-size:22px;margin-bottom:16px}
.hc-page-title{font-size:30px;margin-bottom:8px}
.hc-lede{margin:0 0 24px;color:var(--hc-text,#475569)}
.hc-cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));list-style:none;padding:0;margin:0}
.hc-card{position:relative;display:flex;flex-direction:column;gap:6px;height:100%;padding:20px;border-radius:14px;
  background:var(--hc-subtle,#fff);border:1px solid var(--hc-divider,#e2e8f0);transition:border-color .15s,box-shadow .15s}
.hc-card:hover{border-color:var(--hc-brand);box-shadow:0 6px 20px rgb(15 23 42 / .08)}
.hc-card h3{font-size:17px}
.hc-card a{text-decoration:none;color:inherit}
.hc-card a::after{content:"";position:absolute;inset:0}
.hc-card p{margin:0;font-size:14px;color:var(--hc-text,#64748b)}
.hc-card small{margin-top:auto;padding-top:8px;font-size:13px;color:var(--hc-brand)}
.hc-list{list-style:none;padding:0;margin:0;background:var(--hc-subtle,#fff);border:1px solid var(--hc-divider,#e2e8f0);border-radius:14px}
.hc-list li+li{border-top:1px solid var(--hc-divider,#e2e8f0)}
.hc-list a{display:block;padding:14px 18px;text-decoration:none;color:var(--hc-heading,#0f172a);font-weight:500}
.hc-list a:hover{color:var(--hc-link-hover,var(--hc-brand))}
.hc-list small{display:block;font-weight:400;font-size:14px;color:var(--hc-text,#64748b);margin-top:2px}
.hc-columns{display:grid;gap:32px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.hc-crumbs{display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0;margin:0 0 16px;font-size:14px}
.hc-crumbs li+li::before{content:"/";margin-right:6px;opacity:.5}
.hc-crumbs a{text-decoration:none;color:var(--hc-text,#64748b)}
.hc-crumbs a:hover{color:var(--hc-link-hover,var(--hc-brand));text-decoration:underline}
.hc-article-grid{display:grid;gap:32px;grid-template-columns:minmax(0,1fr) 280px;align-items:start}
@media (max-width:860px){.hc-article-grid{grid-template-columns:1fr}}
.hc-article{background:var(--hc-subtle,#fff);border:1px solid var(--hc-divider,#e2e8f0);border-radius:16px;padding:clamp(20px,4vw,40px)}
.hc-article .hc-lede{margin:4px 0 0;font-size:18px}
.hc-meta{display:flex;gap:16px;flex-wrap:wrap;margin:8px 0 24px;font-size:14px;color:var(--hc-text,#64748b)}
.hc-cover{border-radius:12px;margin-bottom:24px}
.hc-body{overflow-wrap:anywhere}
.hc-body img{border-radius:8px}
.hc-body table{border-collapse:collapse;width:100%}
.hc-body td,.hc-body th{border:1px solid var(--hc-divider,#e2e8f0);padding:6px 10px}
.hc-body pre{overflow:auto;background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px}
.hc-files{margin-top:32px;padding-top:20px;border-top:1px solid var(--hc-divider,#e2e8f0)}
.hc-files h2{font-size:16px;margin-bottom:8px}
.hc-aside{position:sticky;top:20px;display:grid;gap:24px}
.hc-aside h2{font-size:15px;margin-bottom:10px}
.hc-aside a[aria-current]{color:var(--hc-brand)}
.hc-pager{display:flex;justify-content:space-between;gap:12px;margin-top:20px}
.hc-pager a[rel=next]{margin-left:auto}
.hc-empty{padding:32px;text-align:center;border:1px dashed var(--hc-divider,#cbd5e1);border-radius:14px}
.hc-footer{margin-top:48px;background:var(--hc-footer);color:var(--hc-footer-text);padding:32px 0;font-size:14px}
.hc-footer a{color:inherit;opacity:.8}
.hc-footer a:hover{color:inherit;opacity:1}
.hc-footer h2{color:inherit;font-size:13px;text-transform:uppercase;letter-spacing:.06em;opacity:.7;margin-bottom:10px}
.hc-footer ul{list-style:none;padding:0;margin:0;display:grid;gap:6px}
.hc-footer-grid{display:grid;gap:32px;grid-template-columns:2fr repeat(auto-fit,minmax(140px,1fr))}
.hc-footer-logo{height:28px;width:auto;margin-bottom:8px}
.hc-copyright{margin-block:0;opacity:.7}
.hc-footer-grid+.hc-copyright{margin-top:32px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
