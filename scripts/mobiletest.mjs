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

  assert('tablet: no JS errors', jsErrors.length===0, jsErrors.slice(0,5));
  await context.close();
}

// ------------------------------------------------------------------------------
console.log(JSON.stringify({ checks, failures: failures.length, failed: failures }, null, 2));
await browser.close();
if(srv) srv.close();
process.exit(failures.length ? 1 : 0);
