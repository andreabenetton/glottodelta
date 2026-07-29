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

  // M12c — Escape closes with identical cleanup (same closeDrawer path)
  await page.tap('.sym[data-symbol="m"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const escClosed = await page.evaluate(()=>({
    open: document.getElementById('drawer').classList.contains('open'),
    ariaHidden: document.getElementById('drawer').getAttribute('aria-hidden'),
    phonemeParam: new URLSearchParams(location.search).get('phoneme'),
  }));
  assert('M12c phone: Escape closes with full cleanup',
    !escClosed.open && escClosed.ariaHidden==='true' && escClosed.phonemeParam===null, escClosed);

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
  assert('desktop: no JS errors', jsErrors.length===0, jsErrors.slice(0,5));
  await context.close();
}

// ------------------------------------------------------------------------------
console.log(JSON.stringify({ checks, failures: failures.length, failed: failures }, null, 2));
await browser.close();
if(srv) srv.close();
process.exit(failures.length ? 1 : 0);
