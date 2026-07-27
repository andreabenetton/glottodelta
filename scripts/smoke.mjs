// Regression oracle: load the app in headless Chromium, extract key invariants.
// Usage: node scripts/smoke.mjs [url]   (defaults to http://127.0.0.1:8788/)
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
const port = 8788;
const srv = url ? null : await serve(port);
const target = url || `http://127.0.0.1:${port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
const errors = [];
page.on('console', m=>{ if(m.type()==='error') errors.push(m.text()); });
page.on('pageerror', e=>errors.push('PAGEERROR: '+e.message));

await page.goto(target, { waitUntil:'networkidle', timeout:60000 }).catch(e=>errors.push('GOTO: '+e.message));
await page.waitForTimeout(1500);

const R = await page.evaluate(()=>{
  const q = s=>document.querySelectorAll(s);
  const symBtns = q('.sym[data-symbol]');
  // language picker options
  const primary = document.getElementById('primaryLanguage') || document.querySelector('select');
  const opt = primary ? primary.querySelectorAll('option').length : -1;
  // gather L/P text from a few known symbols
  const grab = sym=>{
    const b=[...symBtns].find(x=>x.dataset.symbol===sym);
    if(!b) return null;
    return { L:(b.querySelector('.language-count')||{}).textContent, P:(b.querySelector('.speaker-count')||{}).textContent };
  };
  return {
    title: document.title,
    symbolButtons: symBtns.length,
    pickerOptions: opt,
    m: grab('m'), i: grab('i'), k: grab('k'), p: grab('p'), a: grab('a'),
    hasDrawer: !!document.querySelector('.drawer'),
    hasProvenance: !!document.getElementById('provenanceDialog') || /provenance/i.test(document.body.innerHTML),
  };
});

// open a symbol drawer
let drawer = {};
try {
  await page.click('.sym[data-symbol="m"]');
  await page.waitForTimeout(400);
  drawer = await page.evaluate(()=>({
    open: !!document.querySelector('.drawer.open'),
    dcount: (document.getElementById('dcount')||{}).textContent,
    dpeople: (document.getElementById('dpeople')||{}).textContent,
    langRows: document.querySelectorAll('.list .lang').length,
  }));
} catch(e){ drawer.error = e.message; }

console.log(JSON.stringify({ result:R, drawer, errors: errors.slice(0,20), errorCount: errors.length }, null, 2));
await browser.close();
if(srv) srv.close();
