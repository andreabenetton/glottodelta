/*
   Glottodelta — demographically weighted distribution of IPA symbols.
   Copyright (C) 2026 Andrea Benetton

   This program is free software: you can redistribute it and/or modify it under
   the terms of the GNU Affero General Public License as published by the Free
   Software Foundation, either version 3 of the License, or (at your option) any
   later version. This program is distributed WITHOUT ANY WARRANTY; without even
   the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
   See the GNU Affero General Public License <https://www.gnu.org/licenses/> and
   the LICENSE file distributed with this program for details.
*/
// Mobile/tablet regression oracle: drives the app in phone (390×844, touch)
// and tablet (768×1024, touch) emulation and asserts the responsive-layout
// invariants. Exit code 1 on any violation.
// Usage: node scripts/mobiletest.mjs [url]   (defaults to a local server over public/)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('public');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml' };
function serve(port){
  return new Promise(res=>{
    const srv = http.createServer((req,resp)=>{
      let p = decodeURIComponent(req.url.split('?')[0]);
      if(p==='/') p='/index.html';
      const fp = path.join(ROOT, p);
      if(!fp.startsWith(ROOT) || !fs.existsSync(fp)){ resp.writeHead(404); return resp.end('nf'); }
      resp.writeHead(200,{'content-type':MIME[path.extname(fp)]||'application/octet-stream'});
      fs.createReadStream(fp).pipe(resp);
    });
    srv.listen(port,'127.0.0.1',()=>res(srv));
  });
}

const url = process.argv[2] || null;
const port = 8794;
const srv = url ? null : await serve(port);
const base = (url || `http://127.0.0.1:${port}/`).replace(/\/$/, '/');
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

const failures = [];
let checks = 0;
function assert(name, condition, detail){
  checks++;
  if(!condition){ failures.push(`${name}${detail!==undefined?` — got ${JSON.stringify(detail)}`:''}`); console.error('FAIL', name, detail??''); }
}

