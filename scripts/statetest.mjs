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
// UI state-machine oracle: walks the selection/evidence/differences/URL
// transition table documented in CLAUDE.md ("UI state machine") and asserts
// every invariant. Exit code 1 on any violation.
// Usage: node scripts/statetest.mjs [url]   (defaults to a local server over public/)
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
const port = 8791;
const srv = url ? null : await serve(port);
const base = (url || `http://127.0.0.1:${port}/`).replace(/\/$/, '/');
// Chromium comes from PW_CHROMIUM if set, else Playwright's own resolution.
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
const jsErrors = [];
page.on('console', m=>{ if(m.type()==='error') jsErrors.push(m.text()); });
page.on('pageerror', e=>jsErrors.push('PAGEERROR: '+e.message));

const failures = [];
let checks = 0;
function assert(name, condition, detail){
  checks++;
  if(!condition){ failures.push(`${name}${detail!==undefined?` — got ${JSON.stringify(detail)}`:''}`); console.error('FAIL', name, detail??''); }
}

// ---- page driving helpers ----------------------------------------------------
const settle = ms => page.waitForTimeout(ms ?? 250);
const goto = async q => { await page.goto(base + (q||''), { waitUntil:'networkidle', timeout:60000 }); await settle(600); };
const snap = () => page.evaluate(() => ({
  mode: document.getElementById('evidenceFilter').value,
  lang: document.getElementById('languageSelector').value,
  compareSel: document.getElementById('comparisonLanguageSelector').value,
  diffChecked: document.getElementById('differencesOnly').checked,
  diffDisabled: document.getElementById('differencesOnly').disabled,
  comparisonMode: document.body.classList.contains('comparison-mode'),
  metersVisible: !!document.querySelector('.sym .speaker-meter')?.offsetParent,
  legendVisible: !!document.querySelector('.meter-legend')?.offsetParent,
  shared: document.querySelectorAll('.sym.compare-shared').length,
  onlyA: document.querySelectorAll('.sym.compare-only-a').length,
  onlyB: document.querySelectorAll('.sym.compare-only-b').length,
  suppressed: document.querySelectorAll('.sym.compare-suppressed').length,
  green: document.querySelectorAll('.sym.lang-present').length,
  params: Object.fromEntries(new URLSearchParams(location.search)),
}));
const pickPrimary = async key => { await page.evaluate(k=>{const s=document.getElementById('languageSelector');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},key); await settle(); };
const pickComparison = async key => { await page.evaluate(k=>{const s=document.getElementById('comparisonLanguageSelector');s.value=k;s.dispatchEvent(new Event('change',{bubbles:true}));},key); await settle(); };
const pickEvidence = async mode => { await page.selectOption('#evidenceFilter', mode); await settle(); };

// ================================================================== the walk ==
await goto('');

// T1 — pristine S0
let s = await snap();
assert('T1 S0 evidence=all', s.mode==='all', s.mode);
assert('T1 S0 meters visible', s.metersVisible && s.legendVisible, s);
assert('T1 S0 differences off+disabled', !s.diffChecked && s.diffDisabled, s);
assert('T1 S0 URL empty', Object.keys(s.params).length===0, s.params);

// T2 — select primary -> S1, auto default population, URL carries lang only
await pickPrimary('kat');
s = await snap();
assert('T2 S1 evidence=population', s.mode==='population', s.mode);
assert('T2 S1 meters visible', s.metersVisible, s);
assert('T2 S1 URL lang only', s.params.lang==='kat' && !('evidence' in s.params), s.params);

// T3 — add comparison -> S2, default stays population, meters hidden
await pickComparison('ita');
s = await snap();
assert('T3 S2 evidence=population', s.mode==='population', s.mode);
assert('T3 S2 comparison-mode class', s.comparisonMode, s);
assert('T3 S2 meters hidden', !s.metersVisible && !s.legendVisible, s);
assert('T3 S2 shared>0 and onlyB>0', s.shared>0 && s.onlyB>0, {shared:s.shared,onlyB:s.onlyB});
assert('T3 S2 URL lang+compare, no evidence', s.params.lang==='kat' && s.params.compare==='ita' && !('evidence' in s.params), s.params);
assert('T3 S2 differences enabled, off', !s.diffChecked && !s.diffDisabled, s);

// T4 — clear comparison -> back to S1 defaults
await page.click('#clearComparisonLanguage'); await settle();
s = await snap();
assert('T4 S1 evidence back to population', s.mode==='population', s.mode);
assert('T4 S1 meters back', s.metersVisible && !s.comparisonMode, s);
assert('T4 S1 differences reset+disabled', !s.diffChecked && s.diffDisabled, s);
assert('T4 S1 URL compare gone', !('compare' in s.params), s.params);

// T5 — explicit choice sticks across primary switch and is serialized
await pickEvidence('mapped');
await pickPrimary('deu');
s = await snap();
assert('T5 explicit mapped survives switch', s.mode==='mapped', s.mode);
assert('T5 URL evidence=mapped', s.params.evidence==='mapped', s.params);

