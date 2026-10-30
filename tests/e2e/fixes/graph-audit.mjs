import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = path.resolve('screenshots/fixes');
fs.mkdirSync(out, { recursive: true });
const sizes = [['1280x720',1280,720],['1440x900',1440,900],['390x844',390,844]];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
let failures = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`); if (!ok) failures += 1; };
try {
  for (const [name,width,height] of sizes) {
    const page = await browser.newPage({ viewport: { width,height }, reducedMotion: 'reduce' });
    const consoleErrors = [], pageErrors = [], badResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
    await page.goto('http://127.0.0.1:8000/#/app/graph', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#memory-graph-svg .graph-node').length > 0, null, { timeout: 12000 });
    const api = await page.evaluate(async () => (await (await fetch('/api/graph')).json()));
    const initial = await page.evaluate(() => ({
      nodes: [...document.querySelectorAll('#memory-graph-svg .graph-node')].map(node => {
        const circle = node.querySelector('.graph-node-disc').getBoundingClientRect();
        return { id: node.dataset.nodeId, x: circle.x + circle.width/2, y: circle.y + circle.height/2, r: circle.width/2, labelVisible: getComputedStyle(node.querySelector('.graph-node-label')).opacity === '1', category: node.dataset.category };
      }),
      edges: document.querySelectorAll('#memory-graph-svg .graph-edge').length,
      legendEdges: [...document.querySelectorAll('#graph-legend .legend-line')].map(line => [...line.classList].find(name => ['similarity','inferred','conflict','supersedes'].includes(name))),
      svg: document.querySelector('#memory-graph-svg').getBoundingClientRect().toJSON(),
      drawer: document.querySelector('#graph-node-details').getBoundingClientRect().toJSON(),
      overflow: document.documentElement.scrollWidth > innerWidth
    }));
    check(`${name} API records displayed`, initial.nodes.length === (api.nodes || []).length, `${initial.nodes.length} nodes`);
    check(`${name} edges are API-backed only`, initial.edges === (api.edges || []).length && initial.legendEdges.length === new Set((api.edges || []).map(edge => { const rel=String(edge.relationship||'').toLowerCase(); return rel.includes('conflict')?'conflict':rel.includes('supersed')?'supersedes':edge.inferred||rel.includes('inferred')?'inferred':'similarity'; })).size, `${initial.edges} rendered / ${api.edges.length} API edges`);
    check(`${name} category clusters use canvas`, initial.svg.width > 300 && initial.svg.height >= 500, `${Math.round(initial.svg.width)}×${Math.round(initial.svg.height)}`);
    const visibleLabels = initial.nodes.filter(node => node.labelVisible).length;
    const labelRects = await page.locator('.graph-node-label.is-visible').evaluateAll(items => items.map(label => { const rect=label.getBoundingClientRect(); return {x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom}; }));
    const noLabelOverlap = labelRects.every((a,i) => labelRects.slice(i+1).every(b => a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y));
    const insideCanvas = labelRects.every(rect => rect.x >= initial.svg.x && rect.right <= initial.svg.right);
    check(`${name} labels remain legible without overlap`, visibleLabels >= Math.min(3, initial.nodes.length) && noLabelOverlap && insideCanvas && initial.nodes.every((a,i) => initial.nodes.slice(i+1).every(b => Math.hypot(a.x-b.x,a.y-b.y) >= a.r+b.r+8)), `${visibleLabels} labels, bounds fit and circles spaced`);
    const radii = await page.locator('.graph-node').evaluateAll(items => items.map(node => [Number(node.dataset.confidence), node.querySelector('.graph-node-disc').getBoundingClientRect().width/2]));
    const ordered = [...radii].sort((a,b)=>a[0]-b[0]);
    check(`${name} node radius tracks confidence`, ordered.every((item,index)=>index===0||item[1]>=ordered[index-1][1]-0.5), JSON.stringify(ordered.map(([c,r])=>[c.toFixed(2),r.toFixed(1)])));
    await page.screenshot({ path: path.join(out, `after-graph-${name}.png`) });
    const first = page.locator('#memory-graph-svg .graph-node').first();
    await first.locator('.graph-node-disc').hover();
    await page.waitForTimeout(60);
    const hoverData = await page.evaluate(() => ({ dimmed: [...document.querySelectorAll('.graph-node.is-dimmed')].map(node => getComputedStyle(node.querySelector('.graph-node-disc')).opacity), tooltip: document.querySelector('.graph-node circle title')?.textContent || '' }));
    check(`${name} hover highlights receipt and dims non-neighbors`, Boolean(hoverData.tooltip) && hoverData.dimmed.every(value => Number(value) <= .3), `tooltip present; dimmed ${hoverData.dimmed.length}`);
    await first.locator('.graph-node-disc').click();
    check(`${name} selection opens non-overlapping inspector`, await page.locator('#graph-node-details').isVisible() && await page.locator('#graph-node-details').evaluate(panel => panel.getBoundingClientRect().right <= document.querySelector('.graph-svg-wrapper').getBoundingClientRect().right + 1));
    await page.keyboard.press('Escape');
    const focusedNode = page.locator('#memory-graph-svg .graph-node').first();
    await focusedNode.focus();
    const beforeArrow = await page.evaluate(() => document.activeElement?.dataset.nodeId || '');
    await page.keyboard.press('ArrowRight');
    const afterArrow = await page.evaluate(() => document.activeElement?.dataset.nodeId || '');
    await page.keyboard.press('Enter');
    const keyboardOpens = await page.locator('#graph-node-details').isVisible();
    await page.keyboard.press('Escape');
    check(`${name} graph supports focus, arrows, Enter and Escape`, Boolean(beforeArrow && afterArrow && beforeArrow !== afterArrow && keyboardOpens && await page.locator('#graph-node-details').evaluate(panel => panel.hidden)));
    const dragCircle = page.locator('#memory-graph-svg .graph-node .graph-node-disc').first();
    const beforeDrag = await dragCircle.boundingBox();
    if (beforeDrag) { await page.mouse.move(beforeDrag.x + beforeDrag.width/2, beforeDrag.y + beforeDrag.height/2); await page.mouse.down(); await page.mouse.move(beforeDrag.x + beforeDrag.width/2 + 32, beforeDrag.y + beforeDrag.height/2 + 24, { steps: 3 }); await page.mouse.up(); }
    const afterDrag = await dragCircle.boundingBox();
    check(`${name} nodes can be pinned by dragging`, Boolean(beforeDrag && afterDrag && Math.abs(afterDrag.x-beforeDrag.x)>10 && Math.abs(afterDrag.y-beforeDrag.y)>5));
    const beforeZoom = await page.locator('#graph-viewport').getAttribute('transform');
    await page.locator('#memory-graph-svg').dispatchEvent('wheel', { deltaY: -100, clientX: initial.svg.x + initial.svg.width/2, clientY: initial.svg.y + initial.svg.height/2 });
    const afterZoom = await page.locator('#graph-viewport').getAttribute('transform');
    check(`${name} wheel zoom changes view`, beforeZoom !== afterZoom);
    await page.locator('#graph-day-range').evaluate(input => { input.value = '30'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    const day = await page.evaluate(() => ({ label: document.querySelector('#graph-day-label').textContent, faded: [...document.querySelectorAll('.graph-confidence-ring')].some(ring => Number(ring.getAttribute('stroke-dashoffset')) > 0) }));
    check(`${name} illustrative decay scrub updates`, day.label === 'DAY 30' && day.faded, day.label);
    await page.locator('.graph-mode-toggle button').nth(1).click();
    const rows = await page.locator('#graph-list-view tbody tr').count();
    check(`${name} Graph/List toggle renders table`, rows === initial.nodes.length, `${rows} rows`);
    if (name === '1440x900') {
      await page.locator('.graph-mode-toggle button').first().click();
      await page.locator('.graph-node').first().locator('.graph-node-disc').click();
      await page.screenshot({ path: path.join(out, 'after-graph-drawer-1440x900.png') });
      await page.keyboard.press('Escape');
      await page.locator('.graph-mode-toggle button').nth(1).click();
      await page.screenshot({ path: path.join(out, 'after-graph-list-1440x900.png') });
    }
    check(`${name} no horizontal overflow`, !initial.overflow);
    check(`${name} no console/page/network errors`, !consoleErrors.length && !pageErrors.length && !badResponses.length, [...consoleErrors,...pageErrors,...badResponses].join(' | '));
    await page.close();
  }
} finally { await browser.close(); }
console.log(results.join('\n'));
console.log(`GRAPH AUDIT ${failures ? 'FAIL' : 'PASS'} · ${results.length-failures}/${results.length} checks passed`);
if (failures) process.exitCode = 1;
