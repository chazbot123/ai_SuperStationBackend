let particles = [];
    const numParticles = 800;
    const noiseScale = 0.01;
    let customSeed;
    let interactionX = -1000;
    let interactionY = -1000;

    function setup() {
      let canvas = createCanvas(windowWidth, windowHeight);
      canvas.parent('p5-canvas-container');
      customSeed = random(10000);
      noiseSeed(customSeed);
      for(let i = 0; i < numParticles; i++) {
        particles.push(new Particle());
      }
      background(249, 248, 246);
    }

    function draw() {
      noStroke();
      fill(249, 248, 246, 20);
      rect(0, 0, width, height);

      interactionX = lerp(interactionX, mouseX, 0.1);
      interactionY = lerp(interactionY, mouseY + window.scrollY, 0.1);

      for(let p of particles) {
        p.update();
        p.display();
      }
    }

    function windowResized() {
      resizeCanvas(windowWidth, windowHeight);
    }

    class Particle {
      constructor() {
        this.pos = createVector(random(width), random(height));
        this.vel = createVector(0, 0);
        this.acc = createVector(0, 0);
        this.maxSpeed = random(0.5, 1.5);
        this.color = random() > 0.5 ? color(166, 83, 63, 40) : color(212, 139, 118, 40);
        this.size = random(1, 3);
      }
      update() {
        let angle = noise(this.pos.x * noiseScale, this.pos.y * noiseScale, frameCount * 0.002) * TWO_PI * 2;
        let flowForce = p5.Vector.fromAngle(angle);
        flowForce.mult(0.1);
        
        let d = dist(this.pos.x, this.pos.y, interactionX, interactionY - window.scrollY);
        if (d < 200) {
          let repulse = p5.Vector.sub(this.pos, createVector(interactionX, interactionY - window.scrollY));
          repulse.normalize();
          repulse.mult(map(d, 0, 200, 0.5, 0));
          this.acc.add(repulse);
        }

        this.acc.add(flowForce);
        this.vel.add(this.acc);
        this.vel.limit(this.maxSpeed);
        this.pos.add(this.vel);
        this.acc.mult(0);

        if(this.pos.x > width) this.pos.x = 0;
        if(this.pos.x < 0) this.pos.x = width;
        if(this.pos.y > height) this.pos.y = 0;
        if(this.pos.y < 0) this.pos.y = height;
      }
      display() {
        noStroke();
        fill(this.color);
        circle(this.pos.x, this.pos.y, this.size);
      }
    }

    const lenis = new Lenis({
      duration: 2.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      direction: 'vertical',
      gestureDirection: 'vertical',
      smooth: true,
      mouseMultiplier: 0.8,
      smoothTouch: false,
      touchMultiplier: 2,
      infinite: false,
    });
    
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time)=>{
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    const metricOrder = ['visits', 'consultations', 'signing_rate', 'purchases'];

    const defaultHeroMetrics = [
      {
        key: 'visits',
        label: '访问量',
        enabled: true,
        valueMode: 'dynamic',
        startValue: '2680',
        tickInterval: '8',
        incrementMin: '1',
        incrementMax: '3',
        fixedValue: '',
        suffix: '',
        highlight: '展示站点整体访问热度'
      },
      {
        key: 'consultations',
        label: '咨询量',
        enabled: true,
        valueMode: 'dynamic',
        startValue: '126',
        tickInterval: '15',
        incrementMin: '1',
        incrementMax: '2',
        fixedValue: '',
        suffix: '',
        highlight: '突出线索承接效率'
      },
      {
        key: 'signing_rate',
        label: '签约率',
        enabled: true,
        valueMode: 'fixed',
        startValue: '',
        tickInterval: '',
        incrementMin: '',
        incrementMax: '',
        fixedValue: '31',
        suffix: '%',
        highlight: '适合展示阶段性经营结果'
      },
      {
        key: 'purchases',
        label: '购买量',
        enabled: true,
        valueMode: 'dynamic',
        startValue: '880',
        tickInterval: '20',
        incrementMin: '1',
        incrementMax: '2',
        fixedValue: '',
        suffix: '',
        highlight: '适合营造成交活跃感'
      }
    ];

    const heroMetricsRoot = document.getElementById('heroMetrics');
    const specCards = Array.from(heroMetricsRoot?.querySelectorAll('.spec') || []);
    let heroMetricTimers = [];

    const defaultMainCompanyUserId = 'cmotrwinc0000n4u9e265uccn';
    const searchParams = new URLSearchParams(window.location.search);
    const siteEditorContext = {
      enabled: searchParams.get('siteEditor') === '1',
      contentId: searchParams.get('contentId') || '',
      editorToken: searchParams.get('editorToken') || '',
    };
    const supportedSiteImageSlots = [
      { slotKey: 'home.hero_main', moduleKey: 'home', selector: '.hero-image' },
      { slotKey: 'sample.story_tall', moduleKey: 'sample_store', selector: '#story .photo-tall' },
      { slotKey: 'sample.story_wide', moduleKey: 'sample_store', selector: '#story .photo-wide' },
      { slotKey: 'sample.gallery_v1', moduleKey: 'sample_store', selector: '.visual.v1' },
      { slotKey: 'sample.gallery_v2', moduleKey: 'sample_store', selector: '.visual.v2' },
      { slotKey: 'sample.gallery_v3', moduleKey: 'sample_store', selector: '.visual.v3' },
      { slotKey: 'sample.gallery_v4', moduleKey: 'sample_store', selector: '.visual.v4' },
      { slotKey: 'sample.gallery_v5', moduleKey: 'sample_store', selector: '.visual.v5' },
    ];
    const siteImageSlotDefinitionMap = new Map(
      supportedSiteImageSlots.map((item) => [item.slotKey, item]),
    );
    const defaultSiteImageBackgroundMap = new Map();
    let savedSiteImageSlots = [];
    let draftSiteImageSlots = [];
    let siteEditorContent = null;
    let selectedSiteEditorImage = '';
    let siteEditorRoot = null;
    let siteEditorStatusEl = null;
    let siteEditorTitleEl = null;
    let siteEditorThumbListEl = null;

    function getSiteUserId() {
      return new URLSearchParams(window.location.search).get('userId') || defaultMainCompanyUserId;
    }

    function clearHeroMetricTimers() {
      heroMetricTimers.forEach((cancel) => cancel());
      heroMetricTimers = [];
    }

    function getSiteImageSlotElement(slotKey) {
      const definition = siteImageSlotDefinitionMap.get(slotKey);
      if (!definition) return null;
      return document.querySelector(definition.selector);
    }

    function captureDefaultSiteImageSlots() {
      supportedSiteImageSlots.forEach((item) => {
        const element = getSiteImageSlotElement(item.slotKey);
        if (!element || defaultSiteImageBackgroundMap.has(item.slotKey)) return;
        defaultSiteImageBackgroundMap.set(item.slotKey, element.style.backgroundImage || '');
      });
    }

    function findSiteImageSlot(slotKey, slots = []) {
      return slots.find((item) => item?.slotKey === slotKey) || null;
    }

    function applySiteImageSlot(slotKey, imageUrl) {
      const element = getSiteImageSlotElement(slotKey);
      if (!element) return;
      element.style.backgroundImage = imageUrl
        ? `url("${imageUrl}")`
        : defaultSiteImageBackgroundMap.get(slotKey) || '';
    }

    function applySiteImageSlots(slots = []) {
      captureDefaultSiteImageSlots();
      supportedSiteImageSlots.forEach((item) => {
        const matched = findSiteImageSlot(item.slotKey, slots);
        applySiteImageSlot(item.slotKey, matched?.imageUrl || '');
      });
    }

    function setSiteEditorStatus(message = '', tone = 'normal') {
      if (!siteEditorStatusEl) return;
      siteEditorStatusEl.textContent = message;
      siteEditorStatusEl.dataset.tone = tone;
    }

    function normalizeSiteEditorImages(content) {
      const seen = new Set();
      return [content?.coverImage, ...(content?.images || [])]
        .map((item) => String(item || '').trim())
        .filter((item) => item && !seen.has(item) && seen.add(item));
    }

    function getSiteEditorDraftSlot(slotKey) {
      return draftSiteImageSlots.find((item) => item.slotKey === slotKey) || null;
    }

    function orderMetrics(metrics) {
      return metricOrder
        .map((key) => metrics.find((item) => item?.key === key))
        .filter(Boolean);
    }

    function toMetricNumber(value, fallback = 0) {
      const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    function getMetricInitialValue(metric) {
      if(metric?.valueMode === 'fixed') {
        return toMetricNumber(metric?.fixedValue);
      }

      return toMetricNumber(metric?.startValue);
    }

    function getMetricIntervalMs(metric) {
      return Math.max(toMetricNumber(metric?.tickInterval, 1), 1) * 1000;
    }

    function getMetricIncrement(metric, userId, dayKey, tickIndex) {
      const min = Math.max(0, toMetricNumber(metric?.incrementMin, 0));
      const max = Math.max(min, toMetricNumber(metric?.incrementMax, min));
      if (max === min) return min;

      const seed = `${userId}|${metric?.key || 'metric'}|${dayKey}|${tickIndex}`;
      let hash = 2166136261;
      for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      const normalized = (hash >>> 0) % (max - min + 1);
      return min + normalized;
    }

    function getDayKey(timestamp = Date.now()) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function getDayStartTimestamp(timestamp = Date.now()) {
      const date = new Date(timestamp);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    }

    function getMetricSnapshot(metric, userId, timestamp = Date.now()) {
      const initialValue = getMetricInitialValue(metric);
      if(metric?.valueMode !== 'dynamic') {
        return {
          value: initialValue,
          nextTickAt: null,
        };
      }

      const intervalMs = getMetricIntervalMs(metric);
      const dayStart = getDayStartTimestamp(timestamp);
      const dayKey = getDayKey(timestamp);
      const elapsedTickCount = Math.max(
        0,
        Math.floor((timestamp - dayStart) / intervalMs)
      );

      let value = initialValue;
      for(let tickIndex = 0; tickIndex < elapsedTickCount; tickIndex += 1) {
        value += getMetricIncrement(metric, userId, dayKey, tickIndex);
      }

      return {
        value,
        nextTickAt: dayStart + (elapsedTickCount + 1) * intervalMs,
      };
    }

    function getFormattedMetricDigits(value) {
      return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function buildRollIndexes(rawDigits, previousRawDigits, previousRollIndexes, animate) {
      if(!rawDigits.length) return [];

      const nextIndexes = new Array(rawDigits.length).fill(0);

      for(let offset = 0; offset < rawDigits.length; offset += 1) {
        const nextPosition = rawDigits.length - 1 - offset;
        const nextDigit = Number(rawDigits[nextPosition]);
        const previousPosition = previousRawDigits.length - 1 - offset;

        if(!animate || previousPosition < 0) {
          nextIndexes[nextPosition] = nextDigit;
          continue;
        }

        const previousIndex = Number.isFinite(previousRollIndexes[previousPosition])
          ? previousRollIndexes[previousPosition]
          : Number(previousRawDigits[previousPosition]);

        let currentIndex = previousIndex;
        while((currentIndex % 10 + 10) % 10 !== nextDigit) {
          currentIndex += 1;
        }
        nextIndexes[nextPosition] = currentIndex;
      }

      return nextIndexes;
    }

    function renderMetricValue(element, value, suffix = '', animate = false) {
      const roundedValue = Math.round(value);
      const formatted = getFormattedMetricDigits(roundedValue);
      const rawDigits = formatted.replace(/,/g, '');
      const previousRawDigits = element.dataset.odometerRaw || '';
      const previousRollIndexes = JSON.parse(element.dataset.odometerRolls || '[]');
      const nextRollIndexes = buildRollIndexes(rawDigits, previousRawDigits, previousRollIndexes, animate);
      const odometer = document.createElement('span');
      odometer.className = 'metric-odometer';
      const digitsWrap = document.createElement('span');
      digitsWrap.className = 'metric-odometer__digits';

      let digitIndex = 0;
      for(const char of formatted) {
        if(char === ',') {
          const separator = document.createElement('span');
          separator.className = 'metric-odometer__separator';
          separator.textContent = ',';
          digitsWrap.appendChild(separator);
          continue;
        }

        const previousIndex = Number.isFinite(previousRollIndexes[digitIndex])
          ? previousRollIndexes[digitIndex]
          : Number(char);
        const nextIndex = nextRollIndexes[digitIndex];
        const windowEl = document.createElement('span');
        windowEl.className = 'metric-odometer__window';
        const track = document.createElement('span');
        track.className = `metric-odometer__track${animate ? '' : ' is-static'}`;
        const maxIndex = Math.max(previousIndex, nextIndex) + 1;

        for(let step = 0; step <= maxIndex; step += 1) {
          const digitEl = document.createElement('span');
          digitEl.className = 'metric-odometer__digit';
          digitEl.textContent = String(step % 10);
          track.appendChild(digitEl);
        }

        track.style.transform = `translateY(-${previousIndex}em)`;
        windowEl.appendChild(track);
        digitsWrap.appendChild(windowEl);

        if(animate && previousIndex !== nextIndex) {
          requestAnimationFrame(() => {
            track.style.transform = `translateY(-${nextIndex}em)`;
          });
        } else {
          track.style.transform = `translateY(-${nextIndex}em)`;
        }

        digitIndex += 1;
      }

      odometer.appendChild(digitsWrap);

      if(suffix) {
        const suffixEl = document.createElement('span');
        suffixEl.className = 'metric-odometer__suffix';
        suffixEl.textContent = suffix;
        odometer.appendChild(suffixEl);
      }

      element.replaceChildren(odometer);
      element.dataset.odometerRaw = rawDigits;
      element.dataset.odometerRolls = JSON.stringify(nextRollIndexes);
    }

    function animateMetricValue(element, from, to, suffix) {
      renderMetricValue(element, from, suffix, false);
      renderMetricValue(element, to, suffix, true);
    }

    function bindMetricCard(card, metric) {
      const labelEl = card.querySelector('.label');
      const valueEl = card.querySelector('strong');
      const highlightEl = card.querySelector('p');
      const suffix = metric?.suffix || '';
      const siteUserId = getSiteUserId();
      const snapshot = getMetricSnapshot(metric, siteUserId);
      const initialValue = snapshot.value;

      if(labelEl) labelEl.textContent = metric?.label || '';
      if(highlightEl) highlightEl.textContent = metric?.highlight || '';
      if(!valueEl) return;

      valueEl.dataset.count = String(initialValue);
      valueEl.dataset.suffix = suffix;
      valueEl.dataset.decimals = String(Number.isInteger(initialValue) ? 0 : 1);
      valueEl.dataset.animated = 'true';
      renderMetricValue(valueEl, initialValue, suffix, false);

      if(metric?.valueMode !== 'dynamic') return;

      let activeTimer = null;
      const cancel = () => {
        if(activeTimer !== null) {
          window.clearTimeout(activeTimer);
        }
      };
      heroMetricTimers.push(cancel);

      const scheduleNextTick = () => {
        const currentSnapshot = getMetricSnapshot(metric, siteUserId);
        const currentValue = toMetricNumber(valueEl.dataset.count, currentSnapshot.value);

        if(currentValue !== currentSnapshot.value) {
          animateMetricValue(valueEl, currentValue, currentSnapshot.value, suffix);
          valueEl.dataset.count = String(currentSnapshot.value);
        }

        const waitMs = Math.max((currentSnapshot.nextTickAt || Date.now()) - Date.now(), 250);
        activeTimer = window.setTimeout(scheduleNextTick, waitMs);
      };

      const firstWaitMs = Math.max((snapshot.nextTickAt || Date.now()) - Date.now(), 250);
      activeTimer = window.setTimeout(scheduleNextTick, firstWaitMs);
    }

    function renderHeroMetrics(metrics) {
      if(!specCards.length) return;
      clearHeroMetricTimers();
      const sourceMetrics = Array.isArray(metrics) && metrics.length
        ? metrics.filter((item) => item?.enabled)
        : defaultHeroMetrics.filter((item) => item?.enabled);
      const nextMetrics = orderMetrics(sourceMetrics);

      specCards.forEach((card, index) => {
        const metric = nextMetrics[index];
        if(!metric) {
          card.style.display = 'none';
          return;
        }

        card.style.display = '';
        bindMetricCard(card, metric);
      });
    }

    async function loadHeroMetrics() {
      const userId = getSiteUserId();
      renderHeroMetrics(defaultHeroMetrics);

      if(!userId) return;

      try {
        const response = await fetch(`/api/super-site-settings/public/${encodeURIComponent(userId)}`);
        if(!response.ok) return;
        const payload = await response.json();
        savedSiteImageSlots = Array.isArray(payload?.siteImageSlots) ? payload.siteImageSlots : [];
        draftSiteImageSlots = savedSiteImageSlots.map((item) => ({ ...item }));
        applySiteImageSlots(savedSiteImageSlots);
        if(Array.isArray(payload?.siteMetrics) && payload.siteMetrics.length) {
          renderHeroMetrics(payload.siteMetrics);
        }
      } catch (error) {
        console.warn('load hero metrics failed', error);
      }
    }

    loadHeroMetrics();

    function runPageLoader() {
      const loader = document.querySelector(".page-loader");
      const loaderText = document.querySelector(".loader-text");
      if (!loader || !loaderText) return;
      
      gsap.to(loaderText, {
        opacity: 0,
        duration: 0.6,
        delay: 0.5,
        ease: "power2.inOut"
      });
      
      gsap.to(loader, {
        yPercent: -100,
        duration: 1.2,
        delay: 0.8,
        ease: "power4.inOut",
        onComplete: () => {
          loader.style.display = "none";
          ScrollTrigger.refresh();
        }
      });
    }

    if (document.readyState === "complete") {
      runPageLoader();
    } else {
      window.addEventListener("load", runPageLoader, { once: true });
    }

    gsap.registerPlugin(ScrollTrigger);
    
    // Instead of simple CSS reveals, let's use GSAP for all .reveal elements
    const reveals = document.querySelectorAll('.reveal');
    const countEls=document.querySelectorAll('[data-count]');
    const topbar=document.getElementById('topbar');
    const navLinks=document.querySelectorAll('.nav a');
    const sections=document.querySelectorAll('section[id]');
    const parallaxEls=document.querySelectorAll('[data-parallax]');
    const video=document.getElementById('brandVideo');
    const videoToggle=document.querySelector('.video-toggle');
    const trendBox=document.getElementById('trendBox');
    const industryNewsList=document.getElementById('industryNewsList');
    const industryNewsMoreBtn=document.getElementById('industryNewsMoreBtn');
    const industryNewsHint=document.getElementById('industryNewsHint');
    const industryNewsOverlay=document.getElementById('industryNewsOverlay');
    const industryNewsOverlayClose=document.getElementById('industryNewsOverlayClose');
    const industryNewsOverlayList=document.getElementById('industryNewsOverlayList');
    const industryNewsDetailCover=document.getElementById('industryNewsDetailCover');
    const industryNewsDetailMeta=document.getElementById('industryNewsDetailMeta');
    const industryNewsDetailTitle=document.getElementById('industryNewsDetailTitle');
    const industryNewsDetailSummary=document.getElementById('industryNewsDetailSummary');
    const industryNewsDetailLink=document.getElementById('industryNewsDetailLink');
    let industryNewsItems=[];
    let activeIndustryNewsId='';
    let industryNewsLastFocusEl=null;
    let industryNewsOverlayMode='list';

    reveals.forEach((el) => {
      // Mersi-style curtain reveal for images/visuals
      if(el.classList.contains('photo-tall') || el.classList.contains('photo-wide') || el.classList.contains('visual') || el.classList.contains('hero-image') || el.classList.contains('video-box') || el.classList.contains('p-image-wrap') || el.classList.contains('marquee-section')) {
        // Reset CSS transform/transition conflict for these
        el.style.transition = 'none';
        gsap.fromTo(el,
          { clipPath: "inset(100% 0% 0% 0%)", scale: 1.05 },
          {
            clipPath: "inset(0% 0% 0% 0%)",
            scale: 1,
            duration: 1.8,
            ease: "power4.inOut",
            scrollTrigger: {
              trigger: el,
              start: "top 90%",
              end: "bottom 10%",
              toggleActions: "play reverse play reverse",
              onEnter: () => {
                el.classList.add('in-view');
              },
              onLeave: () => {
                el.classList.remove('in-view');
                if(el.hasAttribute('data-count')) el.dataset.animated = 'false';
                el.querySelectorAll?.('[data-count]').forEach((node)=>node.dataset.animated = 'false');
              },
              onEnterBack: () => {
                el.classList.add('in-view');
                if(el.hasAttribute('data-count')) animateCount(el);
                el.querySelectorAll?.('[data-count]').forEach((node)=>animateCount(node));
              },
              onLeaveBack: () => {
                el.classList.remove('in-view');
                if(el.hasAttribute('data-count')) el.dataset.animated = 'false';
                el.querySelectorAll?.('[data-count]').forEach((node)=>node.dataset.animated = 'false');
              }
            },
            onComplete: () => {
              el.style.transition = ''; // Restore hover transitions
            }
          }
        );
      } else {
        // Soft fade up for text and other elements
        gsap.fromTo(el, 
          { y: 60, opacity: 0 },
          {
            y: 0, 
            opacity: 1,
            duration: 1.4,
            ease: "power3.out",
            scrollTrigger: {
              trigger: el,
              start: "top 90%",
              end: "bottom 10%",
              toggleActions: "play reverse play reverse",
              onEnter: () => {
                el.classList.add('in-view');
                if(el.hasAttribute('data-count')) animateCount(el);
                el.querySelectorAll?.('[data-count]').forEach((node)=>animateCount(node));
              },
              onLeave: () => {
                el.classList.remove('in-view');
                if(el.hasAttribute('data-count')) el.dataset.animated = 'false';
                el.querySelectorAll?.('[data-count]').forEach((node)=>node.dataset.animated = 'false');
              },
              onEnterBack: () => {
                el.classList.add('in-view');
                if(el.hasAttribute('data-count')) animateCount(el);
                el.querySelectorAll?.('[data-count]').forEach((node)=>animateCount(node));
              },
              onLeaveBack: () => {
                el.classList.remove('in-view');
                if(el.hasAttribute('data-count')) el.dataset.animated = 'false';
                el.querySelectorAll?.('[data-count]').forEach((node)=>node.dataset.animated = 'false');
              }
            }
          }
        );
      }
    });

    if(trendBox) {
      ScrollTrigger.create({
        trigger: trendBox,
        start: "top 90%",
        end: "bottom 10%",
        onEnter: () => trendBox.classList.add('in-view'),
        onLeave: () => trendBox.classList.remove('in-view'),
        onEnterBack: () => trendBox.classList.add('in-view'),
        onLeaveBack: () => trendBox.classList.remove('in-view')
      });
    }

    countEls.forEach((el) => {
      if(!el.closest('.reveal')) {
        ScrollTrigger.create({
          trigger: el,
          start: "top 90%",
          end: "bottom 10%",
          onEnter: () => animateCount(el),
          onLeave: () => el.dataset.animated = 'false',
          onEnterBack: () => animateCount(el),
          onLeaveBack: () => el.dataset.animated = 'false'
        });
      }
    });

    function formatValue(value,decimals,suffix){
      const num=decimals>0?value.toFixed(decimals):Math.round(value).toString();
      const withComma=num.replace(/\B(?=(\d{3})+(?!\d))/g,',');
      const suffixHtml = suffix ? `<span class="unit-suffix">${suffix}</span>` : '';
      return withComma+suffixHtml;
    }
    function animateCount(el){
      if(el.dataset.animated==='true') return;
      el.dataset.animated='true';
      const target=Number(el.dataset.count||0);
      const decimals=Number(el.dataset.decimals||(String(target).includes('.')?1:0));
      const suffix=el.dataset.suffix||'';
      const duration=1400;
      const start=performance.now();
      function tick(now){
        const progress=Math.min((now-start)/duration,1);
        const eased=1-Math.pow(1-progress,3);
        el.innerHTML=formatValue(target*eased,decimals,suffix);
        if(progress<1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    function updateScrollState(){
      const y=window.scrollY;
      topbar.classList.toggle('compact',y>28);
      let current='';
      sections.forEach((section)=>{ if(y>=section.offsetTop-120) current=section.id; });
      navLinks.forEach((link)=>link.classList.toggle('active',link.getAttribute('href')==='#'+current));
    }
    updateScrollState();
    window.addEventListener('scroll',updateScrollState,{passive:true});
    window.addEventListener('resize',updateScrollState);

    // GSAP Parallax for data-parallax elements
    parallaxEls.forEach((el) => {
      const speed = Number(el.dataset.parallax || 0.06);
      gsap.to(el, {
        y: () => (window.innerHeight * speed),
        ease: "none",
        scrollTrigger: {
          trigger: el.parentElement,
          start: "top bottom",
          end: "bottom top",
          scrub: true
        }
      });
    });

    // ==========================================
    // 鏍稿績鍖哄潡閲嶅害婊氬姩浜や簰 (Heavy Scroll Scrub)
    // ==========================================

    // 5. Special Offers - 3D reveal
    const gsOfferCards = gsap.utils.toArray(".offers-grid .offer-card");
    gsOfferCards.forEach((card, index) => {
      card.style.transition = 'none';
      gsap.fromTo(card,
        { y: 200, rotationZ: index % 2 === 0 ? -3 : 3, scale: 0.9 },
        {
          y: 0,
          rotationZ: 0,
          scale: 1,
          ease: "none",
          scrollTrigger: {
            trigger: card,
            start: "top 100%",
            end: "top 40%",
            scrub: 2.5 
          }
        }
      );
    });

    // 浣滃搧闆嗗垎绫昏繃婊ら€昏緫
    const filterBtns = document.querySelectorAll('.pf-btn');
    const portfolioFilters = document.querySelector('.portfolio-filters');
    const portfolioGrid = document.getElementById('portfolioGrid');
    function getPortfolioItems(){
      return Array.from(portfolioGrid?.querySelectorAll('.p-item') || []);
    }

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const portfolioItems = getPortfolioItems();
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const filterValue = btn.getAttribute('data-filter');
        
        portfolioGrid.style.opacity = '0';
        
        setTimeout(() => {
          portfolioItems.forEach(item => {
            if (filterValue === 'all' || item.getAttribute('data-category') === filterValue) {
              item.classList.remove('hidden');
            } else {
              item.classList.add('hidden');
            }
          });
          portfolioGrid.style.opacity = '1';
        }, 600);
      });
    });

    const projectOverlay = document.getElementById('projectOverlay');
    const projectOverlayPanel = projectOverlay?.querySelector('.project-overlay__panel');
    const projectOverlayMedia = projectOverlay?.querySelector('.project-overlay__media');
    const projectOverlayClose = document.getElementById('projectOverlayClose');
    const projectOverlayImage = document.getElementById('projectOverlayImage');
    const projectOverlayPrev = document.getElementById('projectOverlayPrev');
    const projectOverlayNext = document.getElementById('projectOverlayNext');
    const projectOverlayCount = document.getElementById('projectOverlayCount');
    const projectOverlayMeta = document.getElementById('projectOverlayMeta');
    const projectOverlayTitle = document.getElementById('projectOverlayTitle');
    const projectOverlayDesc = document.getElementById('projectOverlayDesc');
    const projectOverlaySpecs = document.getElementById('projectOverlaySpecs');
    const projectOverlayConsultBtn = document.getElementById('projectOverlayConsultBtn');
    const offersGrid = document.getElementById('offersGrid');
    let activeProjectIndex = -1;
    let activeProjectImageIndex = 0;
    let lastFocusEl = null;
    let dragActive = false;
    let dragStartX = 0;
    let dragDeltaX = 0;

    const extraGalleryPool = [
      "/assets/images/landing/img_18.png",
      "/assets/images/landing/img_19.jpeg",
      "/assets/images/landing/img_0.jpeg",
      "/assets/images/landing/img_1.png",
      "/assets/images/landing/img_2.jpeg",
      "/assets/images/landing/img_3.jpeg",
      "/assets/images/landing/img_4.jpeg",
      "/assets/images/landing/img_5.jpeg",
      "/assets/images/landing/img_6.jpeg",
    ];

    function getBgUrl(styleValue){
      const m = String(styleValue || '').match(/url\((['"]?)(.*?)\1\)/);
      return m?.[2] || '';
    }

    function uniqueSample(list, count, exclude){
      const pool = list.filter((u)=>u && u!==exclude);
      for(let i = pool.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, count);
    }

    function escapeHtml(value){
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function buildOfferPrice(product){
      if (product?.specialOfferEnabled) {
        return {
          label: product.specialTag || '特惠价',
          currentText: product.specialPriceText || product.priceText || '',
          originalText: product.originalPriceText || '',
        };
      }

      return {
        label: product?.specialTag || '售价',
        currentText: product?.priceText || '',
        originalText: '',
      };
    }

    function renderOfferCard(product, index){
      const primaryImage = product.images?.[0] || extraGalleryPool[index % extraGalleryPool.length] || '/assets/images/landing/img_14.jpeg';
      const price = buildOfferPrice(product);
      const englishName = product.englishName
        ? product.englishName.replace(/-/g, ' ').toUpperCase()
        : `PRODUCT ${index + 1}`;

      return `
        <article class="offer-card reveal in-view" data-product-id="${escapeHtml(product.id)}">
          <div class="offer-image" style="background-image: url('${escapeHtml(primaryImage)}')">
            <span class="badge${product.specialOfferEnabled ? ' hot' : ''}">${escapeHtml(price.label || '精选商品')}</span>
          </div>
          <div class="offer-content">
            <p class="eyebrow">${escapeHtml(englishName)}</p>
            <h3>${escapeHtml(product.name || `产品 ${index + 1}`)}</h3>
            <p class="desc">${escapeHtml(product.summary || product.description || '欢迎咨询该商品的适用场景、规格方案和合作方式。')}</p>
            <div class="price-row">
              <div class="price">
                <span class="currency">¥</span><strong>${escapeHtml((price.currentText || '').replace(/^[¥楼]\s*/, ''))}</strong>${price.originalText ? `<del>${escapeHtml(price.originalText)}</del>` : ''}
              </div>
              <button class="buy-btn" type="button">立即抢购</button>
            </div>
          </div>
        </article>
      `;
    }

    function renderPortfolioCard(product, index){
      const primaryImage = product.images?.[0] || extraGalleryPool[(index + 3) % extraGalleryPool.length] || '/assets/images/landing/img_8.jpeg';
      const categoryValue = String(product.category || '').trim();
      const categoryLabel = categoryValue || String(product.summary || product.description || '').replace(/\s+/g, ' ').trim().slice(0, 18);
      const currentPrice = String(product.priceText || '欢迎咨询').trim() || '欢迎咨询';
      const dataCat = categoryValue || 'all';

      return `
        <article class="p-item reveal in-view" data-category="${escapeHtml(dataCat)}" data-product-id="${escapeHtml(product.id)}" data-desc="${escapeHtml(product.summary || product.description || '欢迎咨询该案例对应的空间适配、材质组合与施工方案。')}" data-price-label="售价" data-price-value="${escapeHtml(currentPrice)}">
          <div class="p-image-wrap"><div class="p-image" style="background-image:url('${escapeHtml(primaryImage)}')"></div></div>
          <div class="p-info">
            ${categoryLabel ? `<span class="p-cat">${escapeHtml(categoryLabel)}</span>` : ''}
            <h3>${escapeHtml(product.name || `案例 ${index + 1}`)}</h3>
          </div>
        </article>
      `;
    }

    const offersSection = document.getElementById('special-offers');
    const offersPagination = document.getElementById('offersPagination');
    const offersPaginationPrev = document.getElementById('offersPaginationPrev');
    const offersPaginationNext = document.getElementById('offersPaginationNext');
    const offersPaginationStatus = document.getElementById('offersPaginationStatus');
    const OFFER_PAGE_SIZE = 3;
    let publicOfferItems = [];
    let currentOfferPage = 0;

    let projects = [];

    let offerProjects = [];

    function bindPortfolioItems(){
      const portfolioItems = getPortfolioItems();
      projects = portfolioItems.map((item, index) => {
        const title = item.querySelector('h3')?.textContent?.trim() || `案例 ${index + 1}`;
        const cat = item.querySelector('.p-cat')?.textContent?.trim() || '项目';
        const primary = getBgUrl(item.querySelector('.p-image')?.style?.backgroundImage);
        const images = [primary, ...uniqueSample(extraGalleryPool, 2, primary)].filter(Boolean);
        const desc = item.dataset.desc?.trim() || '以“装饰 + 供暖 + 健康”一体化为导向，将石墨烯远红外发热层融入空间肌理，完成从功能到情绪的整体交付。';
        const specLabel = item.dataset.priceLabel?.trim() || '价格';
        const specValue = item.dataset.priceValue?.trim() || '欢迎咨询';
        const specs = [
          { k: specLabel, v: specValue }
        ];

        item.setAttribute('tabindex', '0');
        item.setAttribute('role', 'button');
        item.setAttribute('aria-label', `打开案例：${title}`);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openProject(index);
          }
        });

        return { title, cat, images, desc, specs };
      });
    }

    function renderPortfolioProducts(items){
      if(!portfolioGrid) return;
      portfolioGrid.innerHTML = items.map((item, index) => renderPortfolioCard(item, index)).join('');
      if(portfolioFilters){
        const categories = [...new Set(items.map(i => String(i.category || '').trim()).filter(Boolean))];
        if (categories.length > 0) {
          portfolioFilters.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;gap:36px;width:100%;position:relative;">
              <div style="display:flex;gap:36px;overflow-x:auto;scrollbar-width:none;flex-wrap:nowrap;">
                <button class="pf-btn active" data-filter="all">全部空间</button>
                ${categories.map(cat => `<button class="pf-btn" data-filter="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('')}
              </div>
               <button class="pf-btn" onclick="(() => { const params = new URLSearchParams(window.location.search); params.set('view','products'); window.location.href = window.location.pathname + '?' + params.toString(); })()" style="position:absolute;right:0;bottom:0;font-weight:700;">更多&gt;</button>
            </div>
          `;
          portfolioFilters.hidden = false;
          
          const newBtns = portfolioFilters.querySelectorAll('.pf-btn');
          newBtns.forEach(btn => {
            btn.addEventListener('click', () => {
              const pItems = getPortfolioItems();
              newBtns.forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              
              const filterValue = btn.getAttribute('data-filter');
              portfolioGrid.style.opacity = '0';
              setTimeout(() => {
                pItems.forEach(item => {
                  if (filterValue === 'all' || item.getAttribute('data-category') === filterValue) {
                    item.classList.remove('hidden');
                  } else {
                    item.classList.add('hidden');
                  }
                });
                portfolioGrid.style.opacity = '1';
              }, 600);
            });
          });
        } else {
          portfolioFilters.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;gap:36px;width:100%;position:relative;">
              <button class="pf-btn active" data-filter="all">全部空间</button>
               <button class="pf-btn" onclick="(() => { const params = new URLSearchParams(window.location.search); params.set('view','products'); window.location.href = window.location.pathname + '?' + params.toString(); })()" style="position:absolute;right:0;bottom:0;font-weight:700;">更多&gt;</button>
            </div>
          `;
          portfolioFilters.hidden = false;
        }
      }
      bindPortfolioItems();
    }

    function updateOffersPagination(totalItems){
      if(!offersPagination || !offersPaginationPrev || !offersPaginationNext || !offersPaginationStatus) return;
      const totalPages = Math.max(1, Math.ceil(totalItems / OFFER_PAGE_SIZE));
      offersPagination.hidden = totalItems <= OFFER_PAGE_SIZE;
      offersPaginationStatus.textContent = `${Math.min(currentOfferPage + 1, totalPages)} / ${totalPages}`;
      offersPaginationPrev.disabled = currentOfferPage <= 0;
      offersPaginationNext.disabled = currentOfferPage >= totalPages - 1;
    }

    function keepOffersSectionInView(){
      if(!offersSection) return;
      lenis.scrollTo(offersSection, {
        offset: -36,
        duration: 0.9,
      });
    }

    function animateOffersPage(direction = 1){
      if(!offersGrid || typeof gsap === 'undefined') return;
      const cards = offersGrid.querySelectorAll('.offer-card');
      if(!cards.length) return;

      gsap.killTweensOf(cards);
      gsap.set(cards, {
        opacity: 0,
        y: direction >= 0 ? 28 : -28,
        scale: 0.985,
      });
      gsap.to(cards, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.62,
        ease: 'power3.out',
        stagger: 0.05,
        clearProps: 'opacity,transform',
      });
    }

    function renderOffersPage(items, options = {}){
      if(!offersGrid) return;
      const shouldAnimate = options.animate === true;
      const direction = options.direction === -1 ? -1 : 1;
      const totalItems = Array.isArray(items) ? items.length : 0;
      const totalPages = Math.max(1, Math.ceil(totalItems / OFFER_PAGE_SIZE));
      currentOfferPage = Math.min(Math.max(currentOfferPage, 0), totalPages - 1);

      if(!totalItems){
        offersGrid.innerHTML = '';
        updateOffersPagination(0);
        bindOfferCards();
        return;
      }

      const start = currentOfferPage * OFFER_PAGE_SIZE;
      const currentItems = items.slice(start, start + OFFER_PAGE_SIZE);
      offersGrid.innerHTML = currentItems.map((item, index) => renderOfferCard(item, start + index)).join('');
      bindOfferCards();
      updateOffersPagination(totalItems);
      if(shouldAnimate){
        animateOffersPage(direction);
      }
    }

    function bindOfferCards(){
      const offerCards = offersGrid?.querySelectorAll('.offer-card') || [];

      offerProjects = Array.from(offerCards).map((item, index) => {
        const title = item.querySelector('h3')?.textContent?.trim() || `产品 ${index + 1}`;
        const cat = item.querySelector('.badge')?.textContent?.trim() || item.querySelector('.eyebrow')?.textContent?.trim() || '特价单品';
        const primary = getBgUrl(item.querySelector('.offer-image')?.style?.backgroundImage);
        const images = [primary, ...uniqueSample(extraGalleryPool, 2, primary)].filter(Boolean);
        const desc = item.querySelector('.desc')?.textContent?.trim() || '';
        const priceValue = item.querySelector('.price strong')?.textContent?.trim() || '100';
        const priceCurrency = item.querySelector('.price .currency')?.textContent?.trim() || '¥';
        const originalPrice = item.querySelector('.price del')?.textContent?.trim();
        const specs = [
          {
            k: cat || '活动价',
            v: `${priceCurrency} ${priceValue}${originalPrice ? ` <del>${originalPrice}</del>` : ''}`,
          }
        ];

        item.style.cursor = 'pointer';
        item.setAttribute('tabindex', '0');
        item.setAttribute('role', 'button');
        item.setAttribute('aria-label', `产品详情：${title}`);

        const clickHandler = (e) => {
          if(e.target.closest('.buy-btn')) return;
          e.preventDefault();
          openProject(index, true);
        };

        item.addEventListener('click', clickHandler);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            clickHandler(e);
          }
        });

        return { title, cat, images, desc, specs };
      });

      offersGrid?.querySelectorAll('.buy-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const product = btn.closest('.offer-card')?.querySelector('h3')?.textContent?.trim() || '特价产品';
          openChatWithMessage(`我想了解特价：${product}`);
        });
      });
    }

    async function loadPublicProducts() {
      const userId = getSiteUserId();
      if (!userId || !offersGrid) {
        bindPortfolioItems();
        bindOfferCards();
        updateOffersPagination(offersGrid?.querySelectorAll('.offer-card').length || 0);
        return;
      }

      try {
        const response = await fetch(`/api/products/public/${encodeURIComponent(userId)}`);
        if (!response.ok) {
          bindOfferCards();
          updateOffersPagination(offersGrid?.querySelectorAll('.offer-card').length || 0);
          return;
        }

        const payload = await response.json();
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const specialOfferItems = items.filter((item) => item?.specialOfferEnabled);
        const portfolioProductItems = items.filter((item) => !item?.specialOfferEnabled);
        if (!items.length) {
          bindPortfolioItems();
          bindOfferCards();
          updateOffersPagination(offersGrid?.querySelectorAll('.offer-card').length || 0);
          return;
        }

        if(portfolioProductItems.length){
          renderPortfolioProducts(portfolioProductItems);
        } else {
          bindPortfolioItems();
        }

        publicOfferItems = specialOfferItems;
        currentOfferPage = 0;
        if(publicOfferItems.length){
          renderOffersPage(publicOfferItems);
        } else {
          offersGrid.innerHTML = '';
          updateOffersPagination(0);
          bindOfferCards();
        }
      } catch (error) {
        console.warn('加载公开商品失败，继续使用静态商品卡片', error);
        bindPortfolioItems();
        bindOfferCards();
        updateOffersPagination(offersGrid?.querySelectorAll('.offer-card').length || 0);
      }
    }

    offersPaginationPrev?.addEventListener('click', () => {
      if(!publicOfferItems.length || currentOfferPage <= 0) return;
      currentOfferPage -= 1;
      renderOffersPage(publicOfferItems, { animate: true, direction: -1 });
      keepOffersSectionInView();
    });

    offersPaginationNext?.addEventListener('click', () => {
      if(!publicOfferItems.length) return;
      const totalPages = Math.ceil(publicOfferItems.length / OFFER_PAGE_SIZE);
      if(currentOfferPage >= totalPages - 1) return;
      currentOfferPage += 1;
      renderOffersPage(publicOfferItems, { animate: true, direction: 1 });
      keepOffersSectionInView();
    });

    let isViewingOffer = false;

    function renderProject(){
      const data = isViewingOffer ? offerProjects[activeProjectIndex] : projects[activeProjectIndex];
      if(!data) return;
      activeProjectImageIndex = Math.max(0, Math.min(activeProjectImageIndex, data.images.length - 1));
      const img = data.images[activeProjectImageIndex];
      projectOverlayImage.style.backgroundImage = `url("${img}")`;
      projectOverlayCount.textContent = `${activeProjectImageIndex + 1} / ${data.images.length}`;
      projectOverlayMeta.textContent = data.cat;
      projectOverlayTitle.textContent = data.title;
      projectOverlayDesc.textContent = data.desc;
      const price = data.specs?.[0];
      projectOverlaySpecs.innerHTML = price ? `<div class="project-overlay__price"><div class="project-overlay__price-label">${price.k}</div><div class="project-overlay__price-value">${price.v}</div></div>` : '';
    }

    function openProject(index, isOffer = false){
      if(!projectOverlay) return;
      isViewingOffer = isOffer;
      activeProjectIndex = index;
      activeProjectImageIndex = 0;
      renderProject();
      lastFocusEl = document.activeElement;
      projectOverlay.classList.add('is-open');
      projectOverlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('overlay-open');
      setTimeout(()=>projectOverlayClose?.focus?.(), 0);
    }

    function closeProject(){
      if(!projectOverlay) return;
      projectOverlay.classList.remove('is-open');
      projectOverlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('overlay-open');
      activeProjectIndex = -1;
      activeProjectImageIndex = 0;
      lastFocusEl?.focus?.();
    }

    function nextProjectImage(dir){
      const data = isViewingOffer ? offerProjects[activeProjectIndex] : projects[activeProjectIndex];
      if(!data) return;
      activeProjectImageIndex = (activeProjectImageIndex + dir + data.images.length) % data.images.length;
      renderProject();
      gsap.fromTo(projectOverlayImage, { opacity: 0.2, scale: 1.06 }, { opacity: 1, scale: 1.02, duration: 0.7, ease: "power3.out" });
    }

    portfolioGrid?.addEventListener('click', (e) => {
      const item = e.target.closest('.p-item');
      if(!item) return;
      const index = getPortfolioItems().indexOf(item);
      if(index >= 0) openProject(index);
    });

    projectOverlay?.addEventListener('click', (e) => {
      const closeHit = e.target.closest('[data-close="true"]');
      if(closeHit) closeProject();
    });
    projectOverlayClose?.addEventListener('click', closeProject);
    projectOverlayPrev?.addEventListener('click', () => nextProjectImage(-1));
    projectOverlayNext?.addEventListener('click', () => nextProjectImage(1));
    projectOverlayPanel?.addEventListener('click', (e) => e.stopPropagation());
    projectOverlayMedia?.addEventListener('pointerdown', (e) => {
      if(!projectOverlay?.classList.contains('is-open')) return;
      dragActive = true;
      dragStartX = e.clientX;
      dragDeltaX = 0;
      projectOverlayMedia.setPointerCapture?.(e.pointerId);
    });
    projectOverlayMedia?.addEventListener('pointermove', (e) => {
      if(!dragActive) return;
      dragDeltaX = e.clientX - dragStartX;
      const damp = Math.max(-140, Math.min(140, dragDeltaX));
      gsap.set(projectOverlayImage, { x: damp, rotate: damp * -0.02, scale: 1.03 });
    });
    projectOverlayMedia?.addEventListener('pointerup', () => {
      if(!dragActive) return;
      dragActive = false;
      const threshold = 60;
      const dir = dragDeltaX < -threshold ? 1 : dragDeltaX > threshold ? -1 : 0;
      gsap.to(projectOverlayImage, { x: 0, rotate: 0, scale: 1.02, duration: 0.35, ease: "power3.out" });
      if(dir) nextProjectImage(dir);
    });
    projectOverlayMedia?.addEventListener('pointercancel', () => {
      dragActive = false;
      gsap.to(projectOverlayImage, { x: 0, rotate: 0, scale: 1.02, duration: 0.35, ease: "power3.out" });
    });
    projectOverlayMedia?.addEventListener('wheel', (e) => {
      if(!projectOverlay?.classList.contains('is-open')) return;
      e.preventDefault();
      if(Math.abs(e.deltaY) < 6) return;
      nextProjectImage(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if(!projectOverlay?.classList.contains('is-open')) return;
      if(e.key === 'Escape') closeProject();
      if(e.key === 'ArrowLeft') nextProjectImage(-1);
      if(e.key === 'ArrowRight') nextProjectImage(1);
      if(e.key === 'Tab') {
        const focusables = Array.from(projectOverlay.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((el)=>!el.hasAttribute('disabled'));
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if(!first || !last) return;
        if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    });



    if(video && videoToggle){
      const syncVideoButton=()=>videoToggle.classList.toggle('is-playing',!video.paused);
      video.addEventListener('pause',syncVideoButton);
      video.addEventListener('ended',syncVideoButton);
      syncVideoButton();
    }

    const marketData={
      national:{summary:'当前视图聚焦全领域应用。点击下面的场景标签，可以切换不同空间的数据重心和机会说明。',labels:['星级酒店','医院康养','高端住宅','机场/地铁','影院/教育'],values:[91,84,76,69,52]},
      east:{summary:'星级酒店对供暖系统的隐形美观和舒适体验要求更高，石墨烯发热方案更适合高端商旅空间。',labels:['大堂/接待','客房/套房','洗浴中心','行政酒廊','会议中心'],values:[96,89,83,79,72]},
      south:{summary:'医院与康养中心更关注安全和健康体验，稳定控温、低噪音和理疗属性是核心卖点。',labels:['康复病房','理疗中心','养老公寓','休闲区','医护值班室'],values:[94,88,81,77,70]},
      north:{summary:'高端住宅业主更重视个性化定制与智能控制，可覆盖全屋多空间的舒适供暖体验。',labels:['客厅/大平层','卧室/书房','全屋地暖','浴室/桑拿','地下影音室'],values:[90,82,78,73,61]}
    };
    const marketSummary=document.getElementById('marketSummary');
    const labels=['A','B','C','D','E'].map((k)=>document.getElementById('label'+k));
    const values=['A','B','C','D','E'].map((k)=>document.getElementById('value'+k));
    const fills=['a','b','c','d','e'].map((k)=>document.querySelector('[data-fill="'+k+'"]'));
    const tabs=document.querySelectorAll('.market-tab');
    function updateMarket(key){
      const data=marketData[key];
      if(!data) return;
      marketSummary.textContent=data.summary;
      data.labels.forEach((label,index)=>labels[index].textContent=label);
      data.values.forEach((value,index)=>{ values[index].textContent=value+'%'; fills[index].style.width=value+'%'; });
      tabs.forEach((tab)=>tab.classList.toggle('is-active',tab.dataset.market===key));
    }
    tabs.forEach((tab)=>tab.addEventListener('click',()=>updateMarket(tab.dataset.market)));
    setTimeout(()=>{ updateMarket('national'); },120);

    const industrySourceLabelMap = {
      huxiu_rss: '虎嗅',
      '36kr_rss': '36氪',
      qbitai_html: '量子位',
      leiphone_html: '雷锋网',
      infoq_rss: 'InfoQ',
      ifanr_rss: '爱范儿',
      sspai_rss: '少数派',
      geekpark_rss: '极客公园',
      manual: '手动发布',
    };

    function getIndustrySourceLabel(item){
      return industrySourceLabelMap[item?.sourceKey] || item?.sourceKey || '行业资讯';
    }

    function formatIndustryNewsDate(value){
      if(!value) return '未设置时间';
      const date = new Date(value);
      if(Number.isNaN(date.getTime())) return '未设置时间';
      return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    }

    function getIndustryNewsPlainText(value){
      const temp = document.createElement('div');
      temp.innerHTML = String(value || '');
      return (temp.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function renderIndustryNewsInline(){
      if(!industryNewsList) return;
      if(!industryNewsItems.length){
        industryNewsList.innerHTML = '<div class="news-empty">暂未获取到公开行业与招商动态。</div>';
        return;
      }

      industryNewsList.innerHTML = industryNewsItems
        .slice(0, 5)
        .map((item, index) => `
          <button class="news-item-btn" type="button" data-news-id="${escapeHtml(item.id)}" aria-label="查看新闻详情：${escapeHtml(item.title)}">
            <span class="news-item-index">${String(index + 1).padStart(2, '0')}</span>
            <span class="news-item-content">
              <span class="news-item-title">${escapeHtml(item.title)}</span>
              <span class="news-item-meta">
                <span>${escapeHtml(getIndustrySourceLabel(item))}</span>
                <span>${escapeHtml(formatIndustryNewsDate(item.publishedAt))}</span>
              </span>
            </span>
            <span class="news-item-arrow">→</span>
          </button>
        `)
        .join('');

      industryNewsList.querySelectorAll('[data-news-id]').forEach((button) => {
        button.addEventListener('click', () => {
          openIndustryNewsOverlay(button.getAttribute('data-news-id'), 'detail');
        });
      });
    }

    function renderIndustryNewsOverlayList(){
      if(!industryNewsOverlayList) return;
      if(!industryNewsItems.length){
        industryNewsOverlayList.innerHTML = '<div class="news-overlay__empty">暂无公开行业与招商动态。</div>';
        return;
      }

      industryNewsOverlayList.innerHTML = industryNewsItems
        .map((item) => `
          <button class="news-overlay__card${item.id === activeIndustryNewsId ? ' is-active' : ''}" type="button" data-overlay-news-id="${escapeHtml(item.id)}" aria-label="查看新闻详情：${escapeHtml(item.title)}">
            <div class="news-overlay__card-title">${escapeHtml(item.title)}</div>
            <div class="news-overlay__card-meta">
              <span>${escapeHtml(getIndustrySourceLabel(item))}</span>
              <span>${escapeHtml(formatIndustryNewsDate(item.publishedAt))}</span>
            </div>
          </button>
        `)
        .join('');

      industryNewsOverlayList.querySelectorAll('[data-overlay-news-id]').forEach((button) => {
        button.addEventListener('click', () => {
          selectIndustryNews(button.getAttribute('data-overlay-news-id'));
        });
      });
    }

    function renderIndustryNewsDetail(item){
      if(!industryNewsDetailTitle || !industryNewsDetailSummary || !industryNewsDetailMeta || !industryNewsDetailLink || !industryNewsDetailCover) return;
      if(!item){
        industryNewsDetailMeta.textContent = '';
        industryNewsDetailTitle.textContent = '暂无可查看内容';
        industryNewsDetailSummary.textContent = '当前站点还没有可公开展示的行业与招商动态。';
        industryNewsDetailLink.style.display = 'none';
        industryNewsDetailCover.style.backgroundImage = 'linear-gradient(135deg,#2c2119,#8c654a)';
        return;
      }

      industryNewsDetailMeta.textContent = `${getIndustrySourceLabel(item)} / ${formatIndustryNewsDate(item.publishedAt)}`;
      industryNewsDetailTitle.textContent = item.title || '未命名新闻';
      industryNewsDetailSummary.textContent = getIndustryNewsPlainText(item.summary) || '暂无摘要，请点击查看原文获取完整内容。';
      industryNewsDetailCover.style.backgroundImage = item.coverImage
        ? `linear-gradient(180deg, rgba(24,19,15,.08), rgba(24,19,15,.52)), url("${item.coverImage}")`
        : 'linear-gradient(135deg,#2c2119,#8c654a)';

      if(item.sourceUrl){
        industryNewsDetailLink.href = item.sourceUrl;
        industryNewsDetailLink.style.display = '';
      } else {
        industryNewsDetailLink.removeAttribute('href');
        industryNewsDetailLink.style.display = 'none';
      }
    }

    function selectIndustryNews(newsId){
      const nextItem = industryNewsItems.find((item) => item.id === newsId) || industryNewsItems[0] || null;
      activeIndustryNewsId = nextItem?.id || '';
      renderIndustryNewsOverlayList();
      renderIndustryNewsDetail(nextItem);
    }

    function applyIndustryNewsOverlayMode(mode){
      if(!industryNewsOverlay) return;
      industryNewsOverlayMode = mode === 'detail' ? 'detail' : 'list';
      industryNewsOverlay.classList.toggle('is-detail-only', industryNewsOverlayMode === 'detail');
    }

    function openIndustryNewsOverlay(newsId, mode = 'list'){
      if(!industryNewsOverlay) return;
      industryNewsLastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      applyIndustryNewsOverlayMode(mode);
      industryNewsOverlay.classList.add('is-open');
      industryNewsOverlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('overlay-open');
      selectIndustryNews(newsId || activeIndustryNewsId || industryNewsItems[0]?.id || '');
      setTimeout(() => industryNewsOverlayClose?.focus?.(), 0);
    }

    function closeIndustryNewsOverlay(){
      if(!industryNewsOverlay?.classList.contains('is-open')) return;
      industryNewsOverlay.classList.remove('is-open');
      industryNewsOverlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('overlay-open');
      applyIndustryNewsOverlayMode('list');
      industryNewsLastFocusEl?.focus?.();
      industryNewsLastFocusEl = null;
    }

    async function loadIndustryNews(){
      if(!industryNewsList) return;
      const userId = getSiteUserId();
      industryNewsList.innerHTML = '<div class="news-empty">正在加载行业与招商动态...</div>';

      try {
        const response = await fetch(`/api/super-site-settings/public/${encodeURIComponent(userId)}/industry-items?page=1&limit=100`);
        if(!response.ok) throw new Error(`load industry news failed: ${response.status}`);
        const payload = await response.json();
        industryNewsItems = Array.isArray(payload?.items)
          ? payload.items.filter((item) => item?.enabled !== false)
          : [];
        activeIndustryNewsId = industryNewsItems[0]?.id || '';
      } catch (error) {
        console.warn('load industry news failed', error);
        industryNewsItems = [];
        activeIndustryNewsId = '';
      }

      renderIndustryNewsInline();
      renderIndustryNewsOverlayList();
      renderIndustryNewsDetail(industryNewsItems[0] || null);
    }

    industryNewsMoreBtn?.addEventListener('click', () => {
      openIndustryNewsOverlay(activeIndustryNewsId || industryNewsItems[0]?.id || '', 'list');
    });

    industryNewsHint?.addEventListener('click', () => {
      openIndustryNewsOverlay(activeIndustryNewsId || industryNewsItems[0]?.id || '', 'list');
    });

    industryNewsHint?.addEventListener('keydown', (event) => {
      if(event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openIndustryNewsOverlay(activeIndustryNewsId || industryNewsItems[0]?.id || '', 'list');
      }
    });

    industryNewsOverlay?.addEventListener('click', (event) => {
      const target = event.target;
      if(!(target instanceof HTMLElement)) return;
      if(target.dataset.close === 'true' || target === industryNewsOverlayClose) {
        closeIndustryNewsOverlay();
      }
    });

    window.addEventListener('keydown', (event) => {
      if(event.key === 'Escape' && industryNewsOverlay?.classList.contains('is-open')) {
        closeIndustryNewsOverlay();
      }
    });

    loadIndustryNews();

    function siteEditorRequest(path, options = {}) {
      if(!siteEditorContext.editorToken) {
        return Promise.reject(new Error('缺少编辑令牌，请从后台重新进入超级站编辑页。'));
      }

      return fetch(path, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${siteEditorContext.editorToken}`,
          ...(options.headers || {}),
        },
        ...options,
      }).then(async (response) => {
        const text = await response.text();
        const payload = text ? JSON.parse(text) : null;
        if(!response.ok) {
          const message = payload?.message || payload?.error || '超级站编辑请求失败';
          throw new Error(Array.isArray(message) ? message.join('，') : message);
        }
        return payload;
      });
    }

    function renderSiteEditorImageList() {
      if(!siteEditorThumbListEl) return;
      const images = normalizeSiteEditorImages(siteEditorContent);
      if(!images.length) {
        siteEditorThumbListEl.innerHTML = '<div class="site-editor__empty">当前内容没有可替换图片。</div>';
        return;
      }

      siteEditorThumbListEl.innerHTML = images
        .map((imageUrl, index) => `
          <button class="site-editor__thumb${imageUrl === selectedSiteEditorImage ? ' is-active' : ''}" type="button" data-editor-image="${escapeHtml(imageUrl)}" aria-label="选择第 ${index + 1} 张素材图">
            <span class="site-editor__thumb-image" style="background-image:url('${escapeHtml(imageUrl)}')"></span>
            <span class="site-editor__thumb-index">${String(index + 1).padStart(2, '0')}</span>
          </button>
        `)
        .join('');

      siteEditorThumbListEl.querySelectorAll('[data-editor-image]').forEach((button) => {
        button.addEventListener('click', () => {
          selectedSiteEditorImage = button.getAttribute('data-editor-image') || '';
          renderSiteEditorImageList();
          setSiteEditorStatus('已选择素材图，请点击前台需要替换的位置。', 'success');
        });
      });
    }

    function updateSiteEditorHotspots() {
      supportedSiteImageSlots.forEach((item) => {
        const element = getSiteImageSlotElement(item.slotKey);
        if (!element) return;
        const matched = getSiteEditorDraftSlot(item.slotKey);
        element.classList.toggle('site-image-slot', siteEditorContext.enabled);
        element.classList.toggle('is-selected-slot', matched?.imageUrl === selectedSiteEditorImage && Boolean(selectedSiteEditorImage));
      });
    }

    function applySiteEditorSelection(slotKey) {
      if(!selectedSiteEditorImage) {
        setSiteEditorStatus('请先在左侧素材列表选择一张图片。', 'error');
        return;
      }

      const definition = siteImageSlotDefinitionMap.get(slotKey);
      if(!definition) return;

      const nextSlot = {
        slotKey,
        moduleKey: definition.moduleKey,
        imageUrl: selectedSiteEditorImage,
        sourceContentId: siteEditorContent?.id || null,
        updatedAt: new Date().toISOString(),
      };

      draftSiteImageSlots = [
        ...draftSiteImageSlots.filter((item) => item.slotKey !== slotKey),
        nextSlot,
      ];
      applySiteImageSlot(slotKey, selectedSiteEditorImage);
      updateSiteEditorHotspots();
      setSiteEditorStatus(`已替换 ${slotKey}，可继续选择其他位置，最后统一保存。`, 'success');
    }

    function bindSiteEditorHotspots() {
      supportedSiteImageSlots.forEach((item) => {
        const element = getSiteImageSlotElement(item.slotKey);
        if(!element || element.dataset.siteEditorBound === 'true') return;
        element.dataset.siteEditorBound = 'true';
        element.addEventListener('click', (event) => {
          if(!siteEditorContext.enabled) return;
          event.preventDefault();
          event.stopPropagation();
          applySiteEditorSelection(item.slotKey);
        });
      });
      updateSiteEditorHotspots();
    }

    function closeSiteEditor() {
      siteEditorContext.enabled = false;
      applySiteImageSlots(savedSiteImageSlots);
      supportedSiteImageSlots.forEach((item) => {
        const element = getSiteImageSlotElement(item.slotKey);
        if (!element) return;
        element.classList.remove('site-image-slot', 'is-selected-slot');
      });
      siteEditorRoot?.remove();
      siteEditorRoot = null;
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('siteEditor');
      nextUrl.searchParams.delete('contentId');
      nextUrl.searchParams.delete('editorToken');
      window.history.replaceState({}, '', nextUrl.toString());
    }

    async function saveSiteEditorSlots() {
      try {
        setSiteEditorStatus('正在保存超级站图片配置...', 'normal');
        const payload = await siteEditorRequest('/api/super-site-settings/me', {
          method: 'PUT',
          body: JSON.stringify({ siteImageSlots: draftSiteImageSlots }),
        });
        savedSiteImageSlots = Array.isArray(payload?.siteImageSlots) ? payload.siteImageSlots : draftSiteImageSlots;
        draftSiteImageSlots = savedSiteImageSlots.map((item) => ({ ...item }));
        applySiteImageSlots(savedSiteImageSlots);
        updateSiteEditorHotspots();
        setSiteEditorStatus('已保存到超级站，刷新前台后仍会保留当前替换结果。', 'success');
      } catch (error) {
        setSiteEditorStatus(error instanceof Error ? error.message : '保存超级站图片配置失败', 'error');
      }
    }

    function createSiteEditorLayout() {
      if (siteEditorRoot) return;
      siteEditorRoot = document.createElement('aside');
      siteEditorRoot.className = 'site-editor';
      siteEditorRoot.innerHTML = `
        <div class="site-editor__head">
          <div>
            <p class="site-editor__eyebrow">Super Site Editor</p>
            <h3 id="siteEditorTitle">上传超级站</h3>
          </div>
          <button class="site-editor__close" id="siteEditorClose" type="button">退出</button>
        </div>
        <p class="site-editor__desc">先选图，再点击首页或样板店的图片区域；全部替换完成后统一保存。</p>
        <div class="site-editor__status" id="siteEditorStatus"></div>
        <div class="site-editor__thumbs" id="siteEditorThumbs"></div>
        <div class="site-editor__actions">
          <button class="site-editor__btn site-editor__btn--ghost" id="siteEditorCancel" type="button">取消修改</button>
          <button class="site-editor__btn site-editor__btn--primary" id="siteEditorSave" type="button">保存全部</button>
        </div>
      `;
      document.body.appendChild(siteEditorRoot);
      siteEditorStatusEl = document.getElementById('siteEditorStatus');
      siteEditorTitleEl = document.getElementById('siteEditorTitle');
      siteEditorThumbListEl = document.getElementById('siteEditorThumbs');
      document.getElementById('siteEditorClose')?.addEventListener('click', closeSiteEditor);
      document.getElementById('siteEditorCancel')?.addEventListener('click', () => {
        draftSiteImageSlots = savedSiteImageSlots.map((item) => ({ ...item }));
        applySiteImageSlots(savedSiteImageSlots);
        updateSiteEditorHotspots();
        setSiteEditorStatus('已撤销未保存修改。', 'normal');       
      });
      document.getElementById('siteEditorSave')?.addEventListener('click', () => {
        saveSiteEditorSlots();
      });
    }

    async function initializeSiteEditor() {
      if(!siteEditorContext.enabled || !siteEditorContext.contentId) return;

      createSiteEditorLayout();
      bindSiteEditorHotspots();
      setSiteEditorStatus('正在加载内容池素材...', 'normal');

      try {
        siteEditorContent = await siteEditorRequest(`/api/publishing/contents/${encodeURIComponent(siteEditorContext.contentId)}`);
        selectedSiteEditorImage = normalizeSiteEditorImages(siteEditorContent)[0] || '';
        if(siteEditorTitleEl) {
          siteEditorTitleEl.textContent = siteEditorContent?.title
            ? `上传超级站 · ${siteEditorContent.title}`
            : '上传超级站';
        }
        renderSiteEditorImageList();
        updateSiteEditorHotspots();
        setSiteEditorStatus('素材已加载，先选图，再点击首页或样板店图片位。', 'success');
      } catch (error) {
        setSiteEditorStatus(error instanceof Error ? error.message : '加载上传超级站素材失败', 'error');
      }
    }

    initializeSiteEditor();

    // 铏氭嫙IP浜や簰閫昏緫
    const ipContainer = document.querySelector('.ip-avatar-container');
    const chatBubble = document.getElementById('chatBubble');
    const closeBtn = document.querySelector('.close-btn');
    const actionBtns = document.querySelectorAll('.action-btn');
    const chatHistory = document.getElementById('chatHistory');
    const chatStatus = document.getElementById('chatStatus');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const SUPPORT_STORAGE_PREFIX = 'zl_supersite_support_session_v1';
    const defaultWelcomeMessages = [
      {
        id: 'local-welcome',
        role: 'ai',
        content: '您好！我是志林科技的招商顾问小林，有什么我可以帮您的吗？',
      },
    ];
    const hiddenSupportSystemMessages = new Set([
      '会话已创建，当前由 AI 客服托管。',
    ]);

    let supportConversation = null;
    let supportBootPromise = null;
    let supportSending = false;

    function getSupportStorageKey() {
      return `${SUPPORT_STORAGE_PREFIX}_${getSiteUserId()}`;
    }

    function getVisitorSessionId() {
      const storageKey = getSupportStorageKey();
      const existing = window.localStorage.getItem(storageKey);
      if (existing) return existing;
      const nextId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(storageKey, nextId);
      return nextId;
    }

    function scrollChatToBottom() {
      chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function setChatBusy(isBusy) {
      supportSending = isBusy;
      chatInput.disabled = isBusy;
      chatSendBtn.disabled = isBusy;
      actionBtns.forEach((btn) => {
        btn.disabled = isBusy;
        btn.classList.toggle('is-disabled', isBusy);
      });
    }

    function setChatStatus(message = '', type = 'normal') {
      chatStatus.textContent = message;
      chatStatus.classList.toggle('is-visible', Boolean(message));
      chatStatus.style.color =
        type === 'error'
          ? '#9f2c2c'
          : type === 'success'
            ? '#2e7d32'
            : 'var(--muted)';
    }

    function getMessageClass(role) {
      if (role === 'visitor') return 'msg msg-user';
      if (role === 'ai') return 'msg msg-ai';
      if (role === 'system') return 'msg msg-system';
      return 'msg msg-ai';
    }

    function appendChatMessage(role, content, extraClass = '') {
      const bubble = document.createElement('div');
      bubble.className = `${getMessageClass(role)}${extraClass ? ` ${extraClass}` : ''}`;
      bubble.innerHTML = `<p>${escapeHtml(content)}</p>`;
      chatHistory.appendChild(bubble);
      scrollChatToBottom();
      return bubble;
    }

    function renderConversationMessages(messages) {
      const list = Array.isArray(messages) && messages.length
        ? messages.filter((message) => !hiddenSupportSystemMessages.has(String(message?.content || '').trim()))
        : defaultWelcomeMessages;
      chatHistory.innerHTML = '';
      list.forEach((message) => {
        appendChatMessage(message.role, message.content);
      });
    }

    function renderConversation(conversation) {
      supportConversation = conversation;
      renderConversationMessages(conversation?.messages);

      if (conversation?.status === 'queueing' || conversation?.status === 'handoff_requested') {
        fetchQueueStatus();
        return;
      }

      if (conversation?.status === 'human_chat') {
        setChatStatus('人工客服已接入，请继续留言。', 'success');
        return;
      }

      setChatStatus('');
    }

    async function supportRequest(path, options = {}) {
      const response = await fetch(path, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        ...options,
      });

      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (!response.ok) {
        const message = payload?.message || payload?.error || 'AI 客服请求失败';
        throw new Error(Array.isArray(message) ? message.join('，') : message);
      }

      return payload;
    }

    async function ensureSupportSession(options = {}) {
      if (supportConversation?.id) {
        return supportConversation;
      }

      if (!supportBootPromise) {
        supportBootPromise = supportRequest('/api/support/public/sessions', {
          method: 'POST',
          body: JSON.stringify({
            visitorSessionId: getVisitorSessionId(),
            sourcePage: window.location.href,
          }),
        })
          .then((conversation) => {
            supportConversation = conversation;
            if (!options.skipRender) {
              renderConversation(conversation);
            }
            return conversation;
          })
          .finally(() => {
            supportBootPromise = null;
          });
      }

      return supportBootPromise;
    }

    async function fetchQueueStatus() {
      if (!supportConversation?.id) return;
      try {
        const queue = await supportRequest(`/api/support/public/sessions/${encodeURIComponent(supportConversation.id)}/queue`);
        if (queue?.status === 'queueing' || queue?.status === 'handoff_requested') {
          setChatStatus(queue.queueNumber ? `已进入人工排队，当前前方 ${queue.queueNumber - 1} 人。` : '已进入人工排队，请稍候。');
          return;
        }
        if (queue?.status === 'human_chat') {
          setChatStatus('人工客服已接入，请继续留言。', 'success');
          return;
        }
        setChatStatus('');
      } catch (error) {
        console.warn('fetch queue status failed', error);
      }
    }

    async function sendSupportMessage(message, options = {}) {
      const normalizedMessage = message.trim();
      if (!normalizedMessage || supportSending) return;

      setChatBusy(true);
      setChatStatus('AI 客服处理中...');
      let pendingReplyBubble = null;

      try {
        const conversation = await ensureSupportSession({ skipRender: true });
        appendChatMessage('visitor', normalizedMessage);
        pendingReplyBubble = appendChatMessage('ai', '小林助手正在回复...', 'msg-pending');
        const updated = await supportRequest(
          `/api/support/public/sessions/${encodeURIComponent(conversation.id)}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({ message: normalizedMessage }),
          }
        );
        renderConversation(updated);

        if (updated?.status === 'queueing' || updated?.status === 'handoff_requested') {
          await fetchQueueStatus();
        } else if (updated?.status === 'ai_chat') {
          setChatStatus('AI 客服已回复。', 'success');
          window.setTimeout(() => setChatStatus(''), 1200);
        }

        if (options.targetSelector) {
          const targetEl = document.querySelector(options.targetSelector);
          if (targetEl) {
            const offsetTop = targetEl.getBoundingClientRect().top + window.scrollY - 80;
            window.scrollTo({ top: offsetTop, behavior: 'smooth' });
          }
        }
      } catch (error) {
        pendingReplyBubble?.remove();
        setChatStatus(error instanceof Error ? error.message : 'AI 客服暂时不可用', 'error');
        appendChatMessage('system', error instanceof Error ? error.message : 'AI 客服暂时不可用', 'msg-error');
      } finally {
        setChatBusy(false);
      }
    }

    async function requestSupportHandoff(note = '') {
      try {
        const conversation = await ensureSupportSession();
        const updated = await supportRequest(
          `/api/support/public/sessions/${encodeURIComponent(conversation.id)}/handoff`,
          {
            method: 'POST',
            body: JSON.stringify({ note }),
          }
        );
        renderConversation(updated);
        setChatStatus(
          updated?.queueNumber
            ? `已转人工，当前排队号 ${updated.queueNumber}。`
            : '已转人工，正在排队。',
          'success'
        );
      } catch (error) {
        setChatStatus(error instanceof Error ? error.message : '转人工失败', 'error');
      }
    }

    // 切换对话框
    ipContainer.addEventListener('click', () => {
      chatBubble.classList.toggle('is-open');
    });

    // --- 平面3D 悬浮视差交互 ---
    const pseudo3DWrap = document.getElementById('pseudo3DWrap');
    if (pseudo3DWrap) {
      ipContainer.addEventListener('mousemove', (e) => {
        const rect = ipContainer.getBoundingClientRect();
        // 计算鼠标在容器中的位置比例 (-1 到 1)
        const x = (e.clientX - rect.left) / rect.width * 2 - 1;
        const y = (e.clientY - rect.top) / rect.height * 2 - 1;
        // 映射到旋转角度 (X轴旋转跟Y轴偏移反向，Y轴旋转跟X轴偏移同向)
        const rotateX = -y * 15; // 最大上下倾斜 15度
        const rotateY = x * 15;  // 最大左右倾斜 15度
        
        pseudo3DWrap.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
      });
      ipContainer.addEventListener('mouseleave', () => {
        // 鼠标移出时恢复原状
        pseudo3DWrap.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)`;
      });
    }

    // 鍏抽棴鎸夐挳
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chatBubble.classList.remove('is-open');
    });

    const localAnswers = {
      'company-profile': '志林科技致力于石墨烯核心科技的研发与应用，将装饰、供暖与健康理疗完美融合，为您打造智能化、健康化的现代生活空间。',
      'product-advantages': '我们的核心优势在于：1. 石墨烯速发热技术；2. 远红外健康理疗功能；3. 环保安全的高端装饰材料。',
      'franchise-rules': '我们为您提供八大政策扶持与六步盈利闭环，从开店选址、装修设计到营销推广，全程一站式帮扶，轻松实现盈利。',
      'company-address': '我们总部欢迎您的莅临考察！具体地址详情可直接咨询人工客服为您预约专属接待行程。'
    };

    actionBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const actionText = e.currentTarget.textContent.trim();
        const targetSelector = e.currentTarget.getAttribute('data-target');
        const localAction = e.currentTarget.getAttribute('data-action');
        
        chatBubble.classList.add('is-open');
        
        if (localAction && localAnswers[localAction]) {
          appendChatMessage('visitor', actionText);
          setTimeout(() => {
            appendChatMessage('ai', localAnswers[localAction]);
          }, 500);
          return;
        }

        await sendSupportMessage(actionText, { targetSelector });
      });
    });

    async function handleSendMsg() {
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';
      chatBubble.classList.add('is-open');
      await sendSupportMessage(text);
    }

    chatSendBtn.addEventListener('click', handleSendMsg);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSendMsg();
      }
    });

    function openChatWithMessage(message){
      chatBubble.classList.add('is-open');
      sendSupportMessage(message);
      setTimeout(()=>chatInput?.focus?.(), 0);
    }

    projectOverlayConsultBtn?.addEventListener('click', () => {
      const data = isViewingOffer ? offerProjects[activeProjectIndex] : projects[activeProjectIndex];
      if(!data) return;
      closeProject();
      openChatWithMessage(isViewingOffer ? `我想了解特价：${data.title}` : `我想了解案例：${data.title}，${data.cat}`);
    });

    bindPortfolioItems();
    loadPublicProducts();

    // 页面加载后自动弹出提示
    setTimeout(() => {
      if (!chatBubble.classList.contains('is-open')) {
        chatBubble.classList.add('is-open');
        // 5 秒后自动关闭，如果用户没有交互
        setTimeout(() => {
          chatBubble.classList.remove('is-open');
        }, 5000);
      }
    }, 3000);