// T6 — explicit 'all' override round-trips through the URL
await pickEvidence('all');
s = await snap();
assert('T6 URL evidence=all serialized', s.params.evidence==='all', s.params);
await goto('?'+new URLSearchParams(s.params).toString());
s = await snap();
assert('T6 restore keeps explicit all (not population)', s.mode==='all' && s.params.lang==='deu', {mode:s.mode,params:s.params});

// T7 — Clear primary is a full reset; auto-defaults re-arm
await pickEvidence('mapped');
await page.click('#clearLanguage'); await settle();
s = await snap();
assert('T7 S0 after clear: evidence=all', s.mode==='all', s.mode);
assert('T7 S0 after clear: URL empty', Object.keys(s.params).length===0, s.params);
await pickPrimary('kat');
s = await snap();
assert('T7 re-select re-arms population default', s.mode==='population', s.mode);

// T8 — URL restore of a comparison incl. differences and a mis-coded language
const misKey = await page.evaluate(()=>LANGUAGE_DIRECTORY.find(l=>l.key.startsWith('g:'))?.key);
assert('T8 found a mis-coded language', !!misKey, misKey);
if(misKey){
  await goto(`?lang=kat&compare=${encodeURIComponent(misKey)}&differences=1`);
  s = await snap();
  assert('T8 restore differences on', s.diffChecked && !s.diffDisabled, s);
  assert('T8 restore S2 evidence=population', s.mode==='population', s.mode);
  assert('T8 restore selector uses langKey', s.compareSel===misKey, s.compareSel);
  assert('T8 restore comparison-mode + suppression', s.comparisonMode && s.suppressed>0, {cm:s.comparisonMode,sup:s.suppressed});
}

// T9 — default S1 link derives population; Clear returns to all
await goto('?lang=kat');
s = await snap();
assert('T9 lang-only link derives population', s.mode==='population', s.mode);
assert('T9 lang-only link URL stays clean of evidence', !('evidence' in s.params), s.params);
await page.click('#clearLanguage'); await settle();
s = await snap();
assert('T9 clear returns to all', s.mode==='all', s.mode);

// T10 — curated historical language (Latin) is fully usable but stats-neutral
await goto('');
const mBefore = await page.evaluate(()=>[...document.querySelectorAll('.sym[data-symbol]')].find(x=>x.dataset.symbol==='m')?.querySelector('.language-count')?.textContent);
await pickPrimary('lat');
s = await snap();
let lat = await page.evaluate(()=>({
  selected: document.getElementById('selectedLanguageLabel').textContent,
  stats: document.getElementById('selectedLanguageStats').textContent,
  green: document.querySelectorAll('.sym.lang-present').length,
  amber: document.querySelectorAll('.sym.lang-variant').length,
  blue: document.querySelectorAll('.sym.lang-attested').length,
  mCount: [...document.querySelectorAll('.sym[data-symbol]')].find(x=>x.dataset.symbol==='m')?.querySelector('.language-count')?.textContent,
  inDirectory: LANGUAGE_DIRECTORY.some(l=>l.iso==='lat'&&l.curated),
  notInSymbolLangs: !LANGUAGE_SYMBOLS.has('lat'),
}));
assert('T10 Latin selectable', lat.selected==='Latin (late Roman Republic)', lat.selected);
assert('T10 Latin S1 default population', s.mode==='population', s.mode);
assert('T10 Latin green tiles from model', lat.green>=20, lat.green);
assert('T10 Latin amber (ŋ realization of n)', lat.amber>=1, lat.amber);
assert('T10 Latin has no blue (no PHOIBLE attestation)', lat.blue===0, lat.blue);
assert('T10 Latin absent from SYMBOL_LANGS', lat.inDirectory && lat.notInSymbolLangs, lat);
assert('T10 L counts untouched while Latin selected', lat.mCount===mBefore, {before:mBefore,after:lat.mCount});
assert('T10 Latin stats line says historical, excluded', /historical/.test(lat.stats)&&/excluded from L and P/.test(lat.stats), lat.stats);
// comparison with a living language + URL round-trip
await pickComparison('ita');
s = await snap();
assert('T10 Latin↔Italian comparison works', s.comparisonMode && s.shared>0, {cm:s.comparisonMode,shared:s.shared});
await goto('?lang=lat');
lat = await page.evaluate(()=>({sel:document.getElementById('languageSelector').value, green:document.querySelectorAll('.sym.lang-present').length}));
assert('T10 lang=lat link restores', lat.sel==='lat' && lat.green>=20, lat);

// ------------------------------------------------------------------------------
assert('no JS errors', jsErrors.length===0, jsErrors.slice(0,5));
console.log(JSON.stringify({ checks, failures: failures.length, failed: failures }, null, 2));
await browser.close();
if(srv) srv.close();
process.exit(failures.length ? 1 : 0);
