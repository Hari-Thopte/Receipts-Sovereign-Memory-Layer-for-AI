import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const baseUrl = process.env.RECEIPTS_URL || 'http://127.0.0.1:8000/';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outputDir = path.resolve(projectRoot, process.env.AUDIT_SCREENSHOT_DIR || 'screenshots/gate-1');
fs.mkdirSync(outputDir, { recursive: true });
const checks = [];
const errors = [];
const selectedGate = Number(process.env.AUDIT_GATE || 0);
const browser = await chromium.launch({ channel: 'chrome', headless: true });

function check(name, predicate, detail = '') {
  const id = name.match(/C(\d+)/)?.[1];
  const gate = id && ({ 1:1, 2:1, 3:2, 4:2, 5:1, 6:4, 7:3, 8:4, 9:1, 10:1, 11:1, 12:4, 13:1, 14:2 })[id];
  if (selectedGate && gate !== selectedGate) return;
  checks.push(name);
  try { assert.ok(predicate, detail || name); console.log(`PASS ${name}`); }
  catch (error) { errors.push(`${name}: ${error.message}`); console.log(`FAIL ${name}: ${error.message}`); }
}

try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#thermal-landing').waitFor({ state: 'visible', timeout: 10000 });
    const title = await page.title();
    const bodyText = await page.locator('body').innerText();
    check(`C1 landing and no v4 @ ${viewport.width}`, /receipts/i.test(title) && !/v4/i.test(title) && !/v4/i.test(bodyText), `title=${title}; body matches=${JSON.stringify(bodyText.match(/.{0,30}v4.{0,30}/ig)||[])}`);

    const cta = page.locator('.thermal-hero-actions a[href="#/app/chat"]').first();
    const ctaText = (await cta.innerText()).trim();
    const ctaStyle = await cta.evaluate(element => {
      const style = getComputedStyle(element);
      const parse = value => { const v = value.trim(); if (v.startsWith('#')) { const h=v.slice(1); const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16); return [(n>>16)&255,(n>>8)&255,n&255]; } const m=v.match(/[\d.]+/g)||[]; return m.length>=3?m.slice(0,3).map(Number):[0,0,0]; };
      const lum = color => { const c=parse(color).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
      const a=lum(style.color),b=lum(style.backgroundColor); return { text:element.innerText.trim(), width:element.getBoundingClientRect().width, ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05), color:style.color, bg:style.backgroundColor };
    });
    check(`C2 CTA text, contrast and width @ ${viewport.width}`, ctaText === 'Open console' && ctaStyle.ratio >= 4.5 && ctaStyle.width >= 120, JSON.stringify(ctaStyle));

    const overlap = await page.evaluate(() => {
      const h=document.querySelector('.thermal-hero-copy h1')?.getBoundingClientRect();
      const p=document.querySelector('.thermal-hero-panel')?.getBoundingClientRect();
      return !h || !p || !(h.right>p.left && h.left<p.right && h.bottom>p.top && h.top<p.bottom);
    });
    check(`C3 H1 avoids blue panel @ ${viewport.width}`, overlap);

    const printer = await page.evaluate(() => {
      const input=document.querySelector('#landing-printer-input'); const button=document.querySelector('#landing-printer-form button'); const label=document.querySelector('#landing-printer-form label');
      if (!input||!button||!label) return null;
      const r=input.getBoundingClientRect(),b=button.getBoundingClientRect(),l=label.getBoundingClientRect();
      const lineHeight=parseFloat(getComputedStyle(label).lineHeight)||16;
      return { width:r.width, firstViewport:r.top>=0&&b.bottom<=innerHeight, labelLines:label.classList.contains('sr-only')?1:Math.ceil((l.height||0)/lineHeight) };
    });
    if (viewport.width === 1280) check('C4 printer size and above fold @ 1280', Boolean(printer && printer.width>=320 && printer.firstViewport && printer.labelLines<=2), JSON.stringify(printer));

    const duplicateParagraphs = await page.locator('#thermal-landing p').evaluateAll(ps => ps.some((p,i)=>i>0&&p.innerText.trim()&&p.innerText.trim()===ps[i-1].innerText.trim()));
    check(`C5 no adjacent duplicate paragraphs @ ${viewport.width}`, !duplicateParagraphs);
    const itemRows = await page.locator('.itemized-row').evaluateAll(rows => rows.map(row => ({ title:row.querySelector('h3')?.innerText||'', description:row.querySelector('p')?.innerText||'', visible:!!row.querySelector('p')&&getComputedStyle(row.querySelector('p')).display!=='none' })));
    if (viewport.width === 1280) check('C6 six visible item descriptions @ 1280', itemRows.length===6&&itemRows.every(row=>row.visible&&row.description.length>=40), JSON.stringify(itemRows));

    const menuButton=page.locator('#profile-menu-trigger');
    if (await menuButton.count()) {
      await page.goto(`${baseUrl}#/app/chat`, { waitUntil:'domcontentloaded' });
      await page.locator('.app-header').waitFor({state:'visible'});
      const headerText=await page.locator('.app-header').innerText();
      check(`C9 no malformed profile name @ ${viewport.width}`, !headerText.includes('HHari') && !/v4/i.test(headerText), headerText);
      await menuButton.click();
      check(`C9 profile menu opens @ ${viewport.width}`, await page.locator('#profile-menu[role="menu"]').isVisible());
      const menuText = await page.locator('#profile-menu').innerText();
      check(`C9 profile menu actions @ ${viewport.width}`, /Switch profile/i.test(menuText) && /Open Sync/i.test(menuText) && /Open Settings/i.test(menuText), menuText);
      await page.keyboard.press('Escape');
      check(`C9 Escape closes menu @ ${viewport.width}`, await page.locator('#profile-menu').isHidden());
      await menuButton.click();
      await page.locator('body').click({ position: { x: 8, y: 8 } });
      check(`C9 outside click closes menu @ ${viewport.width}`, await page.locator('#profile-menu').isHidden());
      const logo=page.locator('a.brand[href="#/"]');
      if (await logo.count()) {
        await page.goto(`${baseUrl}#/app/vault`, { waitUntil:'domcontentloaded' });
        await page.locator('.app-header').waitFor({state:'visible'});
        await page.locator('a.brand[href="#/"]').click();
        await page.waitForFunction(()=>location.hash==='#/');
        await page.locator('#thermal-landing').waitFor({state:'visible'});
        check(`C10 console logo returns home @ ${viewport.width}`, await page.locator('#thermal-landing').isVisible());
      }
    }
    await page.goto(baseUrl, { waitUntil:'domcontentloaded' });
    const pillText=await page.locator('#engine-pill').innerText().catch(()=> '');
    check(`C11 no UNVERIFIED @ ${viewport.width}`, !/unverified/i.test(pillText), pillText);

    await page.goto(baseUrl, { waitUntil:'domcontentloaded' });
    const layout=await page.evaluate(()=>{
      const parse=value=>{const m=value.match(/[\d.]+/g)||[];return m.length>=3?m.slice(0,3).map(Number):[0,0,0]};
      const luminance=rgb=>rgb.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
      const visible=[...document.querySelectorAll('#thermal-landing p,#thermal-landing h1,#thermal-landing h2,#thermal-landing h3,#thermal-landing a,#thermal-landing button,#thermal-landing li,#thermal-landing span,#thermal-landing b,#thermal-landing strong,#thermal-landing small,#thermal-landing time,#thermal-landing summary,#thermal-landing label,#thermal-landing code')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&el.innerText.trim());
      const failures=[];
      for(const el of visible){let bgEl=el;while(bgEl&&getComputedStyle(bgEl).backgroundColor==='rgba(0, 0, 0, 0)')bgEl=bgEl.parentElement;const fg=parse(getComputedStyle(el).color),bg=parse(getComputedStyle(bgEl||document.body).backgroundColor);const a=luminance(fg),b=luminance(bg);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(ratio<4.5)failures.push({text:el.innerText.trim().slice(0,36),ratio:Number(ratio.toFixed(2)),fg:getComputedStyle(el).color,bg:getComputedStyle(bgEl||document.body).backgroundColor});}
      return {overflow:document.documentElement.scrollWidth>innerWidth,failures:failures.slice(0,8),failureCount:failures.length};
    });
    check(`C12 AA contrast and no horizontal overflow @ ${viewport.width}`, !layout.overflow&&layout.failureCount===0, JSON.stringify(layout));
    if(viewport.width===1280){
      await page.locator('.thermal-letterhead nav a[href="#itemized"]').click();
      await page.waitForTimeout(250);
      check('C15 scroll spy highlights Itemized',await page.locator('.thermal-letterhead nav a[href="#itemized"]').getAttribute('aria-current')==='location');
      for(const row of await page.locator('.itemized-row').all())await row.scrollIntoViewIfNeeded();
      check('C16 itemized tape reaches six items',await page.locator('#itemized-tape-total').innerText()==='6');
      check('C17 configured spec IDs are copyable',await page.locator('.spec-copy-button').count()>=1);
    }
    const text=await page.locator('#thermal-landing').innerText();
    check(`C13 no visible placeholders @ ${viewport.width}`, !/pending|TODO|lorem|Needs a comparison endpoint|\$3k/i.test(text));
    await page.evaluate(()=>window.scrollTo(0,0));
    const print=await page.evaluate(()=>{const panel=document.querySelector('.thermal-hero-panel')?.getBoundingClientRect();const receipt=document.querySelector('#landing-printer-output .thermal-printed-slip')?.getBoundingClientRect()||document.querySelector('#landing-hero-receipt')?.getBoundingClientRect();return !panel||!receipt||(receipt.left>=panel.left&&receipt.right<=panel.right&&receipt.top>=0&&receipt.bottom<=innerHeight);});
    if (viewport.width===1280) check('C14 printed receipt inside viewport @ 1280',print);
    check(`No browser errors @ ${viewport.width}`, consoleErrors.length===0, consoleErrors.join(' | '));
    await page.screenshot({ path:path.join(outputDir, `landing-${viewport.width}x${viewport.height}.png`), fullPage:true });
    await page.close();
  }

  const css=fs.readFileSync(path.join(projectRoot,'static/css/thermal.css'),'utf8');
  const js=fs.readFileSync(path.join(projectRoot,'static/js/app.js'),'utf8');
  check('C8 no cursor-following or dotted radial background', !/document\.addEventListener\(['"](?:pointermove|mousemove)|--(?:mouse|pointer)[xy]|radial-gradient\([^)]*\.\d+px/i.test(js+css));

  const landing=await browser.newPage({viewport:{width:1280,height:720}, reducedMotion:'no-preference'});
  await landing.goto(baseUrl,{waitUntil:'domcontentloaded'});
  const day=landing.locator('#day-in-vault');
  if (await day.count()) {
    const bounds=await day.boundingBox();
    const captures=[];
    for (const pct of [0.1,0.5,0.9]) {
      await landing.evaluate(({top,pct})=>window.scrollTo(0,top+pct*(document.querySelector('#day-in-vault').scrollHeight-innerHeight)),{top:bounds?.y||0,pct});
      await landing.waitForTimeout(450);
      const state=await landing.evaluate(()=>({day:document.querySelector('#day-counter')?.innerText,opacity:Number(getComputedStyle(document.querySelector('#day-old-fact')).opacity),stamp:document.querySelector('#day-old-stamp')?.innerText,hasNew:!document.querySelector('#day-receipt-new')?.hidden}));
      captures.push(state);
      await landing.screenshot({path:path.join(outputDir,`day-${Math.round(pct*100)}.png`),fullPage:false});
    }
    check('C7 scroll progress changes displayed day',captures.length===3&&new Set(captures.map(state=>state.day)).size===3,JSON.stringify(captures));
    check('C7 old receipt ink fades with confidence',captures.length===3&&captures[0].opacity>captures[1].opacity&&captures[1].opacity>=captures[2].opacity,JSON.stringify(captures.map(state=>state.opacity)));
    check('C7 receipt B appears when conflict arrives',captures.length===3&&!captures[0].hasNew&&captures[1].hasNew&&captures[2].hasNew,JSON.stringify(captures.map(state=>state.hasNew)));
    check('C7 stamps follow confidence thresholds',captures.length===3&&captures[0].stamp==='FRESH'&&captures[1].stamp==='FADING'&&captures[2].stamp==='STALE',JSON.stringify(captures.map(state=>state.stamp)));
    await landing.locator('#vault-day-range').fill('30');
    await landing.waitForTimeout(250);
    check('C7 day 30 reaffirms the newer receipt',await landing.locator('#day-counter').innerText()==='DAY 30'&&await landing.locator('#day-new-stamp').innerText()==='REAFFIRMED');
    await landing.screenshot({path:path.join(outputDir,'day-30.png'),fullPage:false});
  } else check('C7 pinned day section exists',false);
  await landing.close();
} finally {
  await browser.close();
}

console.log(`\nAUDIT ${errors.length ? 'FAIL' : 'PASS'} · ${checks.length-errors.length}/${checks.length} checks passed`);
if (errors.length) { console.error(errors.join('\n')); process.exitCode=1; }
