import re

with open('建材.html', 'r', encoding='utf-8') as f:
    content = f.read()

new_css = """
    :root{--bg:#ffffff;--bg-soft:#f0f0f0;--panel:#ffffff;--ink:#000000;--muted:#555555;--line:#000000;--accent:#000000;--accent-2:#333333;--deep:#000000;--shadow:6px 6px 0px #000;--shadow-soft:3px 3px 0px #000;--radius:0px;--ease:cubic-bezier(0.2,0.8,0.2,1)}
    
    html, body { height: auto; width: 100vw; overflow-x: hidden; background: var(--bg); color: var(--ink); }
    .lenis.lenis-smooth { scroll-behavior: auto !important; }
    .lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; }
    .lenis.lenis-stopped { overflow: hidden; }
    .lenis.lenis-smooth iframe { pointer-events: none; }

    .page-loader { position: fixed; inset: 0; background: var(--ink); z-index: 99999; display: flex; justify-content: center; align-items: center; transition: transform 1.2s var(--ease); transform-origin: top; }
    .loader-text { font-family: "Inter", sans-serif; font-weight: 900; font-size: 8vw; letter-spacing: -0.05em; color: var(--bg); opacity: 1; transition: opacity 0.6s var(--ease); text-transform: uppercase; }
    
    #p5-canvas-container { position: fixed; inset: 0; z-index: -1; pointer-events: none; opacity: 0.15; mix-blend-mode: multiply; filter: grayscale(1); }
    
    body { cursor: auto; font-family:"Inter", "Helvetica Neue", sans-serif; }
    .custom-cursor{position:fixed;top:0;left:0;width:20px;height:20px;border-radius:50%;pointer-events:none;z-index:100000;transform:translate(-50%,-50%);border:2px solid #000;background:#fff;mix-blend-mode:difference;display:grid;place-items:center;transition:width .2s var(--ease),height .2s var(--ease),border-radius .2s var(--ease),background .2s var(--ease)}
    .custom-cursor.is-hover{width:80px;height:80px;background:#000;border-color:#fff;color:#fff;}
    .custom-cursor.is-hover::after{content:"VIEW";font-size:12px;font-weight:800;letter-spacing:1px;position:absolute;}
    @media (pointer:fine){ body{cursor:none;} }

    a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid #000;outline-offset:4px}

    /* Project Overlay - Brutalist */
    .project-overlay{position:fixed;inset:0;z-index:99998;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .4s var(--ease),visibility 0s linear .4s}
    .project-overlay.is-open{opacity:1;pointer-events:auto;visibility:visible;transition:opacity .4s var(--ease)}
    .project-overlay__backdrop{position:absolute;inset:0;background:rgba(255,255,255,0.9);backdrop-filter:blur(10px)}
    .project-overlay__panel{position:relative;width:min(1200px,calc(100vw - 80px));height:min(800px,calc(100vh - 80px));margin:40px auto;border-radius:0;overflow:hidden;background:#fff;border:2px solid #000;box-shadow:var(--shadow);transform:translate3d(0,24px,0);opacity:0}
    .project-overlay.is-open .project-overlay__panel{transform:none;opacity:1;transition:transform .7s var(--ease),opacity .7s var(--ease)}
    .project-overlay__close{position:absolute;top:24px;right:24px;z-index:4;width:48px;height:48px;border-radius:0;border:2px solid #000;background:#fff;cursor:pointer;font-size:24px;line-height:1;color:#000;transition:all .3s ease;font-family:"Inter", sans-serif; font-weight: 800;}
    .project-overlay__close:hover{background:#000;color:#fff;transform:translate(-2px,-2px);box-shadow:var(--shadow-soft)}
    .project-overlay__grid{display:grid;grid-template-columns:1.2fr .8fr;height:100%}
    .project-overlay__media{position:relative;overflow:hidden;background:#000;user-select:none;border-right:2px solid #000}
    .project-overlay__image{position:absolute;inset:0;background-size:cover;background-position:center;filter:grayscale(1) contrast(1.2);transition:filter 0.5s ease}
    .project-overlay__image:hover{filter:grayscale(0) contrast(1)}
    .project-overlay__media-nav{position:absolute;left:24px;right:24px;bottom:24px;display:flex;align-items:center;justify-content:space-between;z-index:3}
    .project-overlay__nav-btn{width:48px;height:48px;border-radius:0;border:2px solid #000;background:#fff;color:#000;cursor:pointer;font-weight:800;transition:all .3s ease}
    .project-overlay__nav-btn:hover{background:#000;color:#fff;transform:translate(-2px,-2px);box-shadow:var(--shadow-soft)}
    .project-overlay__count{padding:8px 16px;background:#fff;color:#000;font-size:12px;font-weight:800;letter-spacing:.2em;border:2px solid #000}
    .project-overlay__content{position:relative;padding:56px 48px 0;overflow:auto;display:flex;flex-direction:column;height:100%;background:#fff}
    .project-overlay__meta{display:inline-flex;font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#000;margin-bottom:32px;border-bottom:2px solid #000;padding-bottom:8px}
    .project-overlay__title{margin:0;font-size:52px;line-height:1;font-family:"Cormorant Garamond",serif;font-weight:700;color:#000;text-transform:uppercase}
    .project-overlay__desc{margin:32px 0 0;color:#000;line-height:1.6;font-size:16px;font-weight:500;max-width:90%}
    .project-overlay__specs{margin-top:auto;padding-top:40px}
    .project-overlay__price{display:flex;align-items:center;justify-content:space-between;padding:32px 0;border-top:2px solid #000;border-bottom:2px solid #000;background:transparent}
    .project-overlay__price-label{font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#000}
    .project-overlay__price-value{font-variant-numeric:tabular-nums;font-size:42px;line-height:1;font-weight:900;font-family:"Inter",sans-serif;color:#000;display:flex;align-items:baseline;gap:12px;letter-spacing:-0.05em}
    .project-overlay__price-value del{font-size:18px;color:#888;font-weight:600}
    .project-overlay__cta{position:sticky;bottom:0;margin:0 -48px 0;padding:32px 48px;background:#fff;border-top:2px solid #000;z-index:2}
    .project-overlay__cta-btn{width:100%;padding:24px;border-radius:0;border:2px solid #000;background:#000;color:#fff;font-size:16px;font-family:"Inter",sans-serif;font-weight:800;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;transition:all .3s ease}
    .project-overlay__cta-btn:hover{background:#fff;color:#000;transform:translate(-4px,-4px);box-shadow:var(--shadow)}
    .project-overlay__cta-btn:active{transform:translate(0,0);box-shadow:none}
    body.overlay-open{overflow:hidden !important}

    .action-btn{transition:all .3s ease}
    .hover-hint{transition:opacity .3s ease,transform .3s ease}

    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    a{color:inherit;text-decoration:none}img,video{display:block;max-width:100%}
    .page{position:relative;z-index:1;width:min(1560px,calc(100vw - 64px));margin:0 auto;padding-bottom:120px;border-left:2px solid #000;border-right:2px solid #000;background:#fff;}
    .topbar{position:sticky;top:0;z-index:50;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:24px 32px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;background:#fff;border-bottom:2px solid #000;transition:padding .3s ease}
    .brand{display:flex;align-items:center;gap:12px;justify-self:start}
    .brand-logo{height:40px;width:auto;object-fit:contain;display:block;filter:grayscale(1) contrast(2)}
    .nav{display:flex;gap:36px;color:var(--ink);justify-self:center}
    .nav a{position:relative;padding-bottom:6px}
    .nav a::after{content:"";position:absolute;left:0;bottom:0;width:100%;height:2px;background:var(--ink);transform:scaleX(0);transform-origin:left;transition:transform .3s var(--ease)}
    .nav a:hover::after,.nav a.active::after{transform:scaleX(1)}
    .eyebrow{margin:0 0 12px;font-size:12px;font-family:"Inter",sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#000;font-weight:900}
    .serif,h1,h2,h3,.big-number,.kpi strong,.manifesto,.hero-card strong{font-family:"Cormorant Garamond", serif;font-weight:700;letter-spacing:normal;text-transform:none}
    
    .hero-copy h1 span{display:block;overflow:hidden}
    .hero-copy h1 i{display:block;font-style:normal;transform:translateY(115%);opacity:0;animation:titleRise 1s var(--ease) forwards}
    .hero-copy h1 span:nth-child(2) i{animation-delay:.1s}
    .reveal{opacity:0;transform:translateY(40px);transition:opacity 0.8s var(--ease),transform 0.8s var(--ease);}
    .reveal.in-view{opacity:1;transform:translateY(0);}
    @keyframes titleRise{to{transform:translateY(0);opacity:1}}
    
    .hero{padding:0;display:grid;grid-template-columns:1.2fr 0.8fr;gap:0;align-items:stretch;border-bottom:2px solid #000}
    .hero-copy{padding:80px 64px;border-right:2px solid #000;}
    .intro-meta{display:flex;gap:32px;font-size:12px;color:#000;font-weight:800;margin-bottom:24px;text-transform:uppercase;letter-spacing:.1em}
    h1{margin:32px 0;font-size:clamp(60px,7vw,100px);line-height:0.9;color:#000;text-transform:uppercase}
    h1 .en{display:block;margin-bottom:12px;font-family:"Inter",sans-serif;font-weight:900;letter-spacing:-0.05em}
    h1 .zh{display:block;font-size:0.5em;font-weight:700;font-family:"Cormorant Garamond",serif}
    .hero-copy .subhead{max-width:590px;margin:40px 0 60px;color:#000;line-height:1.6;font-size:18px;font-weight:500;}
    .specs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;margin-top:0;border-top:2px solid #000;margin:-80px -64px 0 -64px;transform:translateY(80px);}
    .spec{position:relative;padding:32px 24px;border-right:2px solid #000;min-height:140px;transition:background .3s ease;background:#fff;}
    .spec:last-child{border-right:none;}
    .spec:hover{background:#000;color:#fff;}
    .spec:hover .label, .spec:hover p{color:#fff;}
    .spec .label{font-size:11px;color:#000;font-weight:800;letter-spacing:.1em;text-transform:uppercase;transition:color .3s ease;}
    .spec strong{display:block;margin-top:16px;font-size:42px;line-height:1;font-family:"Inter",sans-serif;font-weight:900;letter-spacing:-0.04em;}
    .spec p{margin:16px 0 0;font-size:13px;color:#555;line-height:1.5;font-weight:500;transition:color .3s ease;}
    
    .hero-image,.photo-tall,.photo-wide,.visual,.video-box{transform:translate3d(0,0,0);will-change:transform}
    .hero-image,.photo-tall,.photo-wide,.visual,.offer-image{filter:grayscale(1) contrast(1.2);transition:filter 0.5s ease}
    .hero-image:hover,.photo-tall:hover,.photo-wide:hover,.visual:hover,.offer-image:hover{filter:grayscale(0) contrast(1)}
    .hero-image{min-height:100%;border-radius:0;overflow:hidden;position:relative;background:url("tp/xai-tmp-imgen-9d321e44-e5bf-4b7f-a73f-29e28f996a7a.jpeg") center/cover}
    .hero-card{position:absolute;right:0;bottom:0;width:360px;padding:40px;background:#fff;color:#000;border-top:2px solid #000;border-left:2px solid #000;transition:all .3s ease}
    .hero-image:hover .hero-card{background:#000;color:#fff}
    .hero-card .mini{font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;font-family:"Inter",sans-serif;}
    .hero-card strong{display:block;margin:16px 0;font-size:40px;font-family:"Cormorant Garamond",serif;font-weight:700;line-height:1;}
    .hero-card p{margin:0;line-height:1.6;font-size:15px;font-weight:500;}
    
    .section{padding:100px 0;border-bottom:2px solid #000}
    .divider{display:none}
    .kpi-band{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;margin-top:0;border-top:2px solid #000;border-bottom:2px solid #000}
    .kpi{position:relative;padding:40px 32px;min-height:240px;background:#fff;border-right:2px solid #000;transition:all .3s ease}
    .kpi:last-child{border-right:none}
    .kpi:hover{background:#000;color:#fff;}
    .kpi:hover span, .kpi:hover p{color:#fff;}
    .kpi span{font-size:12px;color:#000;font-family:"Inter",sans-serif;font-weight:800;letter-spacing:.1em;text-transform:uppercase;transition:color .3s ease;}
    .kpi strong{display:block;font-size:56px;margin:24px 0 16px;line-height:1;font-family:"Inter",sans-serif;font-weight:900;letter-spacing:-0.04em}
    .kpi p{margin:0;color:#555;line-height:1.6;font-size:14px;font-weight:500;transition:color .3s ease;}
    
    .section-head{display:flex;justify-content:space-between;gap:40px;align-items:end;margin-bottom:64px;padding:0 64px;}
    .section-head h2{margin:0;font-size:clamp(56px,7vw,90px);line-height:0.95;text-transform:uppercase;}
    .section-head p{margin:0;max-width:480px;color:#000;line-height:1.6;font-size:18px;font-weight:500;}
    
    .lead-grid{display:grid;grid-template-columns:1.2fr 0.8fr;gap:0;border-top:2px solid #000;border-bottom:2px solid #000}
    .panel{border-radius:0;overflow:hidden;background:#fff;border-right:2px solid #000;}
    .panel:last-child{border-right:none}
    .photo-tall{min-height:800px;background:url("assets/tp_images/img_1.png") center/cover}
    .stack{display:grid;grid-template-rows:auto 1fr;border-left:none}
    .copy-card{padding:64px;display:flex;flex-direction:column;justify-content:center;background:#fff;border-bottom:2px solid #000}
    .copy-card h2{margin:0;font-size:clamp(48px,5vw,72px);line-height:1;text-transform:uppercase;}
    .copy-card p{margin:32px 0 0;max-width:540px;color:#000;line-height:1.6;font-size:18px;font-weight:500;}
    .photo-wide{min-height:500px;position:relative;background:url("assets/tp_images/img_2.jpeg") center/cover}
    .floating-metrics{position:absolute;inset:auto 0 0 0;display:grid;grid-template-columns:repeat(3,1fr);background:#fff;border-top:2px solid #000;}
    .metric{padding:32px;border-right:2px solid #000;display:flex;flex-direction:column;justify-content:center;transition:all .3s ease;}
    .metric:hover{background:#000;color:#fff;}
    .metric:hover .mini, .metric:hover .big-number, .metric:hover em{color:#fff;}
    .metric:last-child{border-right:none}
    .metric .mini{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#000;font-weight:800;font-family:"Inter",sans-serif;transition:color .3s ease;}
    .metric .big-number{display:block;margin:16px 0 8px;font-size:56px;line-height:1;font-family:"Inter",sans-serif;font-weight:900;color:#000;letter-spacing:-0.04em;transition:color .3s ease;}
    .metric em{font-style:normal;color:#555;font-size:14px;font-weight:500;transition:color .3s ease;}
    
    .gallery{display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:2px solid #000;border-bottom:2px solid #000;}
    .gallery-left,.gallery-right{display:grid;gap:0}
    .gallery-left{border-right:2px solid #000}
    .visual{position:relative;border-radius:0;overflow:hidden;min-height:400px;background-size:cover;background-position:center;border-bottom:2px solid #000}
    .visual:last-child{border-bottom:none}
    .visual::after{content:attr(data-caption);position:absolute;left:32px;bottom:32px;font-family:"Inter",sans-serif;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#fff;background:#000;padding:12px 20px;opacity:0;transform:translateY(10px);transition:all .3s ease;border:2px solid #000;}
    .visual:hover::after{opacity:1;transform:translateY(0);background:#fff;color:#000;}
    .v1{min-height:800px;background-image:url("assets/tp_images/img_3.jpeg")}.v2{min-height:400px;background-image:url("assets/tp_images/img_4.jpeg")}.v3{min-height:500px;background-image:url("assets/tp_images/img_5.jpeg")}.v4{min-height:300px;background-image:url("assets/tp_images/img_6.jpeg")}.v5{min-height:400px;background-image:url("assets/tp_images/img_7.jpeg")}
    
    .video-layout{display:grid;grid-template-columns:1.2fr 0.8fr;gap:0;border-top:2px solid #000;border-bottom:2px solid #000}
    .video-box{min-height:800px;position:relative;border-radius:0;overflow:hidden;border-right:2px solid #000}
    .video-box video{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.2);transition:filter .5s ease}
    .video-box:hover video{filter:grayscale(0) contrast(1)}
    .video-toggle{position:absolute;top:40px;right:40px;z-index:3;width:80px;height:80px;border:2px solid #000;border-radius:0;background:#fff;color:#000;cursor:pointer;transition:all .3s ease}
    .video-toggle:hover{background:#000;transform:translate(-4px,-4px);box-shadow:var(--shadow)}
    .video-toggle::before{content:"";display:inline-block;width:0;height:0;border-top:14px solid transparent;border-bottom:14px solid transparent;border-left:22px solid #000;margin-left:6px;transition:border-color .3s ease}
    .video-toggle:hover::before{border-left-color:#fff}
    .video-copy{position:absolute;left:40px;right:40px;bottom:40px;z-index:2;padding:48px;background:#fff;border:2px solid #000;color:#000;transition:all .3s ease;}
    .video-box:hover .video-copy{background:#000;color:#fff;}
    .video-box:hover .video-copy .eyebrow{color:#fff;}
    .video-box:hover .video-copy p{color:#ccc;}
    .video-copy h3,.benefit h3,.market h3{margin:0 0 24px;font-size:56px;line-height:1;text-transform:uppercase;}
    .video-copy p{margin:0;color:#555;line-height:1.6;font-size:16px;font-weight:500;}
    .pulse-dot{display:none}
    
    .aside-stack{display:grid;grid-template-rows:1fr 1fr;}
    .benefit,.market{position:relative;padding:64px;background:#fff;border-bottom:2px solid #000;border-radius:0}
    .market{border-bottom:none}
    .benefit p,.market p{margin:0 0 40px;color:#000;line-height:1.6;font-size:16px;font-weight:500;}
    .chips{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:40px}
    .chip{padding:12px 24px;border:2px solid #000;background:#fff;color:#000;font-size:12px;font-family:"Inter",sans-serif;font-weight:800;letter-spacing:.1em;text-transform:uppercase;transition:all .3s ease}
    .chip:hover{background:#000;color:#fff;transform:translate(-2px,-2px);box-shadow:var(--shadow-soft)}
    .list{display:grid;gap:0}
    .row{display:flex;justify-content:space-between;gap:16px;padding:24px 0;border-bottom:2px solid #000;color:#000;font-size:15px;font-weight:500;transition:all .3s ease}
    .row:hover{background:#000;color:#fff;padding-left:16px;padding-right:16px;}
    .row strong{color:#000;font-weight:800;font-family:"Inter",sans-serif;transition:color .3s ease;}
    .row:hover strong{color:#fff;}
    .activity-meter{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:40px;border:2px solid #000}
    .activity-box{padding:32px 24px;background:#fff;border-right:2px solid #000;transition:all .3s ease;}
    .activity-box:hover{background:#000;color:#fff;}
    .activity-box:hover span{color:#fff;}
    .activity-box:last-child{border-right:none}
    .activity-box span{display:block;font-size:11px;font-family:"Inter",sans-serif;font-weight:800;letter-spacing:.1em;color:#000;text-transform:uppercase;transition:color .3s ease;}
    .activity-box strong{display:block;margin-top:16px;font-size:42px;line-height:1;font-family:"Inter",sans-serif;font-weight:900;letter-spacing:-0.04em}
    
    .market-wrap{display:grid;grid-template-columns:1fr 1.5fr;gap:0;border-top:2px solid #000;border-bottom:2px solid #000}
    .market.dark{color:#fff;background:#000;border-right:2px solid #000}
    .market.dark p,.market.dark .caption,.market.dark .small,.market.dark .eyebrow{color:#ccc}
    .ring-area{min-height:360px;display:grid;place-items:center;margin-top:40px}
    .ring{width:300px;height:300px;border-radius:50%;background:conic-gradient(#fff 0 68%,#333 68% 100%);display:grid;place-items:center;position:relative;transition:transform .5s ease}
    .market.dark:hover .ring{transform:rotate(10deg)}
    .ring::before{content:"";width:220px;height:220px;border-radius:50%;background:#000;box-shadow:inset 0 0 0 2px #333}
    .ring .center{position:absolute;text-align:center}
    .ring .center strong{display:block;font-size:80px;font-family:"Inter",sans-serif;font-weight:900;letter-spacing:-0.05em;color:#fff;}
    .ring .center span{font-size:12px;font-family:"Inter",sans-serif;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#fff;}
    .market-tabs{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:40px}
    .market-tab{border:2px solid #000;background:#fff;color:#000;border-radius:0;padding:14px 24px;font-size:12px;font-family:"Inter",sans-serif;font-weight:800;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .3s ease}
    .market-tab:hover,.market-tab.is-active{background:#000;color:#fff;transform:translate(-2px,-2px);box-shadow:var(--shadow-soft)}
    .bars{display:grid;gap:32px;margin:40px 0}
    .bar-row{display:grid;grid-template-columns:160px 1fr 80px;gap:32px;align-items:center;font-size:16px;font-family:"Inter",sans-serif;font-weight:700}
    .track{height:8px;background:#f0f0f0;overflow:hidden;border:1px solid #000;}
    .fill{height:100%;background:#000;width:0;transition:width 1s cubic-bezier(.2,.8,.2,1)}
    .trend{padding:48px;background:#fff;border-left:none;border-top:2px solid #000;margin:40px -64px -64px -64px;}
    svg{width:100%;height:280px;display:block}
    .trend path[data-line]{stroke-dasharray:900;stroke-dashoffset:900;transition:stroke-dashoffset 1.6s cubic-bezier(.2,.8,.2,1);stroke:#000;stroke-width:4;}
    .trend.in-view path[data-line]{stroke-dashoffset:0}
    .legend{display:flex;gap:32px;margin-top:32px;color:#000;font-size:13px;font-weight:800;font-family:"Inter",sans-serif;}
    .legend span{display:flex;align-items:center;gap:12px}
    .legend span::before{content:"";display:block;width:16px;height:16px;background:#000;border:2px solid #000;}
    .legend span:last-child::before{background:#fff;}
    
    .manifest{position:relative;padding:120px 0;text-align:center;border-top:2px solid #000;background:#000;color:#fff;}
    .manifest::before{display:none;}
    .manifesto{position:relative;z-index:1;margin:0 auto;max-width:1200px;font-size:clamp(48px,6vw,80px);line-height:1;font-family:"Cormorant Garamond",serif;font-weight:700;text-transform:uppercase;}
    .footer{padding:48px 64px;display:flex;justify-content:space-between;gap:24px;color:#000;font-size:14px;font-family:"Inter",sans-serif;font-weight:800;letter-spacing:.15em;text-transform:uppercase;background:#fff;border-top:2px solid #000;}
    .cursor-orb{display:none}
    
    @media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.reveal{opacity:1;transform:none}.cursor-orb{display:none}}
    @media (max-width:1180px){.hero,.lead-grid,.gallery,.video-layout,.market-wrap{grid-template-columns:1fr}.hero-image,.photo-tall,.video-box{min-height:640px}.specs,.kpi-band{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:760px){.page{width:100vw;border:none;padding-bottom:0;}.nav{display:none}.specs,.kpi-band,.floating-metrics,.activity-meter{grid-template-columns:1fr}.copy-card,.benefit,.market,.video-copy,.hero-copy{padding:32px}.topbar{padding:20px 32px}.footer{flex-direction:column}.video-toggle{width:64px;height:64px;top:24px;right:24px}.cursor-orb{display:none}.bar-row{grid-template-columns:100px 1fr 60px}.video-copy h3,.benefit h3,.market h3{font-size:42px}.section-head{padding:0 32px;flex-direction:column;align-items:flex-start;gap:24px;}}
    
    /* Mobile Drawer */
    @media (max-width:760px){
    .project-overlay__panel{width:100vw;height:100vh;margin:0;border-radius:0;border:none}
    .project-overlay__grid{grid-template-columns:1fr;height:100vh;overflow-y:auto;overflow-x:hidden}
    .project-overlay__media{height:40vh;min-height:300px;position:relative;border-right:none;border-bottom:2px solid #000;}
    .project-overlay__content{height:auto;min-height:60vh;padding:40px 32px 0}
    .project-overlay__title{font-size:42px}
    .project-overlay__desc{font-size:15px;max-width:100%}
    .project-overlay__price{padding:24px 0;flex-direction:column;align-items:flex-start;gap:16px;}
    .project-overlay__price-value{font-size:36px}
    .project-overlay__cta{position:sticky;bottom:0;margin:32px -32px 0;padding:24px 32px 32px}
    .project-overlay__cta-btn{padding:20px}
    .project-overlay__close{top:16px;right:16px;width:44px;height:44px;font-size:24px}
    .offers-grid{grid-template-columns:1fr}}
    
    /* Virtual IP Brutalist Update */
    .virtual-ip-wrapper{position:fixed;right:32px;bottom:32px;z-index:999;display:flex;flex-direction:column;align-items:flex-end;gap:24px;pointer-events:none}
    .chat-bubble{width:340px;background:#fff;border:2px solid #000;border-radius:0;box-shadow:var(--shadow);padding:24px;pointer-events:auto;opacity:0;transform:translateY(20px);transition:all .4s var(--ease);visibility:hidden}
    .chat-bubble.is-open{opacity:1;transform:translateY(0);visibility:visible}
    .bubble-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;font-size:14px;font-family:"Inter",sans-serif;font-weight:900;text-transform:uppercase;color:#000;padding-bottom:16px;border-bottom:2px solid #000}
    .close-btn{background:#fff;border:2px solid #000;width:32px;height:32px;display:grid;place-items:center;font-size:20px;font-weight:800;color:#000;cursor:pointer;transition:all .3s ease}
    .close-btn:hover{background:#000;color:#fff;}
    .chat-history{max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:16px;margin-bottom:24px;padding-right:8px;}
    .chat-history::-webkit-scrollbar{width:6px}
    .chat-history::-webkit-scrollbar-thumb{background:#000;border-radius:0}
    .msg{max-width:90%;font-size:14px;line-height:1.6;font-weight:500;padding:16px;border:2px solid #000;border-radius:0;animation:msgIn 0.4s var(--ease) forwards;word-break:break-all}
    .msg p{margin:0}
    .msg-ai{background:#fff;color:#000;align-self:flex-start;box-shadow:4px 4px 0px #000;}
    .msg-user{background:#000;color:#fff;align-self:flex-end;box-shadow:-4px 4px 0px #000;}
    .bubble-actions{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px;padding-bottom:20px;border-bottom:2px solid #000}
    .action-btn{padding:10px 16px;border:2px solid #000;border-radius:0;background:#fff;color:#000;font-size:12px;font-family:"Inter",sans-serif;font-weight:800;text-transform:uppercase;cursor:pointer;transition:all .3s ease;box-shadow:2px 2px 0px #000;}
    .action-btn:hover{background:#000;color:#fff;transform:translate(-2px,-2px);box-shadow:4px 4px 0px #000;}
    .chat-input-area{display:flex;gap:12px;align-items:stretch;}
    #chatInput{flex:1;padding:12px 16px;border:2px solid #000;border-radius:0;background:#fff;font-size:14px;font-family:"Inter",sans-serif;font-weight:500;color:#000;outline:none;}
    #chatInput:focus{box-shadow:inset 2px 2px 0px #000;}
    #chatSendBtn{width:48px;background:#000;border:2px solid #000;color:#fff;cursor:pointer;display:grid;place-items:center;transition:all .3s ease}
    #chatSendBtn:hover{background:#fff;color:#000;}
    #chatSendBtn svg{width:20px;height:20px}
    @keyframes msgIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    
    .ip-avatar-container{position:relative;width:80px;height:80px;cursor:pointer;pointer-events:auto;background:#fff;border:2px solid #000;border-radius:50%;display:grid;place-items:center;box-shadow:var(--shadow);transition:all .3s ease}
    .ip-avatar-container:hover{transform:translate(-4px,-4px);box-shadow:8px 8px 0px #000;}
    .status-dot{position:absolute;top:4px;right:4px;width:16px;height:16px;background:#00ff00;border:2px solid #000;border-radius:50%;z-index:10;animation:pulse 2s infinite}
    @keyframes pulse{0%{transform:scale(0.95);box-shadow:0 0 0 0 rgba(0,255,0,0.7)}70%{transform:scale(1);box-shadow:0 0 0 10px rgba(0,255,0,0)}100%{transform:scale(0.95);box-shadow:0 0 0 0 rgba(0,255,0,0)}}
    .ip-avatar{width:100%;height:100%;border-radius:50%;overflow:hidden;position:relative;background:#000;}
    .ip-avatar::after{content:"IP";position:absolute;inset:0;display:grid;place-items:center;font-family:"Inter",sans-serif;font-size:24px;font-weight:900;color:#fff;}
    .bear-svg{display:none;}
    .hover-hint{position:absolute;right:100px;top:50%;transform:translateY(-50%) translateX(10px);background:#000;color:#fff;padding:10px 16px;border:2px solid #000;font-size:12px;font-family:"Inter",sans-serif;font-weight:800;white-space:nowrap;opacity:0;pointer-events:none;transition:all .3s ease;text-transform:uppercase;}
    .hover-hint::after{content:"";position:absolute;right:-8px;top:50%;transform:translateY(-50%);border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:6px solid #000;}
    .ip-avatar-container:hover .hover-hint{opacity:1;transform:translateY(-50%) translateX(0);}
    
    .portfolio-filters{display:flex;gap:48px;margin-bottom:80px;border-bottom:2px solid #000;padding-bottom:24px;justify-content:center;padding-left:64px;padding-right:64px;}
    .pf-btn{background:none;border:none;padding:0 0 12px;font-size:14px;font-family:"Inter",sans-serif;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;color:#888;cursor:pointer;position:relative;transition:color 0.4s var(--ease)}
    .pf-btn::after{content:"";position:absolute;left:0;bottom:-26px;width:100%;height:4px;background:#000;transform:scaleX(0);transform-origin:left;transition:transform 0.4s var(--ease)}
    .pf-btn:hover{color:#000}
    .pf-btn.active{color:#000}
    .pf-btn.active::after{transform:scaleX(1)}
    
    .portfolio-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0;border-top:2px solid #000;transition:opacity 0.6s var(--ease)}
    .p-item{opacity:1;transform:translateY(0);transition:opacity 0.8s var(--ease),transform 0.8s var(--ease);border-right:2px solid #000;border-bottom:2px solid #000;padding:40px;background:#fff;}
    .p-item:nth-child(even){border-right:none;}
    .p-item.hidden{opacity:0;transform:translateY(40px);pointer-events:none;position:absolute;visibility:hidden}
    .p-image-wrap{overflow:hidden;background:#000;border:2px solid #000;position:relative;}
    .p-image{height:500px;background-size:cover;background-position:center;filter:grayscale(1) contrast(1.2);transition:transform 0.8s var(--ease),filter 0.8s var(--ease)}
    .p-item:hover .p-image{transform:scale(1.05);filter:grayscale(0) contrast(1)}
    .p-info{margin-top:32px;display:flex;flex-direction:column;gap:12px;text-align:left}
    .p-cat{font-size:12px;font-family:"Inter",sans-serif;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#000;display:inline-block;padding:6px 12px;border:2px solid #000;align-self:flex-start;}
    .p-info h3{margin:0;font-size:36px;font-weight:700;line-height:1;text-transform:uppercase;}
    
    .offers-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;margin-top:64px;padding:0 64px;}
    .offer-card{background:#fff;border:2px solid #000;border-radius:0;overflow:hidden;box-shadow:var(--shadow);transition:all .4s var(--ease);position:relative;}
    .offer-card:hover{transform:translate(-8px,-8px);box-shadow:16px 16px 0px #000;}
    .offer-image{height:300px;background-size:cover;background-position:center;position:relative;border-bottom:2px solid #000;}
    .badge{position:absolute;top:24px;right:24px;background:#000;color:#fff;padding:8px 16px;border:2px solid #000;border-radius:0;font-size:12px;font-family:"Inter",sans-serif;font-weight:800;letter-spacing:.1em;text-transform:uppercase;}
    .badge.hot{background:#fff;color:#000;}
    .offer-content{padding:40px}
    .offer-content h3{margin:16px 0 24px;font-size:32px;font-family:"Cormorant Garamond",serif;font-weight:700;line-height:1;}
    .offer-content .desc{font-size:15px;color:#000;font-weight:500;line-height:1.6;margin-bottom:32px;min-height:48px}
    .price-row{display:flex;justify-content:space-between;align-items:flex-end;padding-top:32px;border-top:2px solid #000}
    .price{display:flex;align-items:baseline;gap:8px}
    .price .currency{font-size:20px;font-family:"Inter",sans-serif;font-weight:900;color:#000}
    .price strong{font-size:48px;font-family:"Inter",sans-serif;font-weight:900;color:#000;line-height:1;letter-spacing:-0.05em;}
    .price del{font-size:16px;color:#888;font-weight:600;text-decoration:line-through}
    .buy-btn{background:#000;color:#fff;border:2px solid #000;padding:16px 32px;border-radius:0;font-size:14px;font-family:"Inter",sans-serif;font-weight:800;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .3s var(--ease);box-shadow:4px 4px 0px rgba(0,0,0,0.2)}
    .buy-btn:hover{background:#fff;color:#000;transform:translate(-2px,-2px);box-shadow:6px 6px 0px #000;}
"""

# replace between <style> and </style>
content = re.sub(r'<style>.*?</style>', f'<style>{new_css}</style>', content, flags=re.DOTALL)

with open('建材.html', 'w', encoding='utf-8') as f:
    f.write(content)
