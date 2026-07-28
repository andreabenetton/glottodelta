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
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=path.resolve('public');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv=http.createServer((req,resp)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)){resp.writeHead(404);return resp.end('nf');}resp.writeHead(200,{'content-type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(resp);});
await new Promise(r=>srv.listen(8791,'127.0.0.1',r));
// Chromium comes from PW_CHROMIUM if set, else Playwright's own resolution.
const b=await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{});
const pg=await b.newPage();
const errors=[];
pg.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/githubusercontent|favicon|ERR_CONNECTION|404/.test(m.text()))errors.push('CONSOLE: '+m.text());});
await pg.goto('http://127.0.0.1:8791/',{waitUntil:'networkidle',timeout:60000}).catch(e=>errors.push('GOTO '+e.message));
await pg.waitForTimeout(1200);

async function selectLang(key){
  return await pg.evaluate((k)=>{
    const sel=document.getElementById('languageSelector');
    sel.value=k; sel.dispatchEvent(new Event('change',{bubbles:true}));
    const counts={present:document.querySelectorAll('.sym.lang-present').length,
      variant:document.querySelectorAll('.sym.lang-variant').length,
      attested:document.querySelectorAll('.sym.lang-attested').length,
      absent:document.querySelectorAll('.sym.lang-absent').length};
    const cov=document.querySelector('.orthography-coverage');
    return {selectedValue:sel.value, counts, coverageVisible: cov?!cov.hidden:false,
      vlevel:(document.getElementById('orthographyVerificationLevel')||{}).textContent||''};
  },key);
}
// find a demographic (kat), an attested-only, and a mis key from the page
const keys=await pg.evaluate(()=>{
  const demo=LANGUAGE_DIRECTORY.find(l=>l.iso==='kat');
  const att=LANGUAGE_DIRECTORY.find(l=>!l.demographic&&!l.curated&&l.iso&&l.iso!=='mis');
  const mis=LANGUAGE_DIRECTORY.filter(l=>l.iso==='mis').slice(0,2);
  return {demo:demo&&{key:demo.key,name:demo.name}, att:att&&{key:att.key,name:att.name,iso:att.iso},
    mis:mis.map(m=>({key:m.key,name:m.name,g:m.glottocode}))};
});

const georgian=await selectLang(keys.demo.key);
const attested=await selectLang(keys.att.key);
// two different mis languages should have DIFFERENT inventories (distinct highlight)
const mis0=await selectLang(keys.mis[0].key);
const mis1=await selectLang(keys.mis[1].key);
const misDistinct = JSON.stringify(mis0.counts)!==JSON.stringify(mis1.counts) || keys.mis.length<2;

// comparison mode: set comparison to attested-only while primary is Georgian
await selectLang(keys.demo.key);
const compare=await pg.evaluate((k)=>{
  const cs=document.getElementById('comparisonLanguageSelector');
  if(!cs) return {noCompare:true};
  cs.value=k; cs.dispatchEvent(new Event('change',{bubbles:true}));
  return {shared:document.querySelectorAll('.sym.compare-shared').length,
    onlyA:document.querySelectorAll('.sym.compare-only-a').length,
    onlyB:document.querySelectorAll('.sym.compare-only-b').length,
    // "Only differences" starts off, so nothing is suppressed; entering
    // comparison does hide the speaker meters.
    differencesOnly:document.getElementById('differencesOnly').checked,
    suppressed:document.querySelectorAll('.sym.compare-suppressed').length,
    metersHidden:document.body.classList.contains('comparison-mode')};
},keys.att.key);

// open /m/ and inspect demographic vs attested-only language rows
await pg.click('.sym[data-symbol="m"]'); await pg.waitForTimeout(300);
const drawer=await pg.evaluate(()=>{
  const rows=[...document.querySelectorAll('.list .lang')];
  const withSpk=rows.filter(r=>r.querySelector('.speaker-line')).length;
  return {rows:rows.length, rowsWithSpeakerLine:withSpk,
    dpeople:(document.getElementById('dpeople')||{}).textContent,
    dcount:(document.getElementById('dcount')||{}).textContent};
});

console.log(JSON.stringify({keys,georgian,attested,mis:{k0:keys.mis[0],k1:keys.mis[1],mis0counts:mis0.counts,mis1counts:mis1.counts,misDistinct},compare,drawer,errors},null,1));
await b.close(); srv.close();
