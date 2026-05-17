/* ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   CONTROL CENTER Â· system.js
   Shared SVG <defs>, icon set (Lucide-style line), nav renderer.
   ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

(function(){

  // ââ Lucide-style line icons. Stroke 1.7, currentColor. ââ
  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    workouts:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16"/><path d="M18 4v16"/><path d="M3 8v8"/><path d="M21 8v8"/><path d="M6 12h12"/></svg>',
    news:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"/><path d="M8 7h7"/><path d="M8 11h7"/><path d="M8 15h4"/></svg>',
    checklist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7 2 2 4-4"/><path d="m3 14 2 2 4-4"/><path d="M13 7h8"/><path d="M13 14h8"/><path d="M13 21h8"/><path d="m3 21 2 2 4-4"/></svg>',
    words:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>',
    library:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v14"/><path d="M4 19a2 2 0 0 0 2 2h13"/><path d="M8 7v8"/></svg>',
    mood:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M9 15c1 1 2 1.5 3 1.5s2-.5 3-1.5"/></svg>',
    sleep:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/></svg>',
    finance:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 4 8-8"/><path d="M14 8h7v7"/></svg>',
    journal:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
    search:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    plus:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    play:      '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>',
    flame:     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s4 4 4 9a4 4 0 1 1-8 0c0-2 1-3 1-3s-1 5 3 5c2 0 3-2 3-4 0-3-3-7-3-7z"/></svg>',
    check:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8 7 12 13 4"/></svg>',
    chevR:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    chevL:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    chevD:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    refresh:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
    edit:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    drag:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6" r="0.6" fill="currentColor"/><circle cx="9" cy="12" r="0.6" fill="currentColor"/><circle cx="9" cy="18" r="0.6" fill="currentColor"/><circle cx="15" cy="6" r="0.6" fill="currentColor"/><circle cx="15" cy="12" r="0.6" fill="currentColor"/><circle cx="15" cy="18" r="0.6" fill="currentColor"/></svg>',
    upload:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    book:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    volume:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>',
    x:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    arrowR:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    arrowUp:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg>',
    history:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/><polyline points="12 7 12 12 16 14"/></svg>',
    timer:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/></svg>',
    zoomIn:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    zoomOut:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    notes:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
    focus:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 4 4 8 4"/><polyline points="16 4 20 4 20 8"/><polyline points="20 16 20 20 16 20"/><polyline points="8 20 4 20 4 16"/></svg>',
  };

  // ââ Nav definition: order, label, key, href ââ
  const NAV = [
    { k:'dashboard', label:'Dashboard', href:'../Dashboard â V2 Ambient Futurism.html' },
    { k:'workouts',  label:'Workouts',  href:'workouts.html' },
    { k:'news',      label:'News',      href:'news.html' },
    { k:'checklist', label:'Checklist', href:'checklist.html' },
    { k:'words',     label:'Words',     href:'words.html' },
    { k:'library',   label:'Library',   href:'library.html' },
    { k:'mood',      label:'Mood',      href:'mood.html' },
    { k:'sleep',     label:'Sleep',     href:'sleep.html' },
    { k:'finance',   label:'Finance',   href:'finance.html' },
    { k:'journal',   label:'Journal',   href:'journal.html' },
  ];

  function svg(key){ return ICONS[key] || ''; }

  // Inject SVG <defs> for shared gradients
  function injectDefs(){
    if(document.getElementById('cc-defs')) return;
    const wrap = document.createElement('div');
    wrap.id = 'cc-defs';
    wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    wrap.innerHTML = `<svg width="0" height="0"><defs>
      <linearGradient id="ccGradStroke" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#B388FF"/>
        <stop offset="100%" stop-color="#7EE7FF"/>
      </linearGradient>
      <linearGradient id="ccGradFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(179,136,255,0.18)"/>
        <stop offset="100%" stop-color="rgba(179,136,255,0)"/>
      </linearGradient>
      <linearGradient id="ccGradFillCyan" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(126,231,255,0.20)"/>
        <stop offset="100%" stop-color="rgba(126,231,255,0)"/>
      </linearGradient>
      <linearGradient id="ccRingGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#B388FF"/>
        <stop offset="100%" stop-color="#7EE7FF"/>
      </linearGradient>
    </defs></svg>`;
    document.body.appendChild(wrap);
  }

  // Render the desktop top nav into [data-cc-nav]
  function renderTopNav(){
    document.querySelectorAll('[data-cc-nav]').forEach(el=>{
      const cur = el.getAttribute('data-cc-nav');
      const dateStr = el.getAttribute('data-date') || 'Wed Â· May 13 Â· 2026';
      el.innerHTML = `
        <div class="brand"><span class="dot"></span>Control Center</div>
        <nav class="nav">
          ${NAV.map(n => `<a href="${n.href}" class="${n.k===cur?'cur':''}">${svg(n.k)}<span>${n.label}</span></a>`).join('')}
        </nav>
        <div class="right">
          <span class="cc-pill"><span class="pulse"></span>Synced</span>
          <span style="font-size:12px;color:var(--ink-3);letter-spacing:0.02em">${dateStr}</span>
          <span class="cc-kbd">âK</span>
          <div class="cc-avatar">A</div>
        </div>`;
    });
  }

  // Render the mobile bottom nav into [data-cc-mob-nav]
  function renderMobNav(){
    document.querySelectorAll('[data-cc-mob-nav]').forEach(el=>{
      const cur = el.getAttribute('data-cc-mob-nav');
      // Just 5 most-used: dashboard, workouts, checklist, journal, words
      const items = ['dashboard','workouts','checklist','journal','words']
        .map(k => NAV.find(n=>n.k===k));
      el.innerHTML = items.map(n => `<a href="${n.href}" class="${n.k===cur?'cur':''}">${svg(n.k)}<span>${n.label}</span></a>`).join('');
    });
  }

  // Inline svg replacement for [data-icon="key"] hooks
  function injectIcons(){
    document.querySelectorAll('[data-icon]').forEach(el=>{
      const key = el.getAttribute('data-icon');
      const s = ICONS[key];
      if(s) el.innerHTML = s;
    });
  }

  // Init when DOM ready
  function init(){
    injectDefs();
    renderTopNav();
    renderMobNav();
    injectIcons();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Expose
  window.CC = { icons: ICONS, svg, NAV, init };
})();
