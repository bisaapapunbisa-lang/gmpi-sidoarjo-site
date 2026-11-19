import fs from 'node:fs';
import assert from 'node:assert/strict';
import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';
const browser = await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
try {
 const page=await browser.newPage();
 await page.route('**/*',route=>route.abort());
 const source=fs.readFileSync('index.html','utf8');
 const group=source.match(/<div class="leadership-actions"[\s\S]*?<\/div>/)[0];
 await page.setContent(`<style>${fs.readFileSync('styles.css','utf8')}</style><section class="leadership-section">${group}</section>`);
 for(const width of [1440,900,760,390,320]) {
  await page.setViewportSize({width,height:900});
  const boxes=await page.locator('.leadership-actions>a').evaluateAll(links=>links.map(a=>({x:a.getBoundingClientRect().x,y:a.getBoundingClientRect().y,w:a.getBoundingClientRect().width,h:a.getBoundingClientRect().height,color:getComputedStyle(a).color,href:a.getAttribute('href')})));
  assert.equal(boxes.length,3);
  assert.deepEqual(boxes.map(b=>b.href),['sinematik.html','unduh-film','#struktur']);
  boxes.forEach(b=>{assert(b.x>=0&&b.x+b.w<=width+1);assert.equal(b.color,'rgb(255, 245, 223)');assert(b.h>=68)});
  if(width>760) assert(boxes.every(b=>b.y===boxes[0].y));
  else assert(boxes[1].y>=boxes[0].y+boxes[0].h&&boxes[2].y>=boxes[1].y+boxes[1].h);
  console.log(`PASS ${width}px: alignment, contrast color, bounds and original links`);
 }
} finally {await browser.close();}
