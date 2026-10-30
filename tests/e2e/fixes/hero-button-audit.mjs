import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = path.resolve('screenshots/fix-graph-2');
fs.mkdirSync(out, { recursive: true });
const sizes = [['1280x720',1280,720],['1440x900',1440,900],['390x844',390,844]];
const views = ['chat','vault','graph','agent','tour'];
const results = [];
let failures = 0;
const check = (name, ok, detail='') => { results.push(`${ok?'PASS':'FAIL'} ${name}${detail?` · ${detail}`:''}`); if(!ok) failures++; };
const contrastScan = async page => page.evaluate(() => {
  const parse = value => { const m=value.match(/[\d.]+/g)||[]; return m.length<3?[0,0,0]:m.slice(0,3).map(Number); };
  const luminance = value => { const c=parse(value).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
  return [...document.querySelectorAll('#thermal-landing button,#thermal-landing a.thermal-button,.app-header button,.app-container button')]
    .filter(el=>el.getClientRects().length && getComputedStyle(el).visibility==='visible' && !el.closest('details:not([open])'))
    .map(el=>{
      let background=getComputedStyle(el).backgroundColor, parent=el.parentElement;
      while(background==='rgba(0, 0, 0, 0)'&&parent){background=getComputedStyle(parent).backgroundColor;parent=parent.parentElement;}
      const foreground=getComputedStyle(el).color, a=luminance(foreground), b=luminance(background);
      return {text:(el.innerText||el.getAttribute('aria-label')||'button').trim().slice(0,30),ratio:Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2))};
    });
});
const auditButtonStates = async (page, name) => {
  const buttons = page.locator('#thermal-landing button,#thermal-landing a.thermal-button,.app-header button,.app-container button');
  const initial = await buttons.evaluateAll(els=>els.map(el=>({visible:!!el.getClientRects().length && getComputedStyle(el).visibility==='visible' && !el.closest('details:not([open])'),disabled:el.disabled})));
  let visibleCount=0, testedStates=0;
  for(let i=0;i<initial.length;i++) {
    if(!initial[i].visible) continue;
    visibleCount++;
    const item=buttons.nth(i);
    try {
      await item.hover({timeout:1200});
      const hover=await item.evaluate(el=>{
        let bg=getComputedStyle(el).backgroundColor, parent=el.parentElement;while(bg==='rgba(0, 0, 0, 0)'&&parent){bg=getComputedStyle(parent).backgroundColor;parent=parent.parentElement;}
        const fg=getComputedStyle(el).color;
        const nums=s=>{const m=s.match(/[\d.]+/g)||[];return m.slice(0,3).map(Number)};
        const lum=s=>{const c=nums(s).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
        const a=lum(fg),b=lum(bg);return Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2));
      });
      check(`${name} button ${i+1} hover contrast`,hover>=4.5,`ratio ${hover}`); testedStates++;
      await page.keyboard.press('Tab');
      await item.evaluate(el=>el.focus({focusVisible:true}));
      const focus=await item.evaluate(el=>{
        let bg=getComputedStyle(el).backgroundColor,parent=el.parentElement;while(bg==='rgba(0, 0, 0, 0)'&&parent){bg=getComputedStyle(parent).backgroundColor;parent=parent.parentElement;}
        const fg=getComputedStyle(el).color;
        const nums=s=>{const m=s.match(/[\d.]+/g)||[];return m.slice(0,3).map(Number)};
        const lum=s=>{const c=nums(s).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
        const a=lum(fg),b=lum(bg);return {ratio:Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2)),visible:el.matches(':focus-visible')};
      });
      check(`${name} button ${i+1} focus contrast`,focus.ratio>=4.5&&focus.visible,`ratio ${focus.ratio}; focus-visible ${focus.visible}`); testedStates++;
    } catch { check(`${name} button ${i+1} hover/focus states`,false,'could not focus or hover'); }
  }
  const defaults=await contrastScan(page); const failuresNow=defaults.filter(item=>item.ratio<4.5);
  check(`${name} default visible buttons meet AA`,failuresNow.length===0,`${defaults.length} buttons scanned${failuresNow.length?`; ${JSON.stringify(failuresNow)}`:''}`);
  return {visibleCount,testedStates};
};
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const [name,width,height] of sizes) {
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
    const consoleErrors=[],pageErrors=[],badResponses=[];
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)badResponses.push(`${response.status()} ${response.url()}`);});
    await page.goto('http://127.0.0.1:8000/#/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('.thermal-hero-actions .thermal-button-primary'));
    const cta=page.locator('.thermal-hero-actions .thermal-button-primary');
    const base=await cta.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,disabled:el.matches(':disabled,[aria-disabled="true"],.is-disabled')}));
    const ratio=await cta.evaluate(el=>{const rgb=s=>{const m=s.match(/[\d.]+/g)||[];return m.slice(0,3).map(Number)};const lum=s=>{const c=rgb(s).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};const a=lum(getComputedStyle(el).color),b=lum(getComputedStyle(el).backgroundColor);return Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2));});
    check(`${name} hero Open console default lime/ink`,base.background==='rgb(212, 255, 36)'&&base.color==='rgb(10, 11, 15)'&&ratio>=4.5,`contrast ${ratio}:1`);
    const leafTexts=await page.locator('#thermal-landing .thermal-hero *').evaluateAll(elements=>elements.filter(el=>el.children.length===0&&!el.closest('.sr-only')&&el.getClientRects().length).map(el=>(el.textContent||'').trim().replace(/\s+/g,' ')).filter(Boolean));
    const parents=await page.locator('#thermal-landing .thermal-hero *').evaluateAll(elements=>elements.filter(el=>el.children.length>1).map(parent=>[...parent.children].filter(child=>!child.classList.contains('sr-only')).map(child=>(child.textContent||'').trim().replace(/\s+/g,' ')).filter(Boolean)));
    const duplicateSiblings=parents.some(children=>new Set(children).size!==children.length);
    check(`${name} hero has one ASK THE VAULT label`,leafTexts.filter(text=>text.toUpperCase()==='ASK THE VAULT').length===1&&!duplicateSiblings);
    await cta.hover();
    await page.waitForTimeout(220);
    const hover=await cta.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,outline:getComputedStyle(el).outlineWidth,offset:getComputedStyle(el).outlineOffset}));
    const hoverRatio=await cta.evaluate(el=>{const rgb=s=>{const m=s.match(/[\d.]+/g)||[];return m.slice(0,3).map(Number)};const lum=s=>{const c=rgb(s).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};const a=lum(getComputedStyle(el).color),b=lum(getComputedStyle(el).backgroundColor);return Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2));});
    check(`${name} hero CTA hover stays high-contrast lime`,hover.background==='rgb(225, 255, 102)'&&hover.color==='rgb(10, 11, 15)'&&hoverRatio>=4.5,`contrast ${hoverRatio}:1`);
    if(name==='1440x900') await page.screenshot({path:path.join(out,'after-hero-open-console-hover-1440x900.png')});
    await cta.evaluate(el=>el.addEventListener('click',event=>event.preventDefault(),{once:true}));
    await page.mouse.down();
    await page.waitForTimeout(220);
    const active=await cta.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
    const activeRatio=await cta.evaluate(el=>{const rgb=s=>{const m=s.match(/[\d.]+/g)||[];return m.slice(0,3).map(Number)};const lum=s=>{const c=rgb(s).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};const a=lum(getComputedStyle(el).color),b=lum(getComputedStyle(el).backgroundColor);return Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2));});
    check(`${name} hero CTA active uses darker lime`,active.background==='rgb(185, 230, 0)'&&active.color==='rgb(10, 11, 15)'&&activeRatio>=4.5,`contrast ${activeRatio}:1`);
    await page.mouse.up();
    await page.keyboard.press('Tab');
    await cta.evaluate(el=>el.focus({focusVisible:true}));
    await page.waitForTimeout(220);
    const focus=await cta.evaluate(el=>({visible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineWidth,offset:getComputedStyle(el).outlineOffset,background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
    const focusRatio=await cta.evaluate(el=>{const rgb=s=>{const m=s.match(/[\d.]+/g)||[];return m.slice(0,3).map(Number)};const lum=s=>{const c=rgb(s).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};const a=lum(getComputedStyle(el).color),b=lum(getComputedStyle(el).backgroundColor);return Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2));});
    check(`${name} hero CTA focus-visible AA and outline`,focus.visible&&focus.background==='rgb(225, 255, 102)'&&focus.color==='rgb(10, 11, 15)'&&focus.outline==='2px'&&focus.offset==='2px'&&focusRatio>=4.5,`contrast ${focusRatio}:1; ${JSON.stringify(focus)}`);
    if(name==='1440x900') await page.screenshot({path:path.join(out,'after-hero-open-console-focus-1440x900.png')});
    await cta.evaluate(el=>el.setAttribute('aria-disabled','true'));
    await page.waitForTimeout(220);
    const disabled=await cta.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
    const disabledRatio=await cta.evaluate(el=>{const rgb=s=>{const m=s.match(/[\d.]+/g)||[];return m.slice(0,3).map(Number)};const lum=s=>{const c=rgb(s).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};const a=lum(getComputedStyle(el).color),b=lum(getComputedStyle(el).backgroundColor);return Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2));});
    check(`${name} hero CTA disabled has readable gray state`,disabled.background==='rgb(98, 107, 121)'&&disabled.color==='rgb(255, 255, 255)'&&disabledRatio>=4.5,`contrast ${disabledRatio}:1`);
    await cta.evaluate(el=>el.removeAttribute('aria-disabled'));
    await page.locator('#thermal-landing').screenshot({path:path.join(out,`after-landing-${name}.png`)});
    await auditButtonStates(page,`${name} landing`);
    for(const view of views) {
      await page.evaluate(view=>switchView(view),view);
      await page.waitForTimeout(80);
      await auditButtonStates(page,`${name} ${view}`);
      if(name==='1280x720'&&['chat','vault','agent','tour'].includes(view)) await page.screenshot({path:path.join(out,`after-${view}-1280x720.png`)});
    }
    check(`${name} no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check(`${name} no console/page/network errors`,!consoleErrors.length&&!pageErrors.length&&!badResponses.length,[...consoleErrors,...pageErrors,...badResponses].join(' | '));
    await page.close();
  }
} finally { await browser.close(); }
console.log(results.join('\n'));
console.log(`HERO BUTTON AUDIT ${failures?'FAIL':'PASS'} · ${results.length-failures}/${results.length} checks passed`);
if(failures)process.exitCode=1;