const PHONE = { viewport:{width:390,height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:3 };
const TABLET = { viewport:{width:768,height:1024}, hasTouch:true, deviceScaleFactor:2 };

async function open(ctxOpts, query){
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  const jsErrors = [];
  page.on('console', m=>{ if(m.type()==='error') jsErrors.push(m.text()); });
  page.on('pageerror', e=>jsErrors.push('PAGEERROR: '+e.message));
  await page.goto(base + (query||''), { waitUntil:'networkidle', timeout:60000 });
  await page.waitForTimeout(600);
  return { context, page, jsErrors };
}

let phoneKatGreen = -1; // classification parity: phone list layout vs desktop grid

// =========================================================== phone (390×844) ==
{
  const { context, page, jsErrors } = await open(PHONE);

  // M1 — no page-level horizontal overflow (charts scroll inside .table-wrap)
  const overflow = await page.evaluate(()=>({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    wrapOwnsChart: [...document.querySelectorAll('.table-wrap')]
      .every(w=>w.scrollWidth>=w.clientWidth),
  }));
  assert('M1 phone: no page-level horizontal overflow',
    overflow.scrollWidth <= overflow.innerWidth + 1, overflow);
  assert('M1 phone: .table-wrap owns chart overflow', overflow.wrapOwnsChart, overflow);

  // M2 — the 111 symbol tiles exist exactly once each (no DOM duplication)
  const tiles = await page.evaluate(()=>{
    const syms=[...document.querySelectorAll('.sym[data-symbol]')].map(b=>b.dataset.symbol);
    return { count: syms.length, unique: new Set(syms).size };
  });
  assert('M2 phone: 111 unique symbol tiles', tiles.count===111 && tiles.unique===111, tiles);

  // M3/M4 — linearized list: charts fit the viewport, every tile visible and
  // ≥44px, empty cells collapse, occupied pulmonic cells show their place label
  const list = await page.evaluate(()=>{
    const visSyms=[...document.querySelectorAll('.sym[data-symbol]')].filter(b=>b.offsetParent!==null);
    const small=visSyms.filter(b=>{const r=b.getBoundingClientRect();return r.width<44||r.height<44;});
    const tds=[...document.querySelectorAll('.pulmonic-table td[data-place]:not(.empty-place)')];
    const badBefore=tds.filter(td=>!getComputedStyle(td,'::before').content.includes(td.dataset.place));
    return {pulW:Math.round(document.querySelector('.pulmonic-table').getBoundingClientRect().width),
            vowW:Math.round(document.querySelector('.ipa-vowel-grid').getBoundingClientRect().width),
            visCount:visSyms.length, smallCount:small.length,
            emptyHidden:getComputedStyle(document.querySelector('.pulmonic-table td.empty-place')).display,
            badBeforeCount:badBefore.length,
            toggleVisible:!!document.getElementById('chartLayoutToggle').offsetParent};
  });
  assert('M3 phone: linearized charts fit viewport', list.pulW<=390 && list.vowW<=390, list);
  assert('M3 phone: all 111 tiles visible in list mode', list.visCount===111, list);
  assert('M3 phone: every tile ≥44×44', list.smallCount===0, list);
  assert('M4 phone: empty cells collapsed', list.emptyHidden==='none', list);
  assert('M4 phone: occupied cells labelled with their place', list.badBeforeCount===0, list);
  assert('M4 phone: layout toggle visible', list.toggleVisible, list);

  // M8 — grid toggle restores the scrollable matrix; classification parity vs desktop
  const grid = await page.evaluate(()=>{
    document.getElementById('chartLayoutToggle').click();
    const w=Math.round(document.querySelector('.pulmonic-table').getBoundingClientRect().width);
    const pageW=document.documentElement.scrollWidth;
    document.getElementById('chartLayoutToggle').click();
    return {w, pageW, backToList:!document.body.classList.contains('chart-grid-view')};
  });
  assert('M8 phone: toggle restores compressed grid inside scroller',
    grid.w>1000 && grid.pageW<=391 && grid.backToList, grid);
  phoneKatGreen = await page.evaluate(()=>{
    const s=document.getElementById('languageSelector');s.value='kat';s.dispatchEvent(new Event('change',{bubbles:true}));
    return document.querySelectorAll('.sym.lang-present').length;
  });
  await page.evaluate(()=>document.getElementById('clearLanguage').click());
  await page.waitForTimeout(200);

  // M7 — tapping /m/ opens the drawer with the L oracle count
  await page.tap('.sym[data-symbol="m"]');
  await page.waitForTimeout(400);
  const drawer = await page.evaluate(()=>({
    open: document.getElementById('drawer').classList.contains('open'),
    dcount: document.getElementById('dcount').textContent,
  }));
  assert('M7 phone: tap /m/ opens drawer', drawer.open, drawer);
  assert('M7 phone: /m/ L count 2058', drawer.dcount==='2058', drawer.dcount);

  // M13 — the close button is a ≥44px touch target
  const closeBox = await page.evaluate(()=>{
    const r=document.getElementById('close').getBoundingClientRect();
    return {w:Math.round(r.width), h:Math.round(r.height)};
  });
  assert('M13 phone: close button ≥44×44', closeBox.w>=44 && closeBox.h>=44, closeBox);

  // M12a — body scroll is locked while the drawer is open, released on close
  const lock = await page.evaluate(()=>getComputedStyle(document.body).overflow);
  assert('M12a phone: body scroll locked while drawer open', lock==='hidden', lock);

  // M12b — Close button closes the drawer and cleans up state
  // (On a phone the drawer is 100% width, so the backdrop is fully covered —
  //  the backdrop-tap path is exercised in the tablet context below.)
  await page.tap('#close');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(()=>({
    open: document.getElementById('drawer').classList.contains('open'),
    ariaHidden: document.getElementById('drawer').getAttribute('aria-hidden'),
    phonemeParam: new URLSearchParams(location.search).get('phoneme'),
    bodyOverflow: getComputedStyle(document.body).overflow,
  }));
  assert('M12b phone: Close button closes drawer', !closed.open, closed);
  assert('M12b phone: aria-hidden restored', closed.ariaHidden==='true', closed);
  assert('M12b phone: phoneme= removed from URL', closed.phonemeParam===null, closed);
  assert('M12b phone: body scroll released', closed.bodyOverflow!=='hidden', closed);

  // M9/M10/M11 — the "at a glance" strip carries what the tooltips carry
  await page.tap('.sym[data-symbol="m"]');
  await page.waitForTimeout(300);
  const glance = await page.evaluate(()=>document.getElementById('symbolGlance').textContent);
  assert('M9 phone: glance shows L 2058 for /m/', /L 2058 source-attested languages/.test(glance), glance);
  assert('M9 phone: glance shows P 7.85B', /P 7\.85B from \d+ green\/amber/.test(glance), glance);
  assert('M9 phone: glance shows speaker magnitude', /magnitude/i.test(glance), glance);
  const s1 = await page.evaluate(()=>{
    const s=document.getElementById('languageSelector');s.value='kat';s.dispatchEvent(new Event('change',{bubbles:true}));
    const shown=document.querySelector('#symbolGlance .glance-language').textContent;
    const r=languageSymbolState(selectedLanguage,'m',LANGUAGE_SYMBOLS.get(langKey(selectedLanguage))||new Set());
    return {shown, expectBadge:evidenceBadgeLabel(r.state), expectTitle:mappingTitle(selectedLanguage,r,'m')};
  });
  assert('M10 phone: S1 glance equals badge + mappingTitle verbatim',
    s1.shown===`${s1.expectBadge} ${s1.expectTitle}`, s1);
  const s2 = await page.evaluate(()=>{
    const c=document.getElementById('comparisonLanguageSelector');c.value='ita';c.dispatchEvent(new Event('change',{bubbles:true}));
    return {shown:document.querySelector('#symbolGlance .glance-language').textContent,
            meterHidden:!document.querySelector('#symbolGlance .speaker-meter')?.offsetParent};
  });
  assert('M11 phone: S2 glance names both languages and the filter',
    /KAT \(Georgian\):/.test(s2.shown) && /ITA \(Italian\):/.test(s2.shown) && /Evidence filter:/.test(s2.shown), s2);
  assert('M11 phone: glance meter hidden in comparison mode', s2.meterHidden, s2);
  await page.evaluate(()=>{document.getElementById('clearLanguage').click();});
  await page.waitForTimeout(200);
  const s0 = await page.evaluate(()=>({
    glance:document.getElementById('symbolGlance').textContent,
    hasLangLine:!!document.querySelector('#symbolGlance .glance-language'),
  }));
  assert('M9 phone: clear primary returns glance to symbol-only', /L 2058/.test(s0.glance) && !s0.hasLangLine, s0);

  // M12c — Escape closes with identical cleanup (same closeDrawer path);
  // the drawer is still open on /m/ from the glance checks above
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const escClosed = await page.evaluate(()=>({
    open: document.getElementById('drawer').classList.contains('open'),
    ariaHidden: document.getElementById('drawer').getAttribute('aria-hidden'),
    phonemeParam: new URLSearchParams(location.search).get('phoneme'),
  }));
  assert('M12c phone: Escape closes with full cleanup',
    !escClosed.open && escClosed.ariaHidden==='true' && escClosed.phonemeParam===null, escClosed);

  // M15 — secondary tools start collapsed on phones; summary is a 44px target
  const tools = await page.evaluate(()=>{
    const d=document.getElementById('secondaryTools');
    const s=d.querySelector('summary');
    const sr=s.getBoundingClientRect();
    const closed=!d.hasAttribute('open') && Math.round(d.getBoundingClientRect().height)<80;
    d.setAttribute('open','');
    const share=document.getElementById('copyShareLink').getBoundingClientRect();
    const checkbox=document.getElementById('highContrastToggle').getBoundingClientRect();
    d.removeAttribute('open');
    return {closed, summaryH:Math.round(sr.height),
            shareH:Math.round(share.height), checkboxW:Math.round(checkbox.width),
            evidenceFont:parseFloat(getComputedStyle(document.getElementById('evidenceFilter')).fontSize)};
  });
  assert('M15 phone: secondary tools collapsed at load', tools.closed, tools);
  assert('M15 phone: summary ≥44px tall', tools.summaryH>=44, tools);
  assert('M15 phone: export buttons ≥44px', tools.shareH>=44, tools);
  assert('M15 phone: accessibility checkboxes ≥22px', tools.checkboxW>=22, tools);
  assert('M15 phone: evidence select ≥16px font (no iOS focus zoom)', tools.evidenceFont>=16, tools);

  // M16 — drawer tap targets: audit filter chips and audio play buttons
  await page.tap('.sym[data-symbol="m"]');
  await page.waitForTimeout(300);
  const drawerTargets = await page.evaluate(()=>{
    const chip=document.querySelector('.audit-filter').getBoundingClientRect();
    const play=document.querySelector('.audio-play')?.getBoundingClientRect();
    return {chipH:Math.round(chip.height), playW:play?Math.round(play.width):null, playH:play?Math.round(play.height):null};
  });
  assert('M16 phone: audit filter chips ≥44px', drawerTargets.chipH>=44, drawerTargets);
  assert('M16 phone: audio play buttons ≥44×44', drawerTargets.playW>=44 && drawerTargets.playH>=44, drawerTargets);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  assert('phone: no JS errors', jsErrors.length===0, jsErrors.slice(0,5));
  await context.close();
}

// ========================================================= tablet (768×1024) ==
{
  const { context, page, jsErrors } = await open(TABLET);

  const overflow = await page.evaluate(()=>({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert('M1 tablet: no page-level horizontal overflow',
    overflow.scrollWidth <= overflow.innerWidth + 1, overflow);

  await page.tap('.sym[data-symbol="m"]');
  await page.waitForTimeout(400);
  const drawer = await page.evaluate(()=>({
    open: document.getElementById('drawer').classList.contains('open'),
    dcount: document.getElementById('dcount').textContent,
  }));
  assert('M7 tablet: tap /m/ opens drawer', drawer.open, drawer);
  assert('M7 tablet: /m/ L count 2058', drawer.dcount==='2058', drawer.dcount);

  // M12d — the drawer (520px) leaves the backdrop visible beside it at 768px;
  // tapping it closes the drawer with full cleanup
  await page.tap('#drawerBackdrop', { position: { x: 40, y: 400 } });
  await page.waitForTimeout(300);
  const closed = await page.evaluate(()=>({
    open: document.getElementById('drawer').classList.contains('open'),
    ariaHidden: document.getElementById('drawer').getAttribute('aria-hidden'),
    phonemeParam: new URLSearchParams(location.search).get('phoneme'),
  }));
  assert('M12d tablet: backdrop tap closes drawer with cleanup',
    !closed.open && closed.ariaHidden==='true' && closed.phonemeParam===null, closed);

  // M17 — container queries: the 520px drawer keeps multi-column grids on a
  // 768px tablet, and the drawer body never scrolls horizontally
  await page.tap('.sym[data-symbol="m"]');
  await page.waitForTimeout(300);
  const cq = await page.evaluate(()=>{
    const body=document.getElementById('drawerBody');
    const cols=sel=>getComputedStyle(document.querySelector(sel)).gridTemplateColumns.split(' ').length;
    return {noHScroll: body.scrollWidth<=body.clientWidth+1,
            drawerW: Math.round(document.getElementById('drawer').getBoundingClientRect().width),
            auditCols: cols('.audit-summary'), qualityCols: cols('.quality-grid'),
            statsCols: cols('.stats')};
  });
  assert('M17 tablet: drawer body has no horizontal scroll', cq.noHScroll, cq);
  assert('M17 tablet: 520px drawer keeps 3-col audit summary', cq.drawerW===520 && cq.auditCols===3, cq);
  assert('M17 tablet: 520px drawer keeps 2-col quality grid', cq.qualityCols===2, cq);
  assert('M17 tablet: stats grid multi-column at 520px', cq.statsCols>=2, cq);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // M5 — the compressed tablet tier is live and the width follows the vars
  const geom = await page.evaluate(()=>{
    const t=document.querySelector('.pulmonic-table');
    const cs=getComputedStyle(document.documentElement);
    const manner=parseFloat(cs.getPropertyValue('--pulmonic-manner-width'));
    const col=parseFloat(cs.getPropertyValue('--pulmonic-column-width'));
    return {w:Math.round(t.getBoundingClientRect().width), expected:Math.round(manner+11*col),
            vowelW:Math.round(document.querySelector('.ipa-vowel-grid').getBoundingClientRect().width)};
  });
  assert('M5 tablet: pulmonic width follows the vars', Math.abs(geom.w-geom.expected)<=2, geom);
  assert('M5 tablet: pulmonic compressed below 1750px', geom.w<1750, geom);
  assert('M5 tablet: vowel grid compressed below 900px', geom.vowelW<900, geom);

  // M6 — two-axis sticky: after scrolling the wrap, the header row and the
  // manner column still hug the wrap's top/left edges
  const sticky = await page.evaluate(()=>{
    const wrap=document.querySelector('.table-wrap');
    wrap.scrollLeft=600;
    const wrapR=wrap.getBoundingClientRect();
    const headTh=document.querySelector('.pulmonic-table thead th:nth-child(2)');
    const headCs=getComputedStyle(headTh);
    const rowR=document.querySelector('.pulmonic-table tbody th').getBoundingClientRect();
    return {scrolledL:wrap.scrollLeft,
            headPosition:headCs.position, headTop:headCs.top,
            verticalScroller:/(auto|scroll)/.test(getComputedStyle(wrap).overflowY) && getComputedStyle(wrap).maxHeight!=='none',
            rowLeftDelta:Math.round(rowR.left-wrapR.left)};
  });
  // (At 768×1024 the compressed table fits the wrap's max-height, so vertical
  //  scrolling may not engage — assert the sticky machinery instead.)
  assert('M6 tablet: header row is top-sticky inside a capped scroller',
    sticky.headPosition==='sticky' && sticky.headTop==='0px' && sticky.verticalScroller, sticky);
  assert('M6 tablet: manner column sticks to wrap left', sticky.scrolledL>0 && sticky.rowLeftDelta>=0 && sticky.rowLeftDelta<12, sticky);

  // scroll hint visible on tablet
  const hint = await page.evaluate(()=>getComputedStyle(document.querySelector('.table-scroll-hint')).display);
  assert('M5 tablet: scroll hint visible', hint==='block', hint);

  assert('tablet: no JS errors', jsErrors.length===0, jsErrors.slice(0,5));
  await context.close();
}

// ================================================== desktop identity (1280) ==
{
  const { context, page, jsErrors } = await open({ viewport:{width:1280,height:720} });
  const geom = await page.evaluate(()=>({
    pulmonicW: Math.round(document.querySelector('.pulmonic-table').getBoundingClientRect().width),
    meterVisible: !!document.querySelector('.sym .speaker-meter')?.offsetParent,
    hint: getComputedStyle(document.querySelector('.table-scroll-hint')).display,
  }));
  assert('D1 desktop: pulmonic width identity 2415', geom.pulmonicW===2415, geom);
  assert('D1 desktop: speaker meters visible', geom.meterVisible, geom);
  assert('D1 desktop: scroll hint hidden', geom.hint==='none', geom);
  const layout = await page.evaluate(()=>({
    toggleHidden: !document.getElementById('chartLayoutToggle').offsetParent,
    katGreen: (()=>{const s=document.getElementById('languageSelector');s.value='kat';s.dispatchEvent(new Event('change',{bubbles:true}));return document.querySelectorAll('.sym.lang-present').length;})(),
  }));
  assert('D1 desktop: layout toggle hidden', layout.toggleHidden, layout);
  assert('M8 desktop: kat classification parity with phone list layout',
    phoneKatGreen>0 && layout.katGreen===phoneKatGreen, {desktop:layout.katGreen, phone:phoneKatGreen});
  assert('desktop: no JS errors', jsErrors.length===0, jsErrors.slice(0,5));
  await context.close();
}

// ------------------------------------------------------------------------------
console.log(JSON.stringify({ checks, failures: failures.length, failed: failures }, null, 2));
await browser.close();
if(srv) srv.close();
process.exit(failures.length ? 1 : 0);
