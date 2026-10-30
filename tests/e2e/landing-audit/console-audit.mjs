import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = path.join(root, process.env.CONSOLE_SCREENSHOT_DIR || 'screenshots/gate-5');
fs.mkdirSync(output, { recursive:true });
const base = process.env.RECEIPTS_URL || 'http://127.0.0.1:8000/';
const viewports=[{width:1440,height:900},{width:390,height:844}];
const tabs=[['chat','Chat'],['vault','Vault'],['graph','Graph'],['agent','Copilot'],['tour','Tour']];
const errors=[]; const results=[];
function check(name,ok,detail=''){results.push({name,ok,detail});if(!ok)errors.push(`${name}${detail?`: ${detail}`:''}`);}
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const viewport of viewports){
    const page=await browser.newPage({viewport,reducedMotion:'reduce'});
    const consoleErrors=[];const pageErrors=[];const failedResponses=[];
    page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
    page.on('pageerror',e=>pageErrors.push(e.message));
    page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/models'))failedResponses.push(`${r.status()} ${r.url()}`)});
    // Opening Settings must not make a provider request during this visual-only audit.
    await page.route('**/api/models',route=>route.fulfill({status:200,contentType:'application/json',body:'{"models":[]}'}));
    let suggestionCall=0;
    await page.route('**/api/agent/suggest',route=>{
      suggestionCall+=1;
      const local={suggestions:[{type:'refresh_alert',priority:'high',receipt_ids:['REC-PST4'],title:'Review the location memory',description:'The sample location receipt is due for review.',action:'Inspect it.'},{type:'refresh_alert',priority:'high',receipt_ids:['REC-PST4'],title:'Review the location memory',description:'The same suggestion appears twice.',action:'Inspect it.'}],model_used:'Local rule-based analysis (no live API key)',is_simulated:true};
      const live={suggestions:[{type:'refresh_alert',priority:'medium',receipt_ids:['REC-PST4'],title:'Inspect a recent location update',description:'Check the newer location receipt.',action:'Inspect it.'}],model_used:'NVIDIA Nemotron 3 Super via Nebius Token Factory'};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(suggestionCall<=2?local:live)});
    });
    await page.goto(`${base}#/app/chat`,{waitUntil:'domcontentloaded'});
    await page.locator('.app-header').waitFor({state:'visible',timeout:10000});
    for(const [id,label] of tabs){
      const tab=page.locator(`#tab-btn-${id}`);
      if(!await tab.evaluate(element=>element.classList.contains('active')))await tab.click();
      await page.waitForFunction(expected=>document.querySelector('.view-section.active')?.id===`view-${expected}`,id);
      const activeCount=await page.locator('.view-section.active').count();
      check(`${viewport.width} tab ${label} active`,activeCount===1);
      if(id==='agent'){
        await page.waitForFunction(()=>document.querySelector('#agent-suggestions-meta')?.innerText.includes('Local rules'));
        await page.waitForFunction(()=>document.querySelectorAll('#agent-suggestions-list .suggestion-card').length===1);
        check(`${viewport.width} Copilot deduplicates local recommendations`,await page.locator('#agent-suggestions-list .suggestion-card').count()===1&&/Local rules/.test(await page.locator('#agent-suggestions-meta').innerText()));
        await page.screenshot({path:path.join(output,`${viewport.width}-tab-agent-local-rules.png`),fullPage:false});
      }
      await page.screenshot({path:path.join(output,`${viewport.width}-tab-${id}.png`),fullPage:false});
    }
    await page.locator('#tab-btn-agent').click();
    await page.waitForFunction(()=>document.querySelector('#agent-suggestions-meta')?.innerText.includes('Nemotron'));
    check(`${viewport.width} Copilot labels Nemotron source`,/Nemotron/.test(await page.locator('#agent-suggestions-meta').innerText()));
    await page.screenshot({path:path.join(output,`${viewport.width}-tab-agent-nemotron.png`),fullPage:false});
    const modalOpen=async(name,opener)=>{
      await page.evaluate(()=>document.querySelectorAll('.modal-overlay.active').forEach(el=>el.classList.remove('active')));
      await opener();
      const modal=page.locator(`#${name}`);
      await modal.waitFor({state:'visible',timeout:5000});
      const active=await page.locator('.modal-overlay.active').count();
      const box=await modal.locator('.modal-content').boundingBox();
      const within=Boolean(box&&box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1);
      check(`${viewport.width} modal ${name} exclusive and fits`,active===1&&within,JSON.stringify({active,box}));
      await page.screenshot({path:path.join(output,`${viewport.width}-modal-${name}.png`),fullPage:false});
      if(name==='modal-settings'){
        await page.screenshot({path:path.join(output,`${viewport.width}-modal-settings-danger-zone.png`),fullPage:false});
        let confirmSeen=false;
        page.once('dialog',async dialog=>{confirmSeen=dialog.type()==='confirm';await dialog.dismiss()});
        await page.locator('#modal-settings .settings-danger-zone button').click();
        check(`${viewport.width} Reset Demo requires confirmation`,confirmSeen);
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(id=>!document.getElementById(id)?.classList.contains('active'),name);
      check(`${viewport.width} modal ${name} closes with Escape`,await modal.isHidden());
    };
    await modalOpen('modal-engine',async()=>page.locator('#engine-pill').click());
    await modalOpen('modal-sync',async()=>page.locator('button[aria-label="Encrypted vault sync"]').click());
    await modalOpen('modal-settings',async()=>{await page.locator('#profile-menu-trigger').click();await page.locator('#profile-menu [role="menuitem"]', {hasText:'Open Settings'}).click()});
    await modalOpen('modal-add',async()=>{await page.locator('#tab-btn-vault').click();await page.locator('#view-vault .vault-toolbar .btn-primary').click()});
    await modalOpen('modal-tavily',async()=>{await page.locator('#view-vault .vault-actions-wrap>button').click();await page.locator('#vault-actions-menu [role="menuitem"]',{hasText:'Ingest Web'}).click()});
    await modalOpen('modal-outbound',async()=>{await page.evaluate(()=>switchView('chat'));await page.locator('#view-chat button',{hasText:'Data sent'}).click()});
    await modalOpen('modal-correct',async()=>page.evaluate(()=>openCorrectionModal('REC-PST4')));
    await modalOpen('modal-conflict',async()=>page.evaluate(()=>openConflictModal({existing_receipt_id:'REC-PST4',existing_content:'User is based in Seattle, Washington.',proposed_fact:'User moved to Austin, Texas.',domain:'location',reason:'A newer example seed receipt differs.'})));
    const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    check(`${viewport.width} no console horizontal overflow`,!horizontalOverflow);
    check(`${viewport.width} no console errors`,consoleErrors.length===0,consoleErrors.join(' | '));
    check(`${viewport.width} no page errors`,pageErrors.length===0,pageErrors.join(' | '));
    check(`${viewport.width} no failed HTTP responses`,failedResponses.length===0,failedResponses.join(' | '));
    await page.close();
  }
} finally {await browser.close();}
const lines=results.map(r=>`${r.ok?'PASS':'FAIL'} ${r.name}${r.detail?`: ${r.detail}`:''}`);
const summary=`\nCONSOLE AUDIT ${errors.length?'FAIL':'PASS'} · ${results.length-errors.length}/${results.length} checks passed`;
console.log(lines.join('\n')+summary);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
