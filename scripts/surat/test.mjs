import {chromium as pw} from 'playwright-core';
import chromium,{inflate} from '@sparticuz/chromium';
import {join} from 'node:path';import {tmpdir} from 'node:os';import assert from 'node:assert/strict';
const executablePath=await chromium.executablePath();await inflate(join(process.cwd(),'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
const browser=await pw.launch({executablePath,args:chromium.args,headless:true,env:{...process.env,LD_LIBRARY_PATH:join(tmpdir(),'al2023','lib')}});
try{
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`
window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:window.mockSession?{user:{id:'u',email:'a@example.com'}}:null}})},from:(table)=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>Promise.resolve({data:window.mockSigner?{user_id:'u'}:null}),then:(f)=>Promise.resolve({data:table==='admin_profiles'?[{role:'registrar'}]:[{id:'doc',number:'001/TEST',subject:'<img src=x onerror=alert(1)>',recipient:'Admin',letter_date:'2026-10-31',status:'pending'}]}).then(f)};return q},rpc:async()=>({data:[{number:'001/TEST',status:'revoked',letter_date:'2026-10-31',signer_name:'Ketua',decided_at:'2026-10-31',final_sha256:'abc'}]})})};` }));
await page.goto('http://127.0.0.1:3000/surat.html');await page.waitForSelector('#login-form');assert.equal(await page.locator('#app').isVisible(),false);
await page.addInitScript(()=>{window.mockSession=true;window.mockSigner=false;});
await page.reload();await page.waitForSelector('#list article');assert.equal(await page.getByRole('button',{name:'Tolak',exact:true}).count(),0);assert.equal(await page.locator('#list img').count(),0);
await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.addInitScript(()=>{window.mockSigner=true;});await page.reload();await page.waitForSelector('#list article');assert.equal(await page.getByRole('button',{name:'Tolak',exact:true}).count(),1);
await page.goto('http://127.0.0.1:3000/surat-verifikasi.html?id=bad');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('tidak valid'));
await page.goto('http://127.0.0.1:3000/surat-verifikasi.html?id=12345678-1234-1234-1234-123456789abc');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('DICABUT'));
assert.deepEqual(errors,[]);console.log('PASS: mocked login, registrar/signer controls, XSS escaping, mobile, invalid ID, revoked verification. Backend integration NOT tested.');
}finally{await browser.close();}
