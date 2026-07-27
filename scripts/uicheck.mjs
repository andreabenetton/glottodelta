import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=path.resolve('public');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv=http.createServer((req,resp)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fs.existsSync(fp)){resp.writeHead(404);return resp.end();}resp.writeHead(200,{'content-type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(resp);});
await new Promise(r=>srv.listen(8794,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const pg=await b.newPage();
const errors=[];
pg.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/githubusercontent|favicon|ERR_CONNECTION|status of 404/.test(m.text()))errors.push('CONSOLE: '+m.text());});
await pg.goto('http://127.0.0.1:8794/',{waitUntil:'networkidle'}).catch(e=>errors.push('GOTO '+e.message));
await pg.waitForTimeout(1200);
const badge=await pg.evaluate(()=>document.getElementById('languageBaseBadge').textContent);
// select attested-only language and read the stats line
const stats=await pg.evaluate(()=>{
  const att=LANGUAGE_DIRECTORY.find(l=>!l.demographic&&l.iso&&l.iso!=='mis');
  const sel=document.getElementById('languageSelector');sel.value=att.key;sel.dispatchEvent(new Event('change',{bubbles:true}));
  return {name:att.name,stats:document.getElementById('selectedLanguageStats').textContent};
});
// open provenance
const prov=await pg.evaluate(()=>{document.getElementById('openProvenance').click();return null;});
await pg.waitForTimeout(600);
const provData=await pg.evaluate(()=>({
  lang:document.getElementById('provLanguageCount').textContent,
  demo:document.getElementById('provDemographicCount').textContent,
  sym:document.getElementById('provSymbolCount').textContent,
  profiles:document.getElementById('provProfileCount').textContent,
  checksum:document.getElementById('provChecksum').textContent.slice(0,16),
  clickStatus:document.getElementById('provClickStatus').textContent,
  degradedShown:!document.getElementById('provDegradedNote').hidden,
  degraded:document.getElementById('provDegradedNote').textContent.slice(0,80)
}));
console.log(JSON.stringify({badge,attestedStats:stats,provData,errors},null,1));
await b.close();srv.close();
