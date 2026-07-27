import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=path.resolve('public');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv=http.createServer((req,resp)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fs.existsSync(fp)){resp.writeHead(404);return resp.end();}resp.writeHead(200,{'content-type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(resp);});
await new Promise(r=>srv.listen(8793,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const pg=await b.newPage();
await pg.goto('http://127.0.0.1:8793/',{waitUntil:'networkidle'}).catch(()=>{});
await pg.waitForTimeout(1000);
await pg.click('.sym[data-symbol="m"]'); await pg.waitForTimeout(400);
const r=await pg.evaluate(()=>{
  const rows=[...document.querySelectorAll('.list .lang')];
  const demoRow=rows.find(r=>/Estimated speakers/.test(r.textContent));
  const attRow=rows.find(r=>/No population estimate/.test(r.textContent));
  const clean=t=>t.replace(/\s+/g,' ').trim().slice(0,200);
  return {total:rows.length,
    demoSample:demoRow?clean(demoRow.textContent):null,
    attSample:attRow?clean(attRow.textContent):null,
    withEstimate:rows.filter(r=>/Estimated speakers/.test(r.textContent)).length,
    withNoPop:rows.filter(r=>/No population estimate/.test(r.textContent)).length};
});
console.log(JSON.stringify(r,null,1));
await b.close();srv.close();
