// RECEIPTS — Sovereign Memory Layer JavaScript Engine v2.0

// Features: Memory Graph, Conflict Detection, Proactive Staleness Alerts,

// Encrypted Cross-Device Sync (AES-256-GCM), Agentic Copilot, and Live Nemotron.

let allMemories = [];

let currentCategory = 'all';

let currentStatus = 'all';

let currentSearch = '';

let activeCorrectReceiptId = null;

let activeConflictData = null;

let currentProfile = 'Hari (Primary)';

let graphZoom = 1.0;

let graphNodes = [];

let graphEdges = [];

let selectedGraphNodeId = null;

let graphPan = { x: 0, y: 0 };

let graphResizeObserver = null;

let graphDay = 0;

let graphMode = 'graph';

let graphLabelsEnabled = true;

let graphHoveredNodeId = null;

let graphFilteredIds = null;

let graphHiddenCategories = new Set();

let graphPinnedPositions = new Map();

let graphPhysicsPaused = false;
let graphPhysicsAnimId = null;
let graphDraggingNodeId = null;

let graphNodeLayout = new Map();

let stalenessAlertItems = [];

let addConflictDebounceTimer = null;

let modalReturnFocus = null;

const landingLinkConfig = window.RECEIPTS_LINKS || Object.freeze({ demoUrl:'', githubUrl:'', devpostUrl:'', demoVideoUrl:'' });

let stalenessAlertCounts = { stale: 0, decaying: 0 };

let compareMode = false;

let activeChatRequestController = null;

let reprintingReceiptId = null;

let lastNebiusCallSucceeded = false;

const demoModeEnabled = new URLSearchParams(window.location.search).get('demo') === '1';

const previewVariants = Object.freeze({

  'fix-and-landing': Object.freeze({ route: '/', title: 'RECEIPTS — Ask your AI for the receipt' })

});

function lucideIcon(name, size = 16) {

  return `<svg class="ui-icon" width="${size}" height="${size}" aria-hidden="true" focusable="false"><use href="/static/brand/icons.svg#${name}"></use></svg>`;

}

// Barcode SVG Generator for physical receipt feel

function generateBarcodeSvg(sourceHash = '') {

  const bars = (sourceHash || '0f4c9a3e6b127d85').slice(0, 24).split('').map(char => (parseInt(char, 16) % 4) + 1);

  let rects = '';

  let x = 0;

  bars.forEach((w, i) => {

    if (i % 2 === 0) {

      rects += `<rect x="${x}" y="0" width="${w * 1.5}" height="40" fill="#15130E" />`;

    }

    x += w * 2.2;

  });

  const shortHash = sourceHash ? `${sourceHash.slice(0,8)}…${sourceHash.slice(-4)}` : 'HASH UNAVAILABLE';

  return `<span class="barcode-mark"><svg class="barcode-svg" viewBox="0 0 ${x} 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${rects}</svg><small class="barcode-short-hash">${escapeHtml(shortHash)}</small></span>`;

}

// Lifecycle Init

document.addEventListener('DOMContentLoaded', () => {

  document.querySelectorAll('#view-graph [data-graph-icon]').forEach(button => { button.innerHTML = icon(button.dataset.graphIcon); });
  syncGraphPhysicsButtonUI();

  document.getElementById('demo-mode-label')?.toggleAttribute('hidden', !demoModeEnabled);

  document.querySelectorAll('[data-dev-only="true"]').forEach(element => element.toggleAttribute('hidden', demoModeEnabled));

  fetchStats();

  fetchMemories();

  fetchEngineStatus();

  checkStalenessAlerts();

  applyHashRoute();

  configureLandingLinks();

  initializeLandingScrollExperience();

  document.getElementById('landing-printer-form')?.addEventListener('submit', submitLandingPrinter);

  document.querySelectorAll('[data-printer-question]').forEach(button => button.addEventListener('click', () => {

    const input = document.getElementById('landing-printer-input');

    if (input) { input.value = button.dataset.printerQuestion || ''; document.getElementById('landing-printer-form')?.requestSubmit(); }

  }));

  document.getElementById('landing-open-outbound')?.addEventListener('click', () => { location.hash = '#/app/chat'; setTimeout(() => openOutboundLedger(), 0); });

  renderThermalLanding();

  // Poll staleness alerts every 30 seconds

  setInterval(checkStalenessAlerts, 30000);

  document.addEventListener('click', event => {

    if (!event.target.closest('.profile-menu-wrap')) closeProfileMenu();

    if (!event.target.closest('.vault-actions-wrap')) closeVaultActions();

  });

  initializeTourChecklist();

  document.addEventListener('keydown', event => {

    if (event.key === 'Escape') { closeProfileMenu(); closeVaultActions(); if (!document.getElementById('graph-node-details')?.hidden) closeGraphDetails(); }

    if (document.getElementById('view-graph')?.classList.contains('active') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {

      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomGraph(1.2); }

      else if (event.key === '-') { event.preventDefault(); zoomGraph(.83); }

      else if (event.key === '0') { event.preventDefault(); resetGraphView(); }

    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openV4CommandPalette(); }

    if (event.key === '?' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { event.preventDefault(); openV4Shortcuts(); }

    if (!event.ctrlKey && !event.metaKey && !event.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && document.getElementById('view-agent')?.classList.contains('active')) {

      const focusedAlert = document.activeElement?.closest('.alert-card');

      const key = event.key.toLowerCase();

      const action = key === 'r' ? 'Reaffirm Freshness' : key === 'c' ? 'Correct Fact' : key === 'f' ? 'Forget' : '';

      const button = action && focusedAlert ? [...focusedAlert.querySelectorAll('button')].find(item => item.textContent.includes(action)) : null;

      if (button && !button.disabled) { event.preventDefault(); button.click(); }

    }

  });

});

window.addEventListener('hashchange', applyHashRoute);

function applyHashRoute() {

  const marketing = document.getElementById('marketing-site');

  const landing = document.getElementById('thermal-landing');

  const header = document.querySelector('.app-header');

  const consoleMain = document.querySelector('body > main.app-container');

  if (!marketing || !header || !consoleMain || !landing) return;

  const styleguide = document.getElementById('styleguide-site');

  const notFound = document.getElementById('thermal-not-found');

  const previewParams = new URLSearchParams(location.search);

  const hasPreview = previewParams.has('preview');

  const previewSlug = previewParams.get('preview');

  const preview = previewSlug ? previewVariants[previewSlug] : null;

  const rawHash = (location.hash || '').slice(1);

  const decodedAnchor = (() => { try { return decodeURIComponent(rawHash); } catch { return rawHash; } })();

  const knownLandingAnchor = rawHash && !rawHash.startsWith('/') && document.getElementById(decodedAnchor);

  const previewAnchor = (preview && rawHash && !rawHash.startsWith('/')) || (!hasPreview && knownLandingAnchor) ? rawHash : '';

  const route = hasPreview && !preview

    ? '/__unknown_preview__'

    : previewAnchor

      ? (preview?.route || '/')

      : (rawHash || '/').split('?')[0];

  const infoRoutes = ['/status', '/changelog', '/privacy-and-licence'];

  if (infoRoutes.includes(route)) {

    marketing.hidden = true; landing.hidden = true; if (styleguide) styleguide.hidden = true;

    if (notFound) notFound.hidden = true; header.hidden = true; consoleMain.hidden = true;

    document.body.classList.remove('styleguide-paper-grain', 'thermal-app-page');

    document.body.classList.add('thermal-landing-page');

    renderV4InfoRoute(route);

    return;

  }

  document.getElementById('v4-info-page')?.setAttribute('hidden', '');

  if (styleguide && route === '/styleguide') {

    marketing.hidden = true;

    landing.hidden = true;

    if (notFound) notFound.hidden = true;

    header.hidden = true;

    consoleMain.hidden = true;

    styleguide.hidden = false;

    document.body.classList.add('styleguide-paper-grain');

    document.title = 'RECEIPTS — Type & Stock';

    renderThermalStyleguide();

    return;

  }

  if (styleguide) styleguide.hidden = true;

  if (notFound) notFound.hidden = true;

  document.body.classList.remove('styleguide-paper-grain');

  const match = route.match(/^\/app\/(chat|vault|graph|copilot|tour)$/);

  if (route === '/' || route === '') {

    const landingWasVisible = !landing.hidden;

    const activeModal = document.querySelector('.modal-overlay.active');

    if (activeModal) closeModal(activeModal.id);

    marketing.hidden = true;

    landing.hidden = false;

    header.hidden = true;

    consoleMain.hidden = true;

    document.body.classList.remove('thermal-app-page');

    document.body.classList.add('thermal-landing-page');

    document.title = preview?.title || 'RECEIPTS — Ask your AI for the receipt';

    if (!landingWasVisible) renderThermalLanding();

    if (previewAnchor) {

      let anchorId = previewAnchor;

      try { anchorId = decodeURIComponent(previewAnchor); } catch {}

      requestAnimationFrame(() => document.getElementById(anchorId)?.scrollIntoView({

        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',

        block: 'start'

      }));

    }

    return;

  }

  if (!match) {

    const activeModal = document.querySelector('.modal-overlay.active');

    if (activeModal) closeModal(activeModal.id);

    marketing.hidden = true;

    landing.hidden = true;

    if (notFound) notFound.hidden = false;

    header.hidden = true;

    consoleMain.hidden = true;

    document.title = 'RECEIPTS — Paper jam';

    return;

  }

  marketing.hidden = true;

  landing.hidden = true;

  header.hidden = false;

  consoleMain.hidden = false;

  document.body.classList.remove('thermal-landing-page');

  document.body.classList.add('thermal-app-page');

  const titleName = match[1] === 'copilot' ? 'Copilot' : match[1][0].toUpperCase() + match[1].slice(1);

  document.title = `RECEIPTS — ${titleName}`;

  switchView(match[1] === 'copilot' ? 'agent' : match[1], { syncHash: false });

}

function renderThermalLanding() {

  const printed = document.getElementById('landing-printed-time');

  if (printed) printed.textContent = `PRINTED · ${new Intl.DateTimeFormat('en', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date()).toUpperCase()}`;

  const mem = allMemories[0];

  const heroReceipt = document.getElementById('landing-hero-receipt');

  if (heroReceipt && mem) {

    const status = mem.status === 'decaying' ? 'FADING' : String(mem.status || 'unavailable').toUpperCase();

    const statusClass = mem.status === 'decaying' ? 'is-fading' : `is-${mem.status}`;

    const hash = String(mem.receipt_hash || mem.content_hash || mem.source_hash || '');

    const confidence = Math.round(Number(mem.current_confidence || 0) * 100);

    heroReceipt.innerHTML = `<div class="hero-receipt-head"><span>#${escapeHtml(mem.id)}</span><span class="thermal-stamp ${statusClass}">${escapeHtml(status)} · ${confidence}%</span></div><p class="hero-receipt-fact">${escapeHtml(mem.content || 'Saved fact unavailable.')}</p><div class="hero-receipt-meta"><span>${escapeHtml(String(mem.category || 'RECORD').replaceAll('_', ' ').toUpperCase())}</span><span>SHA · ${escapeHtml(hash.slice(0, 10) || 'UNAVAILABLE')}</span></div><p class="hero-receipt-source">SOURCE · ${escapeHtml(mem.source_title || 'Source unavailable')}</p>`;

  } else if (heroReceipt) {

    heroReceipt.innerHTML = '<p>No saved receipt is available.</p>';

  }

  const footer = document.getElementById('landing-footer-barcode');

  if (footer && mem) footer.innerHTML = generateBarcodeSvg(mem.receipt_hash || mem.content_hash || mem.source_hash || mem.id || '');

  renderLandingReceiptTicker();

  if (mem) renderLandingSample(mem, 'What do I need to remember?');

  renderVaultDayScrub();

  renderReceiptsSpecSheet();

  loadLandingOutboundPreview();

}

const v4DecayHalfLife = { lifestyle_preference: 90, active_project: 21, transient_state: 7 };

const dayStoryBeats = [

  { day: 0, caption: 'A fact arrives. It gets a receipt.' },

  { day: 7, caption: 'Time passes. The ink fades.' },

  { day: 14, caption: 'A newer fact disagrees.' },

  { day: 26, caption: 'Nobody confirms the old one. It goes stale.' },

  { day: 30, caption: 'You reaffirm what’s true.' },

];

function renderVaultDayScrub() {

  const root = document.getElementById('vault-day-scrub');

  if (!root) return;

  const oldRecord = allMemories.find(item => item.id === 'REC-PST4') || allMemories.find(item => /Seattle/i.test(item.content || ''));

  const newRecord = allMemories.find(item => item.id === 'REC-AUS7') || allMemories.find(item => /Austin/i.test(item.content || '')) || {

    id:'REC-AUS7', content:'User moved to Austin, Texas and now operates on Central Time (CST/CDT, UTC-6/UTC-5).',

    source_title:'Example seed conflict · Austin update', source_excerpt:'I moved to Austin, Texas; please use Central Time for scheduling.',

  };

  if (!oldRecord) {

    root.innerHTML = '<p class="redline-empty">The Seattle receipt needed for this illustrative timeline is not in the loaded vault.</p>';

    return;

  }

  const oldHash = String(oldRecord.receipt_hash || oldRecord.content_hash || oldRecord.source_hash || '');

  const newHash = String(newRecord.receipt_hash || newRecord.content_hash || newRecord.source_hash || '');

  root.innerHTML = `<div class="day-vault-live-receipts">

    <article class="day-paper day-paper-old" id="day-receipt-old"><header><span>RECEIPT A · #${escapeHtml(oldRecord.id)}</span><span id="day-old-stamp" class="thermal-stamp is-fresh">FRESH</span></header><p class="day-paper-source">${escapeHtml(oldRecord.source_title || 'SOURCE · UNAVAILABLE')} · ${escapeHtml(String(oldRecord.created_at || '').slice(0,10))}</p><div class="day-old-ink" id="day-old-ink"><p class="day-old-fact" id="day-old-fact">${escapeHtml(oldRecord.content)}</p><span class="day-redline" aria-hidden="true"></span><span class="day-bleach" aria-hidden="true"></span></div><div class="day-paper-meter"><span id="day-old-confidence">95%</span><i><b id="day-old-bar"></b></i><small>CONFIDENCE</small></div><p class="day-paper-quote">“${escapeHtml(oldRecord.source_excerpt || 'Source excerpt unavailable.')}”</p>${oldHash ? generateBarcodeSvg(oldHash) : '<p class="thermal-hash-unavailable">SHA-256 · UNAVAILABLE</p>'}<code>SHA-256 · ${escapeHtml(oldHash.slice(0,24) || 'UNAVAILABLE')}</code></article>

    <div class="day-conflict-tag" id="day-conflict-tag" hidden>CONFLICT</div>

    <article class="day-paper day-paper-new" id="day-receipt-new" hidden><header><span>EXAMPLE SEED · #${escapeHtml(newRecord.id)}</span><span id="day-new-stamp" class="thermal-stamp is-fresh">FRESH</span></header><p class="day-paper-source">${escapeHtml(newRecord.source_title || 'SOURCE · UNAVAILABLE')} · ${escapeHtml(String(newRecord.created_at || '').slice(0,10))}</p><p class="day-new-fact" id="day-new-fact">${escapeHtml(newRecord.content)}</p><div class="day-paper-meter"><span>100%</span><i><b></b></i><small>CONFIDENCE</small></div><p class="day-paper-quote">“${escapeHtml(newRecord.source_excerpt || 'Source excerpt unavailable.')}”</p>${newHash ? generateBarcodeSvg(newHash) : '<p class="thermal-hash-unavailable">SHA-256 · UNAVAILABLE</p>'}<code>SHA-256 · ${escapeHtml(newHash.slice(0,24) || 'EXAMPLE SEED · HASH GENERATED ON SAVE')}</code></article>

    </div><div class="day-vault-static-beats">${dayStoryBeats.map(beat => `<article><strong>DAY ${String(beat.day).padStart(2,'0')}</strong><p>${escapeHtml(beat.caption)}</p></article>`).join('')}</div>`;

  const slider = document.getElementById('vault-day-range');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const updateDay = value => {

    const day = Math.max(0, Math.min(30, Math.round(Number(value))));

    const confidence = 95 * Math.pow(.5, day / 14);

    const status = confidence >= 75 ? 'FRESH' : confidence >= 40 ? 'FADING' : 'STALE';

    const oldStamp = document.getElementById('day-old-stamp');

    const oldInk = document.getElementById('day-old-ink');

    const newReceipt = document.getElementById('day-receipt-new');

    const newFact = document.getElementById('day-new-fact');

    document.getElementById('day-counter').textContent = `DAY ${String(day).padStart(2,'0')}`;

    document.getElementById('day-old-confidence').textContent = `${Math.round(confidence)}%`;

    document.getElementById('day-old-bar').style.width = `${confidence}%`;

    document.getElementById('day-old-fact').style.opacity = String(Math.max(.55, confidence / 100));

    oldInk.style.setProperty('--bleach-opacity', String((1 - confidence / 100) * .5));

    oldInk.classList.toggle('is-superseded', day >= 14);

    oldStamp.textContent = status;

    oldStamp.className = `thermal-stamp ${status === 'FRESH' ? 'is-fresh' : status === 'FADING' ? 'is-fading' : 'is-stale'}`;

    newReceipt.hidden = day < 14;

    document.getElementById('day-conflict-tag').hidden = day < 14;

    if (day >= 30) newFact.classList.add('is-reaffirmed'); else newFact.classList.remove('is-reaffirmed');

    document.getElementById('day-new-stamp').textContent = day >= 30 ? 'REAFFIRMED' : 'FRESH';

    document.getElementById('day-new-stamp').className = `thermal-stamp ${day >= 30 ? 'is-reaffirmed' : 'is-fresh'}`;

    const beat = [...dayStoryBeats].reverse().find(item => day >= item.day) || dayStoryBeats[0];

    document.getElementById('day-vault-caption').textContent = beat.caption;

    document.querySelectorAll('.day-vault-beats li').forEach(node => {

      const beatDay = Number(node.dataset.day);

      node.classList.toggle('is-active', beatDay === beat.day);

      node.classList.toggle('is-past', beatDay < beat.day);

    });

    if (slider && Number(slider.value) !== day) slider.value = String(day);

  };

  slider?.addEventListener('input', () => updateDay(slider.value));

  window.receiptDayStoryUpdate = updateDay;

  updateDay(slider?.value || 0);

  if (!window.receiptDayStoryScrollBound) {

    window.receiptDayStoryScrollBound = true;

    let scheduled = false;

    window.addEventListener('scroll', () => {

      if (scheduled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      scheduled = true;

      requestAnimationFrame(() => {

        scheduled = false;

        const section = document.getElementById('day-in-vault');

        const update = window.receiptDayStoryUpdate;

        if (!section || !update) return;

        const top = section.getBoundingClientRect().top + window.scrollY;

        const travel = Math.max(1, section.offsetHeight - window.innerHeight);

        update(Math.round(Math.max(0, Math.min(1, (window.scrollY - top) / travel)) * 30));

      });

    }, { passive:true });

  }

}

async function renderReceiptsSpecSheet() {

  const root = document.getElementById('receipts-spec-sheet');

  if (!root) return;

  try {

    const response = await fetch('/api/engine-status');

    const engine = response.ok ? await response.json() : {};

    const rows = [

      ['API framework', 'FastAPI'], ['Vault storage', 'SQLite · local vault'],

      ['Sync encryption', 'AES-256-GCM'], ['Inference provider', engine.provider || 'Nebius Token Factory'],

      ['Chat model ID', engine.chat_model || 'Unavailable'], ['Extraction model ID', engine.extract_model || 'Unavailable'],

      ['Active endpoint', engine.active_endpoint || 'Unavailable'],

      ['Bundled fonts', 'Bricolage Grotesque · Instrument Sans · IBM Plex Mono · Newsreader'],

      ['Font licences', 'SIL Open Font Licence notices included in static/fonts/'],

      ['Open Graph card', '/static/brand/og-receipts.svg'],

      ['Project licence', 'MIT · see /LICENSE']

    ];

    root.innerHTML = rows.map(([label, value]) => ['Chat model ID', 'Extraction model ID'].includes(label) && value !== 'Unavailable'

      ? `<div class="spec-row"><span>${escapeHtml(label)}</span><button type="button" class="spec-copy-button" data-copy-value="${escapeHtml(value)}" aria-label="Copy ${escapeHtml(label)}">${escapeHtml(value)}<span aria-hidden="true"> · COPY</span></button></div>`

      : `<div class="spec-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('');

    observeLandingSpecRows(root);

  } catch {

    root.innerHTML = '<p>Engine configuration could not be read. No service status is inferred.</p>';

  }

}

function observeLandingSpecRows(root) {

  if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;

  const rows=[...root.querySelectorAll('.spec-row')];

  if(!rows.length)return;

  root.classList.add('is-animated');

  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.15});

  rows.forEach(row=>observer.observe(row));

}

function openV4CommandPalette() {

  openV4Overlay('RECEIPTS · JUMP TO', [

    ['Chat', '#/app/chat'], ['Vault', '#/app/vault'], ['Graph', '#/app/graph'],

    ['Copilot', '#/app/copilot'], ['Tour', '#/app/tour'], ['Status', '#/status'],

    ['Changelog', '#/changelog'], ['Privacy & licence', '#/privacy-and-licence']

  ], 'command');

}

function openV4Shortcuts() {

  openV4Overlay('KEYBOARD SHORTCUTS', [['⌘ / Ctrl + K', 'Open this command palette'], ['?', 'Show keyboard shortcuts'], ['Esc', 'Close the active overlay']], 'shortcuts');

}

function openV4Overlay(title, entries, kind) {

  document.getElementById('v4-quick-overlay')?.remove();

  const overlay = document.createElement('div');

  overlay.id = 'v4-quick-overlay'; overlay.className = 'v4-quick-overlay'; overlay.setAttribute('role', 'presentation');

  overlay.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="v4-quick-title" class="v4-quick-panel"><header><p id="v4-quick-title">${escapeHtml(title)}</p><button type="button" aria-label="Close">Esc</button></header>${kind === 'command' ? '<input type="search" aria-label="Filter destinations" placeholder="Type a destination…" autofocus>' : ''}<div class="v4-quick-items">${entries.map(([label, target]) => kind === 'command' ? `<a href="${target}">${escapeHtml(label)}<span>↗</span></a>` : `<p><b>${escapeHtml(label)}</b><span>${escapeHtml(target)}</span></p>`).join('')}</div></section>`;

  document.body.append(overlay);

  const close = () => overlay.remove();

  overlay.querySelector('button')?.addEventListener('click', close);

  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });

  document.addEventListener('keydown', function escapeHandler(event) { if (event.key === 'Escape' && document.body.contains(overlay)) { close(); document.removeEventListener('keydown', escapeHandler); } });

  overlay.querySelector('input')?.focus();

  overlay.querySelector('input')?.addEventListener('input', event => overlay.querySelectorAll('.v4-quick-items a').forEach(link => { link.hidden = !link.textContent.toLowerCase().includes(event.target.value.toLowerCase()); }));

}

function renderV4InfoRoute(route) {

  let page = document.getElementById('v4-info-page');

  if (!page) { page = document.createElement('main'); page.id = 'v4-info-page'; page.className = 'v4-info-page'; document.body.append(page); }

  const title = route === '/status' ? 'System status' : route === '/changelog' ? 'Change docket' : 'Privacy & licence';

  const content = route === '/status'

    ? '<div id="v4-status-facts"><p>Reading the local health and engine status endpoints…</p></div><a href="#/app/chat">Return to console ↗</a>'

    : route === '/changelog'

      ? '<p>Recent repository changes, copied from the local Git history at this build.</p><div id="v4-changelog-list">Loading repository history…</div>'

      : '<p>Receipts stores the local vault in SQLite. When a request is made, selected context may be sent to the configured inference provider; Tavily receives searches only when requested. Review the outbound ledger from the console.</p><p>The interface display fonts are distributed with SIL Open Font Licence notices in <code>static/fonts/</code>. The repository is distributed under MIT; see <a href="/LICENSE">LICENSE</a>.</p><a href="#/app/chat">Return to console ↗</a>';

  page.hidden = false; page.innerHTML = `<a class="v4-info-back" href="#/">RECEIPTS · HOME</a><p class="thermal-kicker">BUILD RECORD</p><h1>${escapeHtml(title)}</h1><div class="v4-info-content">${content}</div>`;

  document.title = `RECEIPTS — ${title}`;

  if (route === '/changelog') renderV4Changelog();

  if (route === '/status') renderV4Status();

}

async function renderV4Changelog() {

  const target = document.getElementById('v4-changelog-list');

  if (!target) return;

  try {

    const response = await fetch('/static/CHANGELOG.md');

    if (!response.ok) throw new Error('History file unavailable');

    const history = await response.text();

    target.innerHTML = `<pre class="v4-history">${escapeHtml(history)}</pre>`;

  } catch { target.textContent = 'Repository history is unavailable in this app build.'; }

}

async function renderV4Status() {

  const target = document.getElementById('v4-status-facts');

  if (!target) return;

  const [healthResult, engineResult] = await Promise.allSettled([fetch('/health'), fetch('/api/engine-status')]);

  let health = 'Unavailable'; let engine = null;

  try { const response = healthResult.value; if (response.ok) { const data = await response.json(); health = data.status || 'Reachable'; } } catch {}

  try { const response = engineResult.value; if (response.ok) engine = await response.json(); } catch {}

  target.innerHTML = `<div class="spec-row"><span>Local app health</span><b>${escapeHtml(String(health))}</b></div><div class="spec-row"><span>Inference configuration</span><b>${engine?.has_api_key ? 'Configured · reachability not verified' : 'No API key configured'}</b></div><div class="spec-row"><span>Configured model</span><b>${escapeHtml(engine?.chat_model || 'Unavailable')}</b></div><p>Credentials alone do not prove that a live provider request will succeed.</p>`;

}

async function loadLandingOutboundPreview() {

  const target = document.getElementById('landing-outbound-preview');

  if (!target) return;

  const badge = document.getElementById('landing-outbound-source');

  try {

    const response = await fetch('/api/outbound-ledger?limit=4');

    if (!response.ok) throw new Error('Outbound ledger unavailable');

    const payload = await response.json();

    const entries = payload.requests || payload.entries || payload.items || [];

    if (!entries.length) { if (badge) badge.textContent='EXAMPLE · NO REQUESTS RECORDED'; target.innerHTML = '<p class="thermal-example-note">EXAMPLE · No outbound requests have been recorded yet.</p>'; return; }

    if (badge) badge.textContent='RECORDED REQUESTS';

    target.innerHTML = entries.slice(0, 4).map(entry => `<div class="thermal-ledger-row"><span>${escapeHtml(entry.purpose || entry.request_type || entry.model || 'REQUEST')}</span><i></i><span>${escapeHtml(entry.status || entry.outcome || 'recorded')}</span><time>${escapeHtml(entry.created_at || entry.timestamp || '')}</time></div>`).join('');

    observeOutboundRows(target);

  } catch {

    if (badge) badge.textContent='EXAMPLE · SERVICE UNAVAILABLE';

    target.innerHTML = '<p class="thermal-example-note">EXAMPLE · Recorded request details are unavailable in this view.</p>';

  }

}

function observeOutboundRows(root) {

  const rows=[...root.querySelectorAll('.thermal-ledger-row')];

  if(!rows.length)return;

  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver' in window)){rows.forEach(row=>row.classList.add('is-typed'));return;}

  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-typed');observer.unobserve(entry.target);}}),{threshold:.2});

  rows.forEach(row=>observer.observe(row));

}

function renderLandingReceiptTicker() {

  const root = document.getElementById('landing-receipt-ticker');

  if (!root) return;

  if (!allMemories.length) { root.innerHTML='<p>No saved receipt summaries are available.</p>'; return; }

  const entries = allMemories.slice(0, 6).map(memory => {

    const status = memory.status === 'decaying' ? 'FADING' : String(memory.status || 'RECORDED').toUpperCase();

    return `<span class="ticker-receipt"><b>#${escapeHtml(memory.id)}</b><i>${escapeHtml(status)}</i><strong>${Math.round(Number(memory.current_confidence || 0) * 100)}%</strong></span>`;

  }).join('');

  root.innerHTML=`<div class="thermal-ticker-track">${entries}${entries}</div>`;

}

function configureLandingLinks() {

  const linkValues = { github:landingLinkConfig.githubUrl, devpost:landingLinkConfig.devpostUrl, demoVideo:landingLinkConfig.demoVideoUrl };

  Object.entries(linkValues).forEach(([name,url]) => {

    const link=document.querySelector(`[data-landing-link="${name}"]`);

    if (link && /^https:\/\//i.test(String(url||''))) { link.href=url; link.target='_blank'; link.rel='noopener noreferrer'; link.hidden=false; }

  });

  const demoUrl=String(landingLinkConfig.demoUrl||'');

  const demo=document.getElementById('landing-demo-link');

  if (demo && /^https:\/\//i.test(demoUrl)) { demo.href=demoUrl; demo.target='_blank'; demo.rel='noopener noreferrer'; demo.hidden=false; }

  const videoUrl=String(landingLinkConfig.demoVideoUrl||'');

  const video=document.getElementById('demo-video');

  if (video && /^https:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\//i.test(videoUrl)) {

    video.hidden=false;

    video.innerHTML=`<h2>Watch the demo</h2><iframe loading="lazy" title="Receipts product demo" src="${escapeHtml(videoUrl)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;

  }

}

function initializeLandingScrollExperience() {

  const landing=document.getElementById('thermal-landing');

  if (!landing || landing.dataset.scrollReady) return;

  landing.dataset.scrollReady='true';

  const header=landing.querySelector('.thermal-letterhead');

  const progress=document.getElementById('landing-scroll-progress');

  let frame=false;

  const updateScroll=()=>{

    frame=false;

    const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);

    if(progress) progress.style.transform=`scaleX(${Math.min(1,window.scrollY/max)})`;

    header?.classList.toggle('is-compact',window.scrollY>80);

  };

  window.addEventListener('scroll',()=>{if(!frame){frame=true;requestAnimationFrame(updateScroll);}},{passive:true});

  updateScroll();

  const navLinks=[...landing.querySelectorAll('.thermal-letterhead nav a[href^="#"]')];

  if ('IntersectionObserver' in window) {

    const sectionObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{

      if(!entry.isIntersecting)return;

      navLinks.forEach(link=>{

        const active=link.hash===`#${entry.target.id}`;

        link.classList.toggle('is-active',active);

        if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');

      });

    }),{rootMargin:'-22% 0px -68% 0px',threshold:0});

    ['itemized','day-in-vault','data-ledger','spec-sheet','notes'].forEach(id=>{const section=document.getElementById(id);if(section)sectionObserver.observe(section);});

    const rows=[...landing.querySelectorAll('.itemized-row')];

    const tape=document.getElementById('itemized-tape-lines');

    const total=document.getElementById('itemized-tape-total');

    const seen=new Set();

    const paintTape=()=>{

      tape.innerHTML=[...seen].sort((a,b)=>a-b).map(index=>`<span><b>${escapeHtml(rows[index].querySelector('h3').textContent)}</b><i></i><small>${String(index+1).padStart(2,'0')}</small></span>`).join('');

      total.textContent=String(seen.size);

    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { rows.forEach((_,index)=>seen.add(index)); paintTape(); }

    else { const rowObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){seen.add(rows.indexOf(entry.target));entry.target.classList.add('is-seen');paintTape();rowObserver.unobserve(entry.target);}}),{threshold:.25}); rows.forEach(row=>rowObserver.observe(row)); }

    const coupon=landing.querySelector('.thermal-coupon');

    if(coupon&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&!CSS.supports('animation-timeline:view()')){

      if('IntersectionObserver' in window){const couponObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){coupon.classList.add('is-revealed');couponObserver.disconnect();}}),{threshold:.25});couponObserver.observe(coupon);}

      else coupon.classList.add('is-revealed');

    }

  }

  landing.addEventListener('click',async event=>{

    const button=event.target.closest('.spec-copy-button');

    if(!button)return;

    try{await navigator.clipboard.writeText(button.dataset.copyValue);button.dataset.originalLabel=button.textContent;button.lastElementChild.textContent=' · COPIED';setTimeout(()=>{if(button.lastElementChild)button.lastElementChild.textContent=' · COPY';},1200);}catch{showToast('Clipboard access is unavailable in this browser.','error');}

  });

}

async function submitLandingPrinter(event) {

  event.preventDefault();

  const input = document.getElementById('landing-printer-input');

  const target = document.getElementById('landing-printer-output');

  const status = document.getElementById('printer-status-label');

  const query = input?.value.trim();

  if (!query || !target || !status) return;

  const button = event.currentTarget.querySelector('button[type="submit"]');

  button.disabled = true;

  input.disabled = true;

  status.textContent = 'PRINTING';

  target.innerHTML = '<div class="thermal-empty-slip thermal-printing"><span>WARMING THE PRINTER…</span><p>Your question is being sent to the configured assistant.</p></div>';

  try {

    const response = await fetch('/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, include_stale: false, max_receipts: 4 }) });

    if (!response.ok) throw new Error('Request unavailable');

    const data = await response.json();

    noteModelCallResult(data);

    if (data.is_simulated || data.degraded_message || !lastNebiusCallSucceeded) {

      const memory = data.used_receipts?.[0] && allMemories.find(item => item.id === data.used_receipts[0].id);

      if (memory) renderLandingSample(memory, query);

      else renderLandingSlip(data, query, false, true);

      status.textContent = 'SAMPLE · OFFLINE';

    } else {

      renderLandingSlip(data, query, false);

      status.textContent = 'LIVE · PRINTED';

    }

  } catch (error) {

    if (!allMemories.length) {

      try {

        const memoriesResponse = await fetch('/api/memories');

        if (memoriesResponse.ok) allMemories = await memoriesResponse.json();

      } catch {}

    }

    const memory = allMemories[0];

    if (memory) {

      renderLandingSample(memory, query);

      status.textContent = 'SAMPLE · OFFLINE';

    } else {

      target.innerHTML = '<div class="thermal-error-slip"><strong>SAMPLE UNAVAILABLE</strong><p>The assistant could not respond, and no saved receipt is available to print.</p></div>';

      status.textContent = 'SAMPLE UNAVAILABLE';

    }

  } finally {

    button.disabled = false;

    input.disabled = false;

    input.focus();

  }

}

function renderLandingSlip(data, query, printing, localFallback = false) {

  const target = document.getElementById('landing-printer-output');

  if (!target) return;

  const citations = (data.used_receipts || []).map(receipt => `<div class="thermal-ledger-row"><button type="button" onclick="inspectReceipt('${escapeHtml(receipt.id)}')">${escapeHtml(receipt.id)}</button><i></i><span>${Math.round((receipt.current_confidence || 0) * 100)}% · ${escapeHtml(receipt.status || 'recorded')}</span></div>`).join('');

  const answer = escapeHtml(data.answer || 'No answer text was returned.');

  const memory = data.used_receipts?.[0] && allMemories.find(item => item.id === data.used_receipts[0].id);

  const barcode = memory?.receipt_hash || memory?.content_hash || memory?.source_hash;

  const weighted = data.weighted_confidence == null ? '—' : `${Math.round(Number(data.weighted_confidence) * (Number(data.weighted_confidence) <= 1 ? 100 : 1))}%`;

  target.innerHTML = `<article class="thermal-printed-slip"><header><span>RECEIPTS · LEDGER COPY</span><span class="thermal-stamp ${localFallback ? 'thermal-stamp-blue' : 'is-fresh'}">${localFallback ? 'SAMPLE · OFFLINE' : 'LIVE'}</span></header><p class="thermal-printed-time">${escapeHtml(new Intl.DateTimeFormat('en', { weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date()).toUpperCase())}</p><p class="thermal-query">Q: ${escapeHtml(query)}</p><p class="thermal-answer">${answer}${printing ? '<span class="thermal-cursor" aria-hidden="true">▌</span>' : ''}</p><section class="thermal-slip-citations"><span>ITEMS USED</span>${citations || '<p class="thermal-no-citations">No saved receipts were cited.</p>'}</section><p class="thermal-weighted-confidence">WEIGHTED CONFIDENCE ${weighted}</p>${barcode ? generateBarcodeSvg(barcode) : '<p class="thermal-hash-unavailable">BARCODE · HASH UNAVAILABLE</p>'}<footer class="thermal-printer-meta"><span>MODEL · ${escapeHtml(data.model_used || '—')}</span><span>TOKENS · ${data.input_tokens ?? '—'} / ${data.output_tokens ?? '—'}</span><span>LATENCY · ${data.latency_ms == null ? '—' : `${data.latency_ms} ms`}</span><span>${localFallback ? 'SAMPLE · OFFLINE' : 'LIVE'}</span></footer></article>`;

}

function renderLandingSample(memory, query) {

  const target = document.getElementById('landing-printer-output');

  if (!target) return;

  const hash = String(memory.receipt_hash || memory.content_hash || memory.source_hash || '');

  const confidence = Math.round(Number(memory.current_confidence || 0) * 100);

  const status = memory.status === 'decaying' ? 'FADING' : String(memory.status || 'unavailable').toUpperCase();

  target.innerHTML = `<article class="thermal-printed-slip thermal-hero-receipt thermal-sample-slip"><header><span>RECEIPTS · LEDGER COPY</span><span class="thermal-stamp ${memory.status === 'stale' ? 'is-stale' : memory.status === 'decaying' ? 'is-fading' : 'is-fresh'}">${escapeHtml(status)}</span></header><p class="thermal-printed-time">${escapeHtml(String(memory.created_at || 'DATE · UNAVAILABLE').slice(0, 24))}</p><p class="thermal-query">Q: ${escapeHtml(query)}</p><p class="thermal-answer">${escapeHtml(memory.content || 'Saved receipt text unavailable.')}</p><section class="thermal-slip-citations"><span>ITEMS USED</span><div class="thermal-ledger-row"><span>${escapeHtml(memory.id)}</span><i></i><span>${confidence}% · ${escapeHtml(status)}</span></div></section><p class="thermal-weighted-confidence">WEIGHTED CONFIDENCE ${confidence}%</p>${hash ? generateBarcodeSvg(hash) : '<p class="thermal-hash-unavailable">BARCODE · HASH UNAVAILABLE</p>'}<footer class="thermal-printer-meta"><span>MODEL · —</span><span>TOKENS · —</span><span>LATENCY · —</span><span>SAMPLE · OFFLINE</span></footer></article>`;

}

function toggleProfileMenu() {

  const menu = document.getElementById('profile-menu');

  const trigger = document.getElementById('profile-menu-trigger');

  if (!menu || !trigger) return;

  menu.hidden = !menu.hidden;

  trigger.setAttribute('aria-expanded', String(!menu.hidden));

}

function closeProfileMenu() {

  const menu = document.getElementById('profile-menu');

  const trigger = document.getElementById('profile-menu-trigger');

  if (!menu || !trigger || menu.hidden) return;

  menu.hidden = true;

  trigger.setAttribute('aria-expanded', 'false');

}

function toggleVaultActions() {

  const menu=document.getElementById('vault-actions-menu');

  const trigger=document.querySelector('.vault-actions-wrap>[aria-controls="vault-actions-menu"]');

  if(!menu||!trigger)return;

  menu.hidden=!menu.hidden;

  trigger.setAttribute('aria-expanded',String(!menu.hidden));

}

function closeVaultActions() {

  const menu=document.getElementById('vault-actions-menu');

  const trigger=document.querySelector('.vault-actions-wrap>[aria-controls="vault-actions-menu"]');

  if(!menu||!trigger)return;

  menu.hidden=true;

  trigger.setAttribute('aria-expanded','false');

}

// Navigation View Switcher

function switchView(viewName, { syncHash = true } = {}) {

  if (syncHash) {

    const routeName = viewName === 'agent' ? 'copilot' : viewName;

    const nextHash = `#/app/${routeName}`;

    if (location.hash !== nextHash) location.hash = nextHash;

  }

  const titleView = viewName === 'agent' ? 'Copilot' : viewName[0].toUpperCase() + viewName.slice(1);

  document.title = `RECEIPTS — ${titleView}`;

  const activeModal = document.querySelector('.modal-overlay.active');

  if (activeModal) closeModal(activeModal.id);

  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

  document.querySelectorAll('.nav-tab-btn').forEach(el => el.classList.remove('active'));

  const viewEl = document.getElementById(`view-${viewName}`);

  const btnEl = document.getElementById(`tab-btn-${viewName}`);

  if (viewEl) viewEl.classList.add('active');

  if (btnEl) btnEl.classList.add('active');

  if (viewName === 'vault') {

    fetchMemories();

  } else if (viewName === 'graph') {

    requestAnimationFrame(() => reloadMemoryGraph());

  } else {
    stopGraphPhysicsSimulation();
    if (viewName === 'agent') {

    loadAgentDashboard();

  }

}

// Toast Notifications

function showToast(message, type = 'info') {

  const container = document.getElementById('toast-container');

  const toast = document.createElement('div');

  toast.className = `toast toast-${type}`;

  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {

    toast.style.opacity = '0';

    setTimeout(() => toast.remove(), 300);

  }, 3500);

}

// Modal Helpers

function openModal(id) {

  document.querySelectorAll('.modal-overlay.active').forEach(active => {

    if (active.id !== id) {

      active.classList.remove('active');

      active.removeAttribute('aria-modal');

      active.removeAttribute('role');

    }

  });

  const modal = document.getElementById(id);

  if (!modal) return;

  modalReturnFocus = document.activeElement;

  document.body.classList.add('modal-open');

  modal.classList.add('active');

  modal.setAttribute('role', 'dialog');

  modal.setAttribute('aria-modal', 'true');

  const firstFocusable = modal.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');

  firstFocusable?.focus();

}

function closeModal(id) {

  const modal = document.getElementById(id);

  if (!modal) return;

  modal.classList.remove('active');

  modal.removeAttribute('aria-modal');

  modal.removeAttribute('role');

  if (!document.querySelector('.modal-overlay.active')) {

    document.body.classList.remove('modal-open');

    if (modalReturnFocus?.focus) modalReturnFocus.focus();

    modalReturnFocus = null;

  }

}

document.addEventListener('keydown', event => {

  const modal = document.querySelector('.modal-overlay.active');

  if (!modal) return;

  if (event.key === 'Escape') {

    const closeButton = modal.querySelector('.modal-close-btn');

    if (closeButton) closeButton.click();

    else modal.classList.remove('active');

    return;

  }

  if (event.key !== 'Tab') return;

  const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]

    .filter(element => element.getClientRects().length);

  if (!focusable.length) { event.preventDefault(); modal.focus(); return; }

  const first = focusable[0];

  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }

  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }

});

// ─── Fetch Stats & Engine Status ──────────────────────────────────────────────

// Helper to format model name compactly for clean header layout

function formatModelPill(modelId) {

  if (!modelId) return 'Nemotron 120B';

  const raw = modelId.split('/').pop().toLowerCase();

  if (raw.includes('120b')) return 'Nemotron 120B';

  if (raw.includes('70b')) return 'Nemotron 70B';

  if (raw.includes('340b')) return 'Nemotron 340B';

  if (raw.includes('nano') || raw.includes('30b')) return 'Nemotron Nano';

  if (raw.includes('mini') || raw.includes('4b')) return 'Nemotron Mini';

  return raw.length > 14 ? raw.substring(0, 14) + '...' : raw;

}

async function fetchStats() {

  try {

    const res = await fetch('/api/stats');

    if (!res.ok) return;

    const data = await res.json();

    const totalEl = document.getElementById('stat-total-count');

    if (totalEl) totalEl.innerText = data.total_memories;

    const freshEl = document.getElementById('stat-fresh-count');

    if (freshEl) freshEl.innerText = data.fresh_count;

    const decayEl = document.getElementById('stat-decay-count');

    if (decayEl) decayEl.innerText = data.decaying_count;

    const staleEl = document.getElementById('stat-stale-count');

    if (staleEl) staleEl.innerText = data.stale_count;

    const navBadge = document.getElementById('nav-vault-badge');

    if (navBadge) navBadge.innerText = data.total_memories;

    const healthRatio = data.total_memories > 0 ? (data.fresh_count + data.decaying_count * 0.5) / data.total_memories : 1.0;

    const healthPct = Math.round(healthRatio * 100);

    const healthEl = document.getElementById('stat-health-pct');

    const healthRing = document.getElementById('vault-health-ring');

    if (healthEl) {

      healthEl.innerText = `${healthPct}%`;

      healthEl.style.color = healthPct > 70 ? 'var(--thermal-ledger-green)' : healthPct > 40 ? 'var(--thermal-ink-2)' : 'var(--thermal-stamp-red)';

    }

    if (healthRing) {

      const healthColor = healthPct > 70 ? 'var(--thermal-ledger-green)' : healthPct > 40 ? 'var(--thermal-ink-2)' : 'var(--thermal-stamp-red)';

      healthRing.style.setProperty('--health-value', `${healthPct}%`);

      healthRing.style.setProperty('--health-color', healthColor);

      healthRing.setAttribute('aria-label', `Vault health ${healthPct} percent`);

    }

    const dbPathLabel = document.getElementById('vault-db-path-label');

    if (dbPathLabel && data.db_path) {

      dbPathLabel.innerText = `${data.db_path} (${data.storage_size_kb} KB)`;

    }

  } catch (err) {

    // Stats are optional presentation data; keep the screen usable if they fail.

  }

}

async function fetchEngineStatus() {

  const pill = document.getElementById('engine-pill');

  const modelDisplay = document.getElementById('model-display-pill');

  const dot = document.getElementById('engine-status-dot');

  try {

    const res = await fetch('/api/engine-status');

    if (!res.ok) throw new Error('Engine status unavailable');

    const data = await res.json();

    const configured = Boolean(data.has_api_key);

    const connected = Boolean(lastNebiusCallSucceeded || (data.connection_verified && data.is_live));

    if (modelDisplay) modelDisplay.innerText = connected ? 'LIVE · Nebius' : 'OFFLINE';

    if (dot) dot.className = connected ? 'dot dot-green' : 'dot dot-amber';

    if (pill) {

      pill.title = connected ? 'Live Nebius call succeeded. Select to test connection.' : 'Local fallback: no live Nebius call yet';

      pill.setAttribute('aria-label', connected ? 'Nemotron via Nebius Token Factory, live' : 'Offline, local fallback. Select to test connection.');

      pill.onclick = openEngineModal;

      pill.classList.toggle('engine-needs-key', !configured);

    }

    // Diagnostics modal elements

    const diagProv = document.getElementById('diag-provider');

    if (diagProv) diagProv.innerText = 'Nebius Token Factory';

    const diagBase = document.getElementById('diag-base-url');

    if (diagBase) diagBase.innerText = data.active_endpoint;

    const diagChat = document.getElementById('diag-chat-model');

    if (diagChat) diagChat.innerText = data.chat_model;

    const diagExtr = document.getElementById('diag-extract-model');

    if (diagExtr) diagExtr.innerText = data.extract_model;

    const diagKey = document.getElementById('diag-key-status');

    if (diagKey) diagKey.innerText = data.has_api_key ? 'Configured · hidden' : 'Not configured';

    const diagStrict = document.getElementById('diag-strict-mode');

    if (diagStrict) diagStrict.innerText = data.strict_live_mode ? 'ENABLED (Strict Demo — No Simulations)' : 'Simulation Fallbacks Allowed';

  } catch (err) {

    if (modelDisplay) modelDisplay.innerText = 'OFFLINE';

    if (dot) dot.className = 'dot dot-amber';

    if (pill) {

      pill.title = 'Local fallback: no live Nebius call yet';

      pill.setAttribute('aria-label', 'OFFLINE · Local fallback. Select to test connection.');

    }

  }

}

function openEngineModal() {

  fetchEngineStatus();

  openModal('modal-engine');

}

async function runEngineConnectionTest() {

  const result = document.getElementById('engine-connection-result');

  if (result) result.textContent = 'Checking the configured Nebius connection…';

  try {

    const response = await fetch('/api/models');

    if (!response.ok) throw new Error('Connection check unavailable');

    await response.json();

    if (result) result.textContent = 'Nebius Token Factory responded to the model-list check. Run a model query to confirm inference.';

  } catch {

    if (result) result.textContent = 'Nebius Token Factory did not respond to the model-list check. Local fallback remains active.';

  }

}

function noteModelCallResult(data) {

  const model = String(data?.model_used || '');

  lastNebiusCallSucceeded = /Nebius Token Factory/i.test(model) && !/simulat|fallback|local/i.test(model);

  fetchEngineStatus();

}

// ─── Proactive Staleness Alerts ───────────────────────────────────────────────

async function checkStalenessAlerts() {

  try {

    const res = await fetch('/api/alerts/staleness?min_risk=medium');

    if (!res.ok) return;

    const alerts = await res.json();

    const badge = document.getElementById('agent-alerts-badge');

    const chip = document.getElementById('staleness-chip');

    const popoverText = document.getElementById('staleness-popover-text');

    const currentView = document.querySelector('.view-section.active')?.id?.replace('view-', '');

    if (alerts.length > 0) {

      stalenessAlertItems = alerts;

      const staleCount = alerts.filter(a => a.status === 'stale').length;

      const decayCount = alerts.length - staleCount;

      stalenessAlertCounts = { stale: staleCount, decaying: decayCount };

      const chipParts = [];

      if (staleCount) chipParts.push(`${staleCount} stale`);

      if (decayCount) chipParts.push(`${decayCount} decaying`);

      if (chip) {

        chip.textContent = chipParts.join(' · ');

        chip.style.display = 'inline-flex';

      }

      if (popoverText) {

        popoverText.textContent = `${staleCount} stale · ${decayCount} decaying · ${alerts.length} receipts to review`;

        popoverText.nextElementSibling?.remove();

        const list = document.createElement('ul');

        list.className = 'staleness-popover-list';

        list.setAttribute('aria-label', 'Receipts needing review');

        list.innerHTML = alerts.slice(0, 6).map(alert => `<li><strong>#${escapeHtml(alert.receipt_id)}</strong><span>${escapeHtml(alert.status)} · ${Math.round(Number(alert.current_confidence || 0) * 100)}% · ${Number(alert.days_since_confirmed || 0)}d</span></li>`).join('');

        popoverText.after(list);

      }

      if (badge) {

        badge.innerText = alerts.length;

        badge.style.display = 'inline-block';

      }

    } else {

      stalenessAlertCounts = { stale: 0, decaying: 0 };

      stalenessAlertItems = [];

      if (chip) chip.style.display = 'none';

      if (badge) badge.style.display = 'none';

    }

  } catch (err) {

    const chip = document.getElementById('staleness-chip');

    const popoverText = document.getElementById('staleness-popover-text');

    if (chip) chip.hidden = true;

    if (popoverText) popoverText.textContent = 'Alert status is unavailable. Try again later.';

  }

}

function toggleStalenessPopover(forceOpen) {

  const popover = document.getElementById('staleness-popover');

  const chip = document.getElementById('staleness-chip');

  if (!popover || !chip) return;

  const open = typeof forceOpen === 'boolean' ? forceOpen : popover.hidden;

  popover.hidden = !open;

  chip.setAttribute('aria-expanded', String(open));

}

function dismissStalenessBanner() {

  // Retained for legacy markup compatibility; alerts now live in the header popover.

}

// ─── Fetch & Render Memories Vault ────────────────────────────────────────────

async function fetchMemories() {

  try {

    let url = `/api/memories?`;

    if (currentCategory && currentCategory !== 'all') url += `category=${encodeURIComponent(currentCategory)}&`;

    if (currentStatus && currentStatus !== 'all') url += `status=${encodeURIComponent(currentStatus)}&`;

    if (currentSearch) url += `search=${encodeURIComponent(currentSearch)}&`;

    const res = await fetch(url);

    if (!res.ok) throw new Error('Failed to fetch memories');

    allMemories = await res.json();

    renderVaultGrid(allMemories);

    if ((location.hash || '').startsWith('#/styleguide')) renderThermalStyleguide(allMemories);

    renderThermalLanding();

    fetchStats();

  } catch (err) {

    showToast('Memory receipts could not be loaded. Check the local service and try again.', 'error');

  }

}

function filterVault(category, status) {

  currentCategory = category;

  currentStatus = status;

  document.querySelectorAll('.filter-group:nth-child(1) .filter-pill').forEach(btn => {

    btn.classList.toggle('active', btn.innerText.toLowerCase() === category || (category === 'all' && btn.innerText === 'All') || (category === 'factual_web' && btn.innerText === 'Web Research'));

  });

  document.querySelectorAll('.filter-group:nth-child(2) .filter-pill').forEach(btn => {

    btn.classList.toggle('active', btn.innerText.toLowerCase() === status);

  });

  fetchMemories();

}

function handleVaultSearch(e) {

  currentSearch = e.target.value.trim();

  fetchMemories();

}

function renderVaultGrid(memories) {

  const grid = document.getElementById('vault-grid');

  if (!grid) return;

  if (memories.length === 0) {

    grid.innerHTML = `

      <div class="empty-state" style="grid-column: 1 / -1; text-align:center; padding:3rem 1rem">

        <div style="font-size:2rem; margin-bottom:0.5rem">${lucideIcon('folder', 28)}</div>

        <h3>No Sovereign Receipts Found</h3>

        <p style="color:var(--thermal-ink-2); font-size:0.9rem; margin-top:0.4rem">

          Try clearing filters or add a new memory receipt above.

        </p>

      </div>

    `;

    return;

  }

  grid.innerHTML = memories.map(mem => renderReceiptCardHtml(mem)).join('');

}

function renderVaultStatusStamp(status) {

  const normalized = String(status || 'unavailable').toLowerCase();

  const state = normalized === 'decaying' ? 'fading' : normalized;

  const label = state === 'fading' ? 'FADING' : state.toUpperCase();

  const icon = state === 'fresh' ? lucideIcon('check', 13)

    : state === 'fading' ? '<svg class="ui-icon" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.4 1.4"/></svg>'

      : state === 'stale' ? lucideIcon('alert', 13) : lucideIcon('refresh', 13);

  return `<span class="vault-status-stamp is-${escapeHtml(state)}" aria-label="${escapeHtml(label)}">${state === 'stale' ? '<span class="status-stamp-hatch" aria-hidden="true"></span>' : ''}<span class="status-stamp-icon" aria-hidden="true">${icon}</span><span class="status-stamp-label">${escapeHtml(label)}</span></span>`;

}

function renderReceiptCardHtml(mem) {

  const confPct = Math.round(mem.current_confidence * 100);

  const stampAngle = ([...String(mem.id)].reduce((total, character) => total + character.charCodeAt(0), 0) % 7) - 3;

  const halfLifeDays = { lifestyle_preference: 90, active_project: 21, transient_state: 7 }[mem.decay_curve];

  const halfLife = halfLifeDays ? `${halfLifeDays}d half-life` : 'No source recorded';

  const status = String(mem.status || 'unavailable').toLowerCase();

  const statusColor = status === 'fresh' ? 'var(--lime)' : status === 'decaying' ? 'var(--severity-medium)' : 'var(--danger)';

  const sourceTitle = String(mem.source_title || '').trim();

  const sourceType = String(mem.source_type || '').trim();

  const source = [sourceTitle, sourceType].filter(Boolean).join(' · ') || 'No source recorded';

  const excerpt = String(mem.source_excerpt || '').trim() || 'No source recorded';

  const hash = String(mem.receipt_hash || '').trim();

  const createdAt = String(mem.created_at || '').trim() || 'No source recorded';

  const confirmedAt = String(mem.last_confirmed_at || '').trim() || 'No source recorded';

  const auditRows = (mem.audit_history || []).slice(-3).map(a => `

    <div class="audit-entry">

      <span class="audit-time">${a.timestamp.substring(0, 10)}</span>

      <span class="audit-action">${a.action.toUpperCase()}</span>

      <span class="audit-note">${a.reason || ''}</span>

    </div>

  `).join('');

  return `

    <details class="receipt-card thermal-ledger-entry status-${escapeHtml(status)}${status === 'superseded' ? ' status-superseded' : ''}${confPct < 40 ? ' low-confidence' : ''}${reprintingReceiptId === mem.id ? ' is-reprinting' : ''}" id="card-${escapeHtml(mem.id)}">

      <summary class="thermal-ledger-summary" data-cursor="VERIFY" style="--stamp-angle:${stampAngle}deg"><span class="receipt-id">#${escapeHtml(mem.id)}</span><span class="thermal-ledger-fact">${escapeHtml(mem.content)}</span><span class="thermal-ledger-confidence">${confPct}%</span>${renderVaultStatusStamp(status)}</summary>

      <div class="thermal-receipt-detail">

      <div class="receipt-cutout-top"></div>

      

      <!-- Receipt Header -->

      <div class="receipt-header">

        <div class="receipt-header-row">

          <span class="receipt-id">#${escapeHtml(mem.id)}</span>

        </div>

        <div class="receipt-category-tag">${escapeHtml(String(mem.category || 'No source recorded').replace('_', ' ').toUpperCase())} • ${escapeHtml(String(mem.decay_curve || 'No source recorded').replace('_', ' ').toUpperCase())}</div>

      </div>

      <!-- Receipt Fact Body -->

      <div class="receipt-body">

        <div class="receipt-fact-label">SOVEREIGN FACT STATEMENT</div>

        <div class="receipt-fact-content">${escapeHtml(mem.content)}</div>

        <!-- Literal Provenance Excerpt -->

        <div class="receipt-provenance-box">

          <div class="vault-provenance-lines">

            <div class="vault-provenance-line"><strong>SOURCE</strong><span>${escapeHtml(source)}</span>${mem.source_url ? `<a href="${escapeHtml(mem.source_url)}" target="_blank" rel="noopener noreferrer" class="source-link" title="Open source URL">${lucideIcon('external')}</a>` : ''}</div>

            <div class="vault-provenance-line"><strong>EXCERPT</strong><span class="source-quote">${escapeHtml(excerpt)}</span></div>

            <div class="vault-provenance-line"><strong>SHA-256</strong>${hash ? `<button class="provenance-hash receipt-hash" type="button" onclick="copyReceiptHash('${escapeHtml(mem.id)}')" title="Copy full SHA-256 hash">${escapeHtml(hash)}</button>` : '<span>No source recorded</span>'}</div>

            <div class="vault-provenance-line"><strong>CREATED</strong><span>${escapeHtml(createdAt)}</span></div>

            <div class="vault-provenance-line"><strong>LAST CONFIRMED</strong><span>${escapeHtml(confirmedAt)}</span></div>

            <div class="vault-provenance-line"><strong>HALF-LIFE</strong><span>${escapeHtml(halfLife)}</span></div>

          </div>

        </div>

        <!-- Freshness Decay Bar -->

        <div class="decay-bar-container">

          <div class="decay-bar-labels">

            <span>CONFIDENCE · ${Number(mem.days_since_confirmed) || 0}d since reaffirmed</span>

            <span>${confPct}% <span class="half-life-tag">${halfLife}</span></span>

          </div>

          <div class="decay-track">

            <div class="decay-fill" style="width:${confPct}%; background:${statusColor}"></div>

          </div>

        </div>

        <!-- Audit History Log -->

        ${auditRows ? `

          <div class="receipt-audit-box">

            <div class="audit-title">PROVENANCE AUDIT TRAIL</div>

            ${auditRows}

          </div>

        ` : ''}

      </div>

      <!-- Barcode & Sovereign Actions Footer -->

      <div class="receipt-footer">

        <div class="barcode-wrapper">

          ${generateBarcodeSvg(mem.receipt_hash)}

        </div>

        <div class="receipt-actions">

          <button class="btn-action btn-refresh" onclick="refreshReceiptFreshness('${mem.id}')" title="Reaffirm that this fact is still accurate to reset decay clock">

            ${lucideIcon('refresh')} Reaffirm

          </button>

          <button class="btn-action btn-correct" onclick="openCorrectionModal('${mem.id}')" title="Sovereign edit: correct this memory with auditable trail">

            ${lucideIcon('edit')} Edit

          </button>

          ${mem.source_type === 'tavily_search' ? `

            <button class="btn-action btn-verify-tavily" onclick="verifyTavilySource('${mem.id}', this)" title="Verify live web source via Tavily">

              ${lucideIcon('check')} Verify Web

            </button>

          ` : ''}

          <button class="btn-action btn-forget" onclick="forgetReceipt('${mem.id}')" title="Permanent sovereign erasure">

            ${lucideIcon('close')} Forget

          </button>

        </div>

      </div>

      <div class="receipt-cutout-bottom"></div>

      </div>

    </details>

  `;

}

function renderThermalStyleguide(memories = allMemories) {

  const card = document.getElementById('styleguide-receipt');

  const row = document.getElementById('styleguide-ledger-row');

  const reveal = document.getElementById('styleguide-reveal');

  if (!card) return;

  const memory = memories[0];

  if (!memory) {

    card.innerHTML = '<p class="styleguide-note">No saved record is available. The specimen is not filled with invented data.</p>';

    return;

  }

  const confidence = Math.round(memory.current_confidence * 100);

  if (reveal) {

    const revealHash = String(memory.receipt_hash || memory.content_hash || '');

    reveal.innerHTML = `<span>#${escapeHtml(memory.id)}</span><span>Source and hash reveal on hover or focus</span><b>VERIFY</b><span class="reveal-detail">SOURCE · ${escapeHtml(memory.source_title || 'unavailable')} · SHA-256 · ${escapeHtml(revealHash.slice(0, 16) || 'unavailable')}</span>`;

  }

  const state = memory.status === 'decaying' ? 'fading' : memory.status;

  const stampName = state === 'fresh' ? 'FRESH' : state === 'stale' ? 'STALE' : 'FADING';

  const seed = [...String(memory.id)].reduce((sum, character) => sum + character.charCodeAt(0), 0);

  const angle = (seed % 7) - 3;

  const hash = String(memory.receipt_hash || '');

  const halfLife = { lifestyle_preference: '90d half-life', active_project: '21d half-life', transient_state: '7d half-life' }[memory.decay_curve] || 'configured half-life';

  card.innerHTML = `

    <article class="receipt-card status-${escapeHtml(state)}">

      <div class="receipt-cutout-top"></div>

      <header class="receipt-header">

        <div class="receipt-header-row"><span class="receipt-id">#${escapeHtml(memory.id)}</span><span class="thermal-stamp is-${escapeHtml(state)}" style="--stamp-angle:${angle}deg">${stampName} · ${confidence}%</span></div>

        <div class="receipt-category-tag">${escapeHtml(String(memory.category).replaceAll('_', ' ').toUpperCase())} · COMPONENT SPECIMEN</div>

      </header>

      <div class="receipt-body">

        <div class="receipt-fact-label">SAVED FACT</div><div class="receipt-fact-content">${escapeHtml(memory.content)}</div>

        <div class="receipt-provenance-box"><div class="provenance-header"><span>${escapeHtml(memory.source_title)} · ${escapeHtml(memory.source_type)}</span><span>${escapeHtml(String(memory.created_at || '').slice(0, 10))}</span></div>

          <div class="provenance-excerpt">“${escapeHtml(memory.source_excerpt)}”</div>

          <div class="provenance-hash">SHA-256 · ${escapeHtml(hash.slice(0, 18))}${hash ? '…' : 'unavailable'}</div>

        </div>

        <div class="decay-bar-container"><div class="decay-bar-labels"><span>INK LEVEL · ${memory.days_since_confirmed}d</span><span>${confidence}% · ${halfLife}</span></div><div class="decay-track"><div class="decay-fill" style="width:${confidence}%"></div></div></div>

      </div>

      <footer class="receipt-footer"><div class="barcode-wrapper">${generateBarcodeSvg(hash)}</div><div class="receipt-actions" aria-label="Action examples"><button type="button" disabled>Verify</button><button type="button" disabled>Reaffirm</button><button type="button" disabled>Correct</button><button type="button" disabled>Forget</button></div></footer>

    </article>

    <p class="styleguide-note">Live specimen from the first saved record. Controls are disabled here so the styleguide cannot modify vault data.</p>`;

  if (row) row.innerHTML = `<span>${escapeHtml(memory.id)}</span><span class="leader">${escapeHtml(memory.content)}</span><span>${confidence}%</span><span>${escapeHtml(stampName)}</span>`;

}

// ─── Conflict Detection & Resolution ──────────────────────────────────────────

async function checkProposedConflict(statement, excludeId = null) {

  if (!statement || statement.length < 8) return null;

  try {

    const res = await fetch('/api/conflicts/check', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ proposed_fact: statement, exclude_receipt_id: excludeId })

    });

    if (!res.ok) return null;

    return await res.json();

  } catch (err) {

    // The user-facing handler below reports the unavailable conflict check.

    return null;

  }

}

function handleAddConflictCheck() {

  clearTimeout(addConflictDebounceTimer);

  const text = document.getElementById('add-content').value.trim();

  const pill = document.getElementById('add-conflict-pill');

  const msg = document.getElementById('add-conflict-msg');

  if (!text || text.length < 8) {

    if (pill) pill.style.display = 'none';

    return;

  }

  addConflictDebounceTimer = setTimeout(async () => {

    const res = await checkProposedConflict(text);

    if (res && res.has_conflicts && res.conflicts.length > 0) {

      const topConflict = res.conflicts[0];

      if (pill && msg) {

        msg.innerText = `Contradicts #${topConflict.existing_receipt_id} ("${topConflict.existing_content.substring(0, 50)}...") [Domain: ${topConflict.domain}]`;

        pill.style.display = 'block';

      }

    } else {

      if (pill) pill.style.display = 'none';

    }

  }, 400);

}

function handleCorrectionConflictCheck() {

  const text = document.getElementById('correct-new-content').value.trim();

  const warn = document.getElementById('correct-conflict-warn');

  if (!text || text.length < 8) {

    if (warn) warn.style.display = 'none';

    return;

  }

  clearTimeout(addConflictDebounceTimer);

  addConflictDebounceTimer = setTimeout(async () => {

    const res = await checkProposedConflict(text, activeCorrectReceiptId);

    if (res && res.has_conflicts && res.conflicts.length > 0) {

      const top = res.conflicts[0];

      if (warn) {

        warn.innerText = `Notice: Also overlaps with #${top.existing_receipt_id}: "${top.existing_content.substring(0, 60)}..."`;

        warn.style.display = 'block';

      }

    } else {

      if (warn) warn.style.display = 'none';

    }

  }, 400);

}

async function checkAllVaultConflicts() {

  const banner = document.getElementById('vault-conflict-banner');

  const list = document.getElementById('vault-conflict-list');

  if (!banner || !list) return;

  try {

    let found = [];

    for (let i = 0; i < allMemories.length; i++) {

      const mem = allMemories[i];

      const res = await checkProposedConflict(mem.content, mem.id);

      if (res && res.has_conflicts) {

        res.conflicts.forEach(c => {

          if (!found.some(f => (f.m1 === mem.id && f.m2 === c.existing_receipt_id) || (f.m1 === c.existing_receipt_id && f.m2 === mem.id))) {

            found.push({ m1: mem.id, m1_text: mem.content, m2: c.existing_receipt_id, m2_text: c.existing_content, domain: c.domain });

          }

        });

      }

    }

    if (found.length === 0) {

      showToast('Vault scan complete: No contradictory memories detected!', 'success');

      banner.style.display = 'none';

    } else {

      list.innerHTML = found.map(f => `

        <div class="conflict-item-row">

          <div>

            <strong>#${f.m1}</strong> vs <strong>#${f.m2}</strong> [Domain: ${f.domain}]

            <div style="font-size:0.75rem; color:var(--thermal-ink-2); margin-top:2px">

              "${f.m1_text.substring(0, 50)}..." vs "${f.m2_text.substring(0, 50)}..."

            </div>

          </div>

          <button class="btn-sm btn-secondary" onclick="openCorrectionModal('${f.m1}')">Resolve</button>

        </div>

      `).join('');

      banner.style.display = 'block';

      showToast(`Detected ${found.length} conflicting memory pairs in vault!`, 'info');

    }

  } catch (err) {

    showToast('Vault conflicts could not be checked. Try again in a moment.', 'error');

  }

}

function dismissConflictBanner() {

  const banner = document.getElementById('vault-conflict-banner');

  if (banner) banner.style.display = 'none';

}

function openConflictModal(conflictData) {

  activeConflictData = conflictData;

  document.getElementById('conflict-existing-id').innerText = '#' + conflictData.existing_receipt_id;

  document.getElementById('conflict-existing-content').innerText = conflictData.existing_content;

  document.getElementById('conflict-proposed-content').innerText = conflictData.proposed_fact;

  document.getElementById('conflict-domain-hint').innerText = `Domain conflict: ${conflictData.domain.replace('_', ' ').toUpperCase()} (${conflictData.reason})`;

  openModal('modal-conflict');

}

async function resolveConflictOverwrite() {

  if (!activeConflictData) return;

  const oldId = activeConflictData.existing_receipt_id;

  const newContent = activeConflictData.proposed_fact;

  closeModal('modal-conflict');

  closeModal('modal-add');

  try {

    const res = await fetch(`/api/memories/${oldId}/correct`, {

      method: 'PUT',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        new_content: newContent,

        reason: 'Superseded contradictory memory via conflict resolution',

        reset_confidence: 0.98

      })

    });

    if (!res.ok) throw new Error('Failed to supersede receipt');

    showToast(`Receipt #${oldId} successfully updated with new fact!`, 'success');

    activeConflictData = null;

    await fetchMemories();

  } catch (err) {

    showToast('The conflict could not be resolved. Review the receipt and try again.', 'error');

  }

}

async function resolveConflictKeepBoth() {

  closeModal('modal-conflict');

  showToast('Proceeding to save both receipts as distinct historical contexts...', 'info');

  await executeAddMemory(true);

}

// ─── Add Memory Submission ───────────────────────────────────────────────────

function openAddMemoryModal() {

  document.getElementById('add-content').value = '';

  document.getElementById('add-source-title').value = '';

  document.getElementById('add-source-excerpt').value = '';

  document.getElementById('add-source-url').value = '';

  const fileInput = document.getElementById('add-document-file');

  const importResult = document.getElementById('document-import-result');

  if (fileInput) fileInput.value = '';

  if (importResult) importResult.textContent = 'Not available with the restored backend. Use the manual receipt fields below.';

  const pill = document.getElementById('add-conflict-pill');

  if (pill) pill.style.display = 'none';

  openModal('modal-add');

}

async function importTextDocument(file) {

  if (!file) return;

  const result = document.getElementById('document-import-result');

  if (!result) return;

  result.textContent = 'Not available with the restored backend. You can still enter a receipt and its source excerpt manually below.';

}

function selectDocumentCandidate(index) {

  const candidate = window.reviewDocumentCandidates?.[index];

  if (!candidate) return;

  const content = typeof candidate === 'string' ? candidate : candidate.content;

  const sourceExcerpt = typeof candidate === 'string' ? candidate : candidate.source_excerpt;

  document.getElementById('add-content').value = content;

  document.getElementById('add-source-excerpt').value = sourceExcerpt;

  handleAddConflictCheck();

}

async function submitNewMemory() {

  const content = document.getElementById('add-content').value.trim();

  if (!content) {

    showToast('Please enter a fact statement.', 'error');

    return;

  }

  // Pre-submit conflict check

  const conflictRes = await checkProposedConflict(content);

  if (conflictRes && conflictRes.has_conflicts && conflictRes.conflicts.length > 0) {

    const c = conflictRes.conflicts[0];

    openConflictModal({

      existing_receipt_id: c.existing_receipt_id,

      existing_content: c.existing_content,

      proposed_fact: content,

      domain: c.domain,

      reason: c.reason

    });

    return;

  }

  await executeAddMemory();

}

async function executeAddMemory(force = false) {

  const content = document.getElementById('add-content').value.trim();

  const category = document.getElementById('add-category').value;

  const decay_curve = document.getElementById('add-decay').value;

  const source_type = document.getElementById('add-source-type').value;

  const source_title = document.getElementById('add-source-title').value.trim() || 'Manual Sovereign Entry';

  const source_excerpt = document.getElementById('add-source-excerpt').value.trim() || content;

  const source_url = document.getElementById('add-source-url').value.trim() || null;

  try {

    const res = await fetch('/api/memories', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        content, category, decay_curve, source_type,

        source_title, source_excerpt, source_url,

        initial_confidence: 0.95

      })

    });

    if (!res.ok) throw new Error('Failed to create memory');

    const created = await res.json();

    closeModal('modal-add');

    showToast(`Memory receipt #${created.id} saved to sovereign vault!`, 'success');

    await fetchMemories();

  } catch (err) {

    showToast('The receipt could not be saved. Check the local service and try again.', 'error');

  }

}

// ─── Correction Modal ────────────────────────────────────────────────────────

function openCorrectionModal(receiptId) {

  activeCorrectReceiptId = receiptId;

  const mem = allMemories.find(m => m.id === receiptId);

  if (!mem) return;

  document.getElementById('correct-old-content').innerText = mem.content;

  document.getElementById('correct-new-content').value = mem.content;

  document.getElementById('correct-reason').value = 'User sovereign correction via audit interface';

  const warn = document.getElementById('correct-conflict-warn');

  if (warn) warn.style.display = 'none';

  openModal('modal-correct');

}

async function submitCorrection() {

  if (!activeCorrectReceiptId) return;

  const newContent = document.getElementById('correct-new-content').value.trim();

  const reason = document.getElementById('correct-reason').value.trim() || 'Sovereign correction';

  if (!newContent) {

    showToast('Corrected fact statement cannot be empty.', 'error');

    return;

  }

  try {

    const res = await fetch(`/api/memories/${activeCorrectReceiptId}/correct`, {

      method: 'PUT',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        new_content: newContent,

        reason: reason,

        reset_confidence: 0.98

      })

    });

    if (!res.ok) throw new Error('Correction failed');

    const updated = await res.json();

    closeModal('modal-correct');

    showToast(`Receipt #${updated.id} corrected with audited provenance!`, 'success');

    activeCorrectReceiptId = null;

    await fetchMemories();

  } catch (err) {

    showToast('The correction could not be saved. Review the receipt and try again.', 'error');

  }

}

// ─── Freshness Refresh & Sovereign Forget ─────────────────────────────────────

async function refreshReceiptFreshness(receiptId) {

  reprintingReceiptId = receiptId;

  try {

    const res = await fetch(`/api/memories/${receiptId}/refresh`, { method: 'POST' });

    if (!res.ok) throw new Error('Refresh failed');

    const updated = await res.json();

    showToast(`Freshness reaffirmed for #${updated.id}; decay clock reset.`, 'success');

    await fetchMemories();

    const reprinted = document.getElementById(`card-${CSS.escape(receiptId)}`);

    if (reprinted) reprinted.open = true;

    setTimeout(() => { reprintingReceiptId = null; reprinted?.classList.remove('is-reprinting'); }, 900);

    checkStalenessAlerts();

  } catch (err) {

    reprintingReceiptId = null;

    showToast('The receipt could not be reaffirmed. Try again in a moment.', 'error');

  }

}

async function forgetReceipt(receiptId) {

  if (!confirm(`Permanently erase Receipt #${receiptId} from your sovereign local SQLite vault?`)) {

    return;

  }

  const card = document.getElementById(`card-${CSS.escape(receiptId)}`);

  card?.classList.add('is-tearing');

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, 230));

  try {

    const res = await fetch(`/api/memories/${receiptId}`, { method: 'DELETE' });

    if (!res.ok) throw new Error('Deletion failed');

    const result = await res.json();

    const digest = result.tombstone?.content_hash;

    showToast(digest

      ? `Forgot #${receiptId}. Tombstone SHA-256: ${digest.slice(0, 16)}…`

      : `Forgot #${receiptId}. A tombstone was recorded.`, 'info');

    await fetchMemories();

    if (result.tombstone) renderForgottenStub(result.tombstone);

    checkStalenessAlerts();

  } catch (err) {

    showToast('The receipt could not be forgotten. Try again in a moment.', 'error');

  }

}

function renderForgottenStub(tombstone) {

  const grid = document.getElementById('vault-grid');

  if (!grid || !tombstone?.receipt_id) return;

  const stub = document.createElement('article');

  stub.className = 'thermal-tombstone-stub';

  stub.innerHTML = `<span class="thermal-stamp thermal-stamp-red">FORGOTTEN</span><span>#${escapeHtml(tombstone.receipt_id)}</span><span>Removed from the vault · ${escapeHtml(String(tombstone.created_at || '').slice(0, 10))}</span><span class="provenance-hash">TOMBSTONE · ${escapeHtml(String(tombstone.content_hash || '').slice(0, 18))}</span>`;

  grid.prepend(stub);

}

// ─── Tavily Live Source Verification ──────────────────────────────────────────

async function verifyTavilySource(receiptId, buttonEl) {

  if (buttonEl) {

    buttonEl.innerText = 'Verifying...';

    buttonEl.disabled = true;

  }

  try {

    const res = await fetch('/api/tavily/verify', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ receipt_id: receiptId })

    });

    if (!res.ok) throw new Error('Verification request failed');

    const data = await res.json();

    if (data.status === 'verified') {

      showToast(`Source verified by Tavily! Excerpt matches live web page.`, 'success');

    } else if (data.status === 'content_drift') {

      showToast(`Source content has drifted on the live web since ingestion.`, 'info');

      showTavilyDriftDiff(data.before_excerpt, data.after_excerpt);

    } else {

      showToast(`Source check status: ${data.status || 'not verified'}. Review the receipt before relying on it.`, 'info');

    }

    await fetchMemories();

  } catch (err) {

    showToast('Web verification could not be completed. Check the key in Settings and try again.', 'error');

  } finally {

    if (buttonEl) {

      buttonEl.innerText = 'Verify Web';

      buttonEl.disabled = false;

    }

  }

}

function showTavilyDriftDiff(beforeExcerpt, afterExcerpt) {

  const container = document.getElementById('toast-container');

  if (!container) return;

  const diff = document.createElement('div');

  diff.className = 'toast toast-info tavily-drift-diff';

  diff.innerHTML = `<strong>Source drift · before / current</strong><div><b>Stored</b><pre>${escapeHtml(beforeExcerpt || '(none)')}</pre></div><div><b>Current excerpt</b><pre>${escapeHtml(afterExcerpt || '(not available)')}</pre></div>`;

  container.appendChild(diff);

  setTimeout(() => diff.remove(), 12000);

}

// ─── Interactive Long-Term Memory Graph ───────────────────────────────────────

async function reloadMemoryGraph() {

  const svg = document.getElementById('memory-graph-svg');

  const emptyState = document.getElementById('graph-empty-state');

  if (!svg) return;

  setGraphState('Loading receipts…', 'The graph uses relationships returned by the API.', true);

  try {

    const res = await fetch('/api/graph');

    if (!res.ok) throw new Error('Failed to load memory graph');

    const graphData = await res.json();

    graphNodes = Array.isArray(graphData.nodes) ? graphData.nodes : [];

    graphEdges = await deriveGraphEdges(graphNodes, Array.isArray(graphData.edges) ? graphData.edges : []);

    if (!graphNodes.length) {

      svg.replaceChildren();

      setGraphState('No receipts yet', 'Add a receipt in Vault to see it here.', true);

      return;

    }

    const linkStatus = document.getElementById('graph-link-status');

    if (linkStatus) {

      linkStatus.hidden = graphEdges.length > 0;

      linkStatus.innerHTML = graphNodes.length < 2 ? 'Add another receipt to see links.' : 'No links found yet. <button type="button" onclick="checkAllVaultConflicts()">Run Scan Conflicts</button>';

    }

    renderSvgGraph(graphNodes, graphEdges);

    setGraphState('', '', false);

    renderGraphLegend(graphEdges);

    renderGraphList();

  } catch {

    setGraphState('Graph unavailable', 'The graph could not load. Check the connection and try again.', true);

  }

}

// Link derivation order is intentional: conflict, supersedes, keyword similarity,

// then same-source/category inference. One undirected pair is rendered only once.

async function deriveGraphEdges(nodes, apiEdges = []) {

  const memories = nodes.map(node => allMemories.find(memory => String(memory.id) === String(node.id)) || node);

  const byId = new Map(memories.map(memory => [String(memory.id), memory]));

  const result = [];

  const seen = new Set();

  const add = (source, target, relationship, extras = {}) => {

    const a = String(source), b = String(target);

    if (!byId.has(a) || !byId.has(b) || a === b) return;

    const key = [a, b].sort().join('::');

    if (seen.has(key)) return;

    seen.add(key); result.push({ source: a, target: b, relationship, ...extras });

  };

  const pairs = [];

  for (let i = 0; i < memories.length; i += 1) for (let j = i + 1; j < memories.length; j += 1) pairs.push([memories[i], memories[j]]);

  let apiConflicts = new Map();

  if (memories.length > 1) {

    const checks = await Promise.all(memories.map(async memory => {

      const response = await checkProposedConflict(String(memory.content || memory.label || ''), String(memory.id));

      return [String(memory.id), response?.conflicts || []];

    }));

    apiConflicts = new Map(checks);

  }

  const fieldValue = content => {

    const match = String(content || '').match(/\b(?:lives? in|moved to|based in|resides in|located in)\s+([^.,;]+)/i);

    return match ? { field: 'location', value: match[1].replace(/\s+(?:and|with)\s+.*$/i, '').trim().toLowerCase() } : null;

  };

  for (const [a, b] of pairs) {

    const av = fieldValue(a.content), bv = fieldValue(b.content);

    const apiHit = (apiConflicts.get(String(a.id)) || []).find(conflict => String(conflict.conflicting_receipt_id || conflict.existing_receipt_id) === String(b.id));

    const reverseHit = (apiConflicts.get(String(b.id)) || []).find(conflict => String(conflict.conflicting_receipt_id || conflict.existing_receipt_id) === String(a.id));

    // Match same semantic field (e.g. location) with distinct values, in addition to the app's API conflict detector.

    if (apiHit || reverseHit || (av && bv && av.field === bv.field && av.value !== bv.value)) {

      const reason = apiHit?.reason || reverseHit?.reason || `Different ${av?.field || 'field'} values: ${av?.value || ''} vs ${bv?.value || ''}`;

      add(a.id, b.id, 'conflict', { reason, tooltip: `Conflict: ${reason}` });

    }

  }

  for (const memory of memories) {

    const history = Array.isArray(memory.audit_history) ? memory.audit_history : [];

    for (const entry of history) {

      if (!entry.old_content || !entry.new_content) continue;

      const old = memories.find(item => String(item.content || '').trim().toLowerCase() === String(entry.old_content).trim().toLowerCase());

      const newer = memories.find(item => String(item.content || '').trim().toLowerCase() === String(entry.new_content).trim().toLowerCase()) || memory;

      if (old && newer && String(old.id) !== String(newer.id)) add(old.id, newer.id, 'supersedes');

    }

  }

  const stopWords = new Set('the and for with user that this from are was has had have its not but will can all you your into onto over under then than'.split(' '));

  const tokens = text => new Set(String(text || '').toLowerCase().match(/[a-z0-9]+/g)?.filter(word => word.length > 2 && !stopWords.has(word)) || []);

  for (const [a, b] of pairs) {

    const ta = tokens(`${a.content || a.label || ''} ${a.source_title || ''}`), tb = tokens(`${b.content || b.label || ''} ${b.source_title || ''}`);

    const union = new Set([...ta, ...tb]);

    const score = union.size ? [...ta].filter(word => tb.has(word)).length / union.size : 0;

    const serverEdge = apiEdges.find(edge => [String(edge.source), String(edge.target)].sort().join('::') === [String(a.id), String(b.id)].sort().join('::'));

    const storedScore = Number(serverEdge?.weight) || score;

    if (serverEdge || storedScore >= .15) add(a.id, b.id, 'similarity', { weight: storedScore });

  }

  for (const [a, b] of pairs) {

    const sameSource = a.source_title && b.source_title && String(a.source_title).trim().toLowerCase() === String(b.source_title).trim().toLowerCase();

    const sameCategory = String(a.category || '') === String(b.category || '');

    if (sameSource || sameCategory) add(a.id, b.id, 'inferred', { inferred: true });

  }

  return result;

}

function setGraphState(title, copy, visible) {

  const state = document.getElementById('graph-empty-state');

  if (!state) return;

  state.hidden = !visible;

  document.getElementById('graph-state-title').textContent = title;

  document.getElementById('graph-state-copy').textContent = copy;

}

function renderGraphLegend(edges) {

  const legend = document.getElementById('graph-legend');

  if (!legend) return;

  const categories = [...new Set(graphNodes.map(node => String(node.category || 'memory').toLowerCase()))];

  const names = { preference: 'Preference', lifestyle_preference: 'Preference', active_project: 'Active project', project: 'Project', factual_web: 'Web intel', web: 'Web intel', personal: 'Personal', transient_state: 'Transient' };

  const categoryItems = categories.map(category => `<button type="button" class="legend-chip" aria-pressed="true" onclick="toggleGraphCategory('${escapeHtml(category)}',this)"><span class="legend-dot legend-${graphCategoryClass(category)}"></span>${escapeHtml(names[category] || category.replaceAll('_', ' '))}</button>`);

  const types = [...new Set(edges.map(edge => graphEdgeType(edge)))];

  const edgeNames = { similarity: 'Similarity', inferred: 'Inferred', conflict: 'Conflict', supersedes: 'Supersedes' };

  const edgeItems = types.map(type => `<span class="legend-chip"><span class="legend-line ${type}"></span>${edgeNames[type]}</span>`);

  const statuses = new Set(graphNodes.map(node => String(node.status || '').toLowerCase()));

  const statusItems = [...statuses].map(status => `<span class="legend-chip status-chip"><span class="legend-dot legend-${escapeHtml(status)}"></span>${escapeHtml(status)}</span>`);

  const help = '<span class="graph-links-help" tabindex="0" title="Links use detected conflicts, recorded corrections, keyword Jaccard similarity ≥ 0.15, then shared source or category.">How links are derived ⓘ</span>';

  legend.innerHTML = `<div class="graph-legend-row">${categoryItems.join('')}${statusItems.join('')}${edgeItems.join('')}${help}</div>`;

}

function graphCategoryClass(category) {

  return ({ preference: 'preference', lifestyle_preference: 'preference', active_project: 'project', project: 'project', factual_web: 'web', web: 'web', personal: 'personal', transient_state: 'personal' })[category] || 'personal';

}

function graphEdgeType(edge) {

  const relationship = String(edge.relationship || '').toLowerCase();

  if (relationship.includes('conflict')) return 'conflict';

  if (relationship.includes('supersed')) return 'supersedes';

  if (edge.inferred || relationship.includes('inferred')) return 'inferred';

  return 'similarity';

}

function forceGraphPositions(nodes, edges, width, height) {

  const pad = width < 520 ? 42 : 54;

  const centerByCategory = new Map();

  const categories = [...new Set(nodes.map(node => String(node.category || 'memory')))].sort();

  const categorySpread = width < 520 ? .46 : .38;

  categories.forEach((category, index) => {

    const angle = (Math.PI * 2 * index / Math.max(1, categories.length)) - Math.PI / 2;

    const mobileX = index % 2 === 0 ? width * .14 : width * .86;

    const mobileY = height * (.23 + Math.floor(index / 2) * .20);

    const compactX = width * (.12 + index / Math.max(1, categories.length - 1) * .76);

    const compactY = height * (index % 2 ? .64 : .36);

    centerByCategory.set(category, width < 520 ? { x: mobileX, y: mobileY } : height < 400 ? { x: compactX, y: compactY } : { x: width / 2 + Math.cos(angle) * width * categorySpread, y: height / 2 + Math.sin(angle) * height * .34 });

  });

  const mapped = nodes.map((node, index) => {

    const category = String(node.category || 'memory');

    const center = centerByCategory.get(category);

    const inGroup = nodes.slice(0, index).filter(item => String(item.category || 'memory') === category).length;

    const angle = inGroup * 2.4 + index * .3;

    const radius = 26 + Math.ceil(nodes.filter(item => String(item.category || 'memory') === category).length / 2) * 38;

    const pinned = graphPinnedPositions.get(String(node.id));

    const confidence = Math.max(0, Math.min(1, Number(node.confidence) || 0));

    return { ...node, category, x: pinned?.x ?? Math.max(pad, Math.min(width-pad, center.x + Math.cos(angle)*radius)), y: pinned?.y ?? Math.max(pad, Math.min(height-pad, center.y + Math.sin(angle)*radius)), pinned: Boolean(pinned), vx: 0, vy: 0, confidence, radius: Math.max(node.status === 'stale' ? 20 : 20, 20 + confidence * 18) };

  });

  // At narrow or short aspect ratios, a category-sorted grid avoids crushing a force layout into a line.

  if (width < 520 || height < 400) {

    const sorted = [...mapped].sort((a,b) => String(a.category).localeCompare(String(b.category)) || String(a.id).localeCompare(String(b.id)));

    const columns = width < 520 ? 2 : 4;

    const rows = Math.ceil(sorted.length / columns);

    sorted.forEach((node,index) => {

      const column = index % columns, row = Math.floor(index / columns);

      const x = width < 520 ? width * (column ? 1.02 : -.02) : width * (.04 + column / 3 * .92);

      const y = width < 520 ? height * (.05 + row * .30) : height * (row ? .77 : .23);

      if (!node.pinned) { node.x = x; node.y = y; }

    });

    return mapped;

  }

  const byId = new Map(mapped.map(node => [String(node.id), node]));

  const links = edges.map(edge => ({ a: byId.get(String(edge.source)), b: byId.get(String(edge.target)) })).filter(edge => edge.a && edge.b);

  for (let iteration = 0; iteration < 90; iteration += 1) {

    const alpha = 1 - iteration / 90;

    for (let i = 0; i < mapped.length; i += 1) for (let j = i + 1; j < mapped.length; j += 1) {

      const a = mapped[i], b = mapped[j]; let dx = b.x - a.x, dy = b.y - a.y;

      const distance = Math.max(1, Math.hypot(dx, dy));

      const minDistance = a.radius + b.radius + 12;

      const force = distance < minDistance ? (minDistance - distance) * .035 : -Math.min(2, 1800 / (distance * distance)) * .035;

      dx /= distance; dy /= distance; a.vx -= dx * force; a.vy -= dy * force; b.vx += dx * force; b.vy += dy * force;

    }

    for (const link of links) {

      const dx = link.b.x - link.a.x, dy = link.b.y - link.a.y, distance = Math.max(1, Math.hypot(dx, dy));

      const force = (distance - 180) * .006 * alpha;

      link.a.vx += dx / distance * force; link.a.vy += dy / distance * force; link.b.vx -= dx / distance * force; link.b.vy -= dy / distance * force;

    }

    for (const node of mapped) {

      if (node.pinned) { node.vx = 0; node.vy = 0; continue; }

      const target = centerByCategory.get(node.category);

      node.vx += (target.x - node.x) * .0025; node.vy += (target.y - node.y) * .0025;

      node.x = Math.max(pad, Math.min(width-pad, node.x + node.vx)); node.y = Math.max(pad, Math.min(height-pad, node.y + node.vy));

      node.vx *= .72; node.vy *= .72;

    }

  }

  return mapped;

}

function renderSvgGraph(nodes, edges, shouldFit = true) {

  const svg = document.getElementById('memory-graph-svg');

  if (!svg) return;

  const width = Math.max(320, Math.floor(svg.getBoundingClientRect().width || svg.parentElement?.clientWidth || 720));

  const height = Math.max(320, Math.floor((svg.parentElement?.clientHeight || 540)));

  const nodeMap = new Map(forceGraphPositions(nodes, edges, width, height).map(node => [String(node.id), node]));

  const isFiltered = id => {

    const node = graphNodes.find(item => String(item.id) === String(id));

    return Boolean((graphFilteredIds && !graphFilteredIds.has(String(id))) || (node && graphHiddenCategories.has(String(node.category || 'memory').toLowerCase())));

  };

  const edgesHtml = edges.map((edge, index) => {

    const source = nodeMap.get(String(edge.source)); const target = nodeMap.get(String(edge.target));

    if (!source || !target) return '';

    const type = graphEdgeType(edge);

    const weight = type === 'similarity' ? 1 + 3 * Math.max(0, Math.min(1, Number(edge.weight) || 0)) : type === 'inferred' ? 1 : 2;

    const reason = String(edge.reason || 'Different values for the same receipt field.');

    const marker = type === 'supersedes' ? ' marker-end="url(#graph-arrow)"' : '';

    const midpoint = type === 'conflict' ? graphConflictMarker(source, target, reason) : '';

    return `<g class="graph-edge-group${isFiltered(edge.source) || isFiltered(edge.target) ? ' is-filtered' : ''}"><line id="edge-${index}" class="graph-edge is-${type}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke-width="${weight}" data-source="${escapeHtml(String(edge.source))}" data-target="${escapeHtml(String(edge.target))}"${marker}><title>${type === 'conflict' ? `Conflict: ${escapeHtml(reason)}` : `${type} link`}</title></line>${midpoint}</g>`;

  }).join('');

  const orderedNodes = [...nodeMap.values()].sort((a, b) => b.confidence - a.confidence);

  const labelPriority = nodes.length <= 14 ? orderedNodes.map(node => String(node.id)) : orderedNodes.slice(0, 8).map(node => String(node.id));

  [selectedGraphNodeId, graphHoveredNodeId].filter(Boolean).forEach(id => { if (!labelPriority.includes(id)) labelPriority.push(id); });

  const labelSlots = new Map();

  orderedNodes.slice().sort((a,b)=>a.x-b.x).forEach((node,index)=>labelSlots.set(String(node.id), index % 3));

  const nodesHtml = [...nodeMap.values()].map(node => {

    const id = String(node.id || 'unknown');

    const safeId = encodeURIComponent(id);

    const category = graphCategoryClass(String(node.category || '').toLowerCase());

    const stale = node.status === 'stale';

    const superseded = node.status === 'superseded';

    const status = escapeHtml(String(node.status || 'recorded'));

    const rawSummary = String(node.content || node.fact || node.label || id).replace(/^#[^:]+:\s*/, '').replace(/^user\s+(?:(?:is\s+)?based\s+in|moved\s+to|lives\s+in|resides\s+in|located\s+in)\s+/i, '').replace(/^user\s+/i, '').replace(/\s+and\s+(?:now\s+)?(?:operates|avoids|strictly|uses|works)\b.*$/i, '').replace(/[,.;]/g, ' ').trim();

    const label = id.toLowerCase() === 'pending' ? 'pending' : rawSummary.split(/\s+/).slice(0, 4).join(' ');

    const availableLabelWidth = Math.min(126, Math.max(64, 2 * (Math.min(node.x, width - node.x) - 10)));

    const maxLabelChars = Math.max(7, Math.floor(availableLabelWidth / 7.4));

    const visibleLabel = label.length > maxLabelChars ? `${label.slice(0, maxLabelChars - 1)}…` : label;

    const labelTextLength = Math.min(availableLabelWidth, visibleLabel.length * 6.7);

    const receiptMeta = allMemories.find(memory => String(memory.id) === id) || node;

    const age = Number(receiptMeta.days_since_confirmed);

    const fullFact = String(node.content || node.label || id);

    const summary = label;

    const opacity = stale ? .58 : 1;

    const confCircumference = 2 * Math.PI * (node.radius + 5);

    const dashOffset = confCircumference * (1 - node.confidence);

    const showLabel = Boolean(graphLabelsEnabled);

    const labelY = node.radius + 29 + (labelSlots.get(id) || 0) * 17;

    const neighborIds = new Set([id]);

    if (selectedGraphNodeId) graphEdges.forEach(edge => { if (String(edge.source) === selectedGraphNodeId) neighborIds.add(String(edge.target)); if (String(edge.target) === selectedGraphNodeId) neighborIds.add(String(edge.source)); });

    const selectedClass = id === selectedGraphNodeId ? ' is-selected' : '';

    const dimClass = selectedGraphNodeId && !neighborIds.has(id) ? ' is-dimmed' : '';

    const filteredClass = isFiltered(id) ? ' is-filtered' : '';

    return `<g class="graph-node category-${category}${stale ? ' is-stale' : ''}${node.status === 'decaying' ? ' is-decaying' : ''}${superseded ? ' is-superseded' : ''}${selectedClass}${dimClass}${filteredClass}" id="node-${safeId}" data-node-id="${escapeHtml(id)}" data-category="${escapeHtml(String(node.category || 'memory').toLowerCase())}" data-confidence="${node.confidence}" data-radius="${node.radius}" transform="translate(${node.x},${node.y})" tabindex="0" role="button" aria-label="Receipt ${escapeHtml(id)}, ${status}, ${Math.round(node.confidence * 100)} percent confidence" onkeydown="handleGraphNodeKey(event,'${escapeHtml(id)}')" onmouseenter="setGraphHover('${escapeHtml(id)}')" onmouseleave="setGraphHover('')" onclick="selectGraphNode('${escapeHtml(id)}')">

      <circle class="graph-selected-ring" r="${node.radius + 13}"/>

      <circle class="graph-status-ring" r="${node.radius + 10}" style="opacity:${opacity}"/>

      <circle class="graph-node-disc" r="${node.radius}" style="opacity:${opacity}"><title>${escapeHtml(id)} · ${escapeHtml(fullFact)} · ${status} · ${Math.round(node.confidence * 100)}% confidence · ${Number.isFinite(age) ? `${age} days old` : 'age not recorded'}</title></circle>

      <circle class="graph-confidence-ring" r="${node.radius + 5}" stroke-dasharray="${confCircumference}" stroke-dashoffset="${dashOffset}"/>

      <text class="graph-node-label${showLabel ? ' is-visible' : ''}" data-summary="${escapeHtml(label)}" y="${labelY}" text-anchor="middle" textLength="${labelTextLength}" lengthAdjust="spacingAndGlyphs">${escapeHtml(visibleLabel)}</text>

      ${stale ? `<text class="graph-stale-tag" y="${labelY + 14}" text-anchor="middle">STALE</text>` : ''}

      <text class="graph-node-fact" y="${node.radius + 48}" text-anchor="middle"><title>${escapeHtml(id)} · ${Math.round(node.confidence * 100)}% · ${status}</title></text>

    </g>`;

  }).join('');

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  svg.setAttribute('height', '100%');

  svg.innerHTML = `<defs><pattern id="graph-stale-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="7" height="7" fill="var(--black-2)"/><line x1="0" y1="0" x2="0" y2="7" stroke="var(--graph-stale)" stroke-width="2"/></pattern><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--lime)"/></marker></defs><g id="graph-viewport"><g class="edges-group">${edgesHtml}</g><g class="nodes-group">${nodesHtml}</g></g>`;

  graphNodeLayout = nodeMap;

  let nodeIdx = 0;
  nodeMap.forEach(node => {
    node.baseX = node.x;
    node.baseY = node.y;
    node.phase = (nodeIdx * 1.8) + (String(node.id).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 10);
    node.vx = (Math.random() - 0.5) * 1.5;
    node.vy = (Math.random() - 0.5) * 1.5;
    nodeIdx++;
  });

  if (shouldFit) fitGraphToView(width, height); else updateGraphTransform();

  highlightGraphNode(selectedGraphNodeId || '');

  if (!graphResizeObserver && typeof ResizeObserver !== 'undefined') {

    graphResizeObserver = new ResizeObserver(() => {

      if (document.getElementById('view-graph')?.classList.contains('active') && graphNodes.length) renderSvgGraph(graphNodes, graphEdges);

    });

    graphResizeObserver.observe(svg.parentElement || svg);

  }

  if (!svg.dataset.panBound) {

    svg.dataset.panBound = 'true';

    let dragging = null;

    svg.addEventListener('pointerdown', event => {

      const nodeElement = event.target.closest('.graph-node');

      if (nodeElement) {

        const node = nodeMap.get(nodeElement.dataset.nodeId);

        if (!node) return;

        dragging = { nodeId: node.id, nodeX: node.x, nodeY: node.y };
        graphDraggingNodeId = String(node.id);
        nodeElement.setPointerCapture(event.pointerId);

        return;

      }

      dragging = { x: event.clientX, y: event.clientY, panX: graphPan.x, panY: graphPan.y };

      svg.setPointerCapture(event.pointerId);

    });

    svg.addEventListener('pointermove', event => {

      if (!dragging) return;

      if (dragging.nodeId) {

        const rect = svg.getBoundingClientRect(); const viewBox = svg.viewBox.baseVal;

        const x = Math.max(36, Math.min(viewBox.width - 36, ((((event.clientX - rect.left) - graphPan.x) / graphZoom) / rect.width) * viewBox.width));

        const y = Math.max(36, Math.min(viewBox.height - 36, ((((event.clientY - rect.top) - graphPan.y) / graphZoom) / rect.height) * viewBox.height));

        graphPinnedPositions.set(String(dragging.nodeId), { x, y });
        const liveNode = graphNodeLayout?.get(String(dragging.nodeId));
        if (liveNode) { liveNode.baseX = x; liveNode.baseY = y; liveNode.x = x; liveNode.y = y; liveNode.vx = 0; liveNode.vy = 0; }
        const node = svg.querySelector(`#node-${encodeURIComponent(String(dragging.nodeId))}`);

        node?.setAttribute('transform', `translate(${x},${y})`);

        svg.querySelectorAll(`.graph-edge[data-source="${CSS.escape(String(dragging.nodeId))}"],.graph-edge[data-target="${CSS.escape(String(dragging.nodeId))}"]`).forEach(edge => {

          if (edge.dataset.source === String(dragging.nodeId)) { edge.setAttribute('x1', x); edge.setAttribute('y1', y); }

          if (edge.dataset.target === String(dragging.nodeId)) { edge.setAttribute('x2', x); edge.setAttribute('y2', y); }

        });

        return;

      }

      graphPan = { x: dragging.panX + event.clientX - dragging.x, y: dragging.panY + event.clientY - dragging.y };

      updateGraphTransform();

    });

    const endDrag = () => { dragging = null; graphDraggingNodeId = null; };

    svg.addEventListener('pointerup', endDrag);

    svg.addEventListener('pointercancel', endDrag);

    svg.addEventListener('wheel', event => { event.preventDefault(); zoomGraph(event.deltaY < 0 ? 1.08 : .92, event.clientX, event.clientY); }, { passive: false });

  }

  if (!graphPhysicsPaused) { startGraphPhysicsSimulation(); } else { stopGraphPhysicsSimulation(); }
  syncGraphPhysicsButtonUI();
}

function updateGraphTransform() {

  const viewport = document.getElementById('graph-viewport');

  if (viewport) viewport.setAttribute('transform', `translate(${graphPan.x} ${graphPan.y}) scale(${graphZoom})`);

  document.querySelectorAll('.graph-conflict-marker').forEach(marker => marker.setAttribute('transform', `translate(${marker.dataset.centerX} ${marker.dataset.centerY}) scale(${1 / graphZoom})`));

}

function fitGraphToView(width = null, height = null) {

  const svg = document.getElementById('memory-graph-svg');

  if (!svg || !graphNodeLayout.size) return;

  const w = width || Math.max(320, Math.floor(svg.clientWidth || 720));

  const h = height || Math.max(360, Math.floor(svg.clientHeight || 540));

  const nodes = [...graphNodeLayout.values()];

  const minX = Math.min(...nodes.map(node => node.x - node.radius - 48));

  const maxX = Math.max(...nodes.map(node => node.x + node.radius + 48));

  const minY = Math.min(...nodes.map(node => node.y - node.radius - 48));

  const maxY = Math.max(...nodes.map(node => node.y + node.radius + 48));

  const scale = Math.min(2, Math.max(.35, Math.min((w - 96) / Math.max(1, maxX-minX), (h - 96) / Math.max(1, maxY-minY))));

  graphZoom = scale;

  graphPan = { x: w / 2 - ((minX + maxX) / 2) * scale, y: h / 2 - ((minY + maxY) / 2) * scale };

  updateGraphTransform();

}

function stepGraphSimulation(width, height) {
  const pad = width < 520 ? 42 : 54;
  if (!graphNodeLayout || graphNodeLayout.size < 2) return;
  const nodes = [...graphNodeLayout.values()];
  const now = performance.now();
  const t = now * 0.0014;

  // 1. Organic floating target and spring forces
  nodes.forEach((node, index) => {
    if (node.baseX == null) node.baseX = node.x;
    if (node.baseY == null) node.baseY = node.y;

    if (node.pinned || String(node.id) === String(graphDraggingNodeId)) {
      node.baseX = node.x;
      node.baseY = node.y;
      node.vx = 0;
      node.vy = 0;
      return;
    }

    const p = (node.phase ?? (index * 1.8)) + t;
    const targetDriftX = Math.sin(p) * 12 + Math.cos(p * 0.7) * 5;
    const targetDriftY = Math.cos(p * 0.9) * 10 + Math.sin(p * 1.3) * 4;

    const targetX = node.baseX + targetDriftX;
    const targetY = node.baseY + targetDriftY;

    node.vx = (node.vx || 0) * 0.85 + (targetX - node.x) * 0.05;
    node.vy = (node.vy || 0) * 0.85 + (targetY - node.y) * 0.05;
  });

  // 2. Soft pairwise collision repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.max(0.1, Math.hypot(dx, dy));
      const minDistance = (a.radius || 24) + (b.radius || 24) + 16;
      if (distance < minDistance) {
        const force = (minDistance - distance) * 0.035;
        const ndx = dx / distance, ndy = dy / distance;
        if (!a.pinned && String(a.id) !== String(graphDraggingNodeId)) {
          a.vx -= ndx * force;
          a.vy -= ndy * force;
        }
        if (!b.pinned && String(b.id) !== String(graphDraggingNodeId)) {
          b.vx += ndx * force;
          b.vy += ndy * force;
        }
      }
    }
  }

  // 3. Spring attraction along edges
  (graphEdges || []).forEach(edge => {
    const a = graphNodeLayout.get(String(edge.source));
    const b = graphNodeLayout.get(String(edge.target));
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const targetDist = 160;
    const force = (distance - targetDist) * 0.002;
    const ndx = dx / distance, ndy = dy / distance;
    if (!a.pinned && String(a.id) !== String(graphDraggingNodeId)) {
      a.vx += ndx * force;
      a.vy += ndy * force;
    }
    if (!b.pinned && String(b.id) !== String(graphDraggingNodeId)) {
      b.vx -= ndx * force;
      b.vy -= ndy * force;
    }
  });

  // 4. Position update & boundary clamping
  nodes.forEach(node => {
    if (node.pinned || String(node.id) === String(graphDraggingNodeId)) return;
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(pad, Math.min(width - pad, node.x));
    node.y = Math.max(pad, Math.min(height - pad, node.y));
  });

  // 5. Update SVG DOM elements
  const svg = document.getElementById('memory-graph-svg');
  if (!svg) return;

  nodes.forEach(node => {
    const el = document.getElementById('node-' + encodeURIComponent(String(node.id)))
      || svg.querySelector(`[data-node-id="${CSS.escape(String(node.id))}"]`);
    if (el) el.setAttribute('transform', `translate(${node.x},${node.y})`);
  });

  (graphEdges || []).forEach((edge, index) => {
    const a = graphNodeLayout.get(String(edge.source));
    const b = graphNodeLayout.get(String(edge.target));
    if (!a || !b) return;
    const line = document.getElementById(`edge-${index}`);
    if (line) {
      line.setAttribute('x1', a.x);
      line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x);
      line.setAttribute('y2', b.y);
    }
    const marker = svg.querySelector(`.graph-conflict-marker[data-source="${CSS.escape(String(a.id))}"][data-target="${CSS.escape(String(b.id))}"]`);
    if (marker) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      marker.dataset.centerX = mx;
      marker.dataset.centerY = my;
      marker.setAttribute('transform', `translate(${mx} ${my}) scale(${1 / graphZoom})`);
    }
  });
}

function startGraphPhysicsSimulation() {
  if (graphPhysicsPaused) return;
  if (graphPhysicsAnimId) cancelAnimationFrame(graphPhysicsAnimId);
  function loop() {
    if (graphPhysicsPaused) {
      graphPhysicsAnimId = null;
      return;
    }
    const svg = document.getElementById('memory-graph-svg');
    const viewGraph = document.getElementById('view-graph');
    if (!svg || !viewGraph || !viewGraph.classList.contains('active')) {
      graphPhysicsAnimId = null;
      return;
    }
    const width = Math.max(320, Math.floor(svg.getBoundingClientRect().width || svg.parentElement?.clientWidth || 720));
    const height = Math.max(320, Math.floor(svg.parentElement?.clientHeight || 540));
    stepGraphSimulation(width, height);
    graphPhysicsAnimId = requestAnimationFrame(loop);
  }
  graphPhysicsAnimId = requestAnimationFrame(loop);
}

function stopGraphPhysicsSimulation() {
  if (graphPhysicsAnimId) {
    cancelAnimationFrame(graphPhysicsAnimId);
    graphPhysicsAnimId = null;
  }
  if (graphNodeLayout) {
    graphNodeLayout.forEach(node => {
      node.vx = 0;
      node.vy = 0;
    });
  }
}

function syncGraphPhysicsButtonUI() {
  const button = document.getElementById('graph-physics-toggle');
  if (!button) return;
  const isRunning = !graphPhysicsPaused;
  button.setAttribute('aria-pressed', String(isRunning));
  button.setAttribute('aria-label', isRunning ? 'Pause layout' : 'Resume layout');
  button.title = isRunning ? 'Pause layout' : 'Resume layout';
  button.innerHTML = icon(isRunning ? 'pause' : 'play');
}

function toggleGraphPhysics() {
  graphPhysicsPaused = !graphPhysicsPaused;
  syncGraphPhysicsButtonUI();
  if (graphPhysicsPaused) {
    stopGraphPhysicsSimulation();
  } else {
    if (graphNodeLayout) {
      graphNodeLayout.forEach(node => {
        node.vx = (Math.random() - 0.5) * 4;
        node.vy = (Math.random() - 0.5) * 4;
      });
    }
    startGraphPhysicsSimulation();
  }
}
window.toggleGraphPhysics = toggleGraphPhysics;
window.syncGraphPhysicsButtonUI = syncGraphPhysicsButtonUI;

function activateGraphConflict(sourceId, targetId) {

  const source = allMemories.find(item => String(item.id) === String(sourceId)) || graphNodes.find(item => String(item.id) === String(sourceId));

  const target = allMemories.find(item => String(item.id) === String(targetId)) || graphNodes.find(item => String(item.id) === String(targetId));

  const time = item => Date.parse(item?.last_confirmed_at || item?.updated_at || item?.created_at || '') || 0;

  selectGraphNode(time(source) >= time(target) ? String(sourceId) : String(targetId));

}

function graphConflictMarker(source, target, reason) {

  const a = graphNodes.find(item => String(item.id) === String(source.id)) || source;

  const b = graphNodes.find(item => String(item.id) === String(target.id)) || target;

  const factA = String(a.content || a.fact || a.label || a.id);

  const factB = String(b.content || b.fact || b.label || b.id);

  const shortReason = String(reason || 'These facts conflict.').replace(/[<>]/g, '').slice(0, 100);

  const label = `Conflict between ${factA} and ${factB}`.replace(/[<>]/g, '');

  const x = (source.x + target.x) / 2, y = (source.y + target.y) / 2;

  return `<g class="graph-conflict-marker" transform="translate(${x} ${y}) scale(${1 / graphZoom})" data-center-x="${x}" data-center-y="${y}" role="button" tabindex="0" aria-label="${escapeHtml(label)}" data-source="${escapeHtml(String(source.id))}" data-target="${escapeHtml(String(target.id))}" onclick="activateGraphConflict('${escapeHtml(String(source.id))}','${escapeHtml(String(target.id))}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();activateGraphConflict('${escapeHtml(String(source.id))}','${escapeHtml(String(target.id))}')}" onmouseenter="this.classList.add('is-hovered')" onmouseleave="this.classList.remove('is-hovered')" onfocus="this.classList.add('is-hovered')" onblur="this.classList.remove('is-hovered')"><title>Conflict: ${escapeHtml(shortReason)}</title><circle class="graph-conflict-hit" r="18"/><circle class="graph-conflict-disc" r="12"/><path class="graph-conflict-bolt" d="M2-8-5 1h5l-2 7 8-10H1z" aria-hidden="true"/></g>`;

}

function highlightGraphNode(nodeId) {

  const adjacent = new Set([nodeId]);

  if (nodeId) graphEdges.forEach(edge => {

    if (String(edge.source) === nodeId) adjacent.add(String(edge.target));

    if (String(edge.target) === nodeId) adjacent.add(String(edge.source));

  });

  document.querySelectorAll('.graph-node').forEach(node => node.classList.toggle('is-dimmed', Boolean(nodeId) && !adjacent.has(node.dataset.nodeId)));

  document.querySelectorAll('.graph-edge').forEach(edge => edge.classList.toggle('is-highlighted', Boolean(nodeId) && (edge.dataset.source === nodeId || edge.dataset.target === nodeId)));

}

function selectGraphNode(nodeId) {

  selectedGraphNodeId = String(nodeId);

  graphHoveredNodeId = null;

  highlightGraphNode(selectedGraphNodeId);

  document.querySelectorAll('.graph-node').forEach(node => node.classList.toggle('is-selected', node.dataset.nodeId === selectedGraphNodeId));

  const mem = allMemories.find(m => String(m.id) === selectedGraphNodeId) || graphNodes.find(m => String(m.id) === selectedGraphNodeId);

  const detailPanel = document.getElementById('graph-node-details');

  if (!detailPanel) return;

  if (!mem) {

    detailPanel.hidden = false;

    detailPanel.innerHTML = `<div class="empty-inspector"><div>Receipt #${escapeHtml(selectedGraphNodeId)} is not in the loaded vault list.</div><p>Refresh the graph to synchronize its detail panel.</p></div>`;

    return;

  }

  const connected = graphEdges.filter(edge => String(edge.source) === selectedGraphNodeId || String(edge.target) === selectedGraphNodeId);

  const nodeData = graphNodes.find(item => String(item.id) === selectedGraphNodeId);

  const fact = escapeHtml(String(mem.content || mem.fact || mem.text || mem.label || 'Receipt detail unavailable.'));

  const source = escapeHtml([mem.source_title, mem.source_type].filter(Boolean).join(' · ') || mem.source_url || 'No source recorded');

  const hashValue = String(mem.receipt_hash || mem.hash || mem.sha256 || '');

  const hash = escapeHtml(hashValue || 'No source recorded');

  const confidence = Number(mem.confidence ?? nodeData?.confidence ?? 0);

  const halfLifeDays = { lifestyle_preference: 90, active_project: 21, transient_state: 7 }[mem.decay_curve];

  const barcode = hashValue ? generateBarcodeSvg(hashValue) : '';

  const shortHash = hashValue ? `${hashValue.slice(0,8)}…${hashValue.slice(-4)}` : 'HASH UNAVAILABLE';

  detailPanel.hidden = false;

  detailPanel.innerHTML = `<header class="graph-drawer-header"><span class="graph-mini-stamp ${escapeHtml(String(mem.status || nodeData?.status || '').toLowerCase())}">${escapeHtml(String(mem.status || nodeData?.status || 'RECORDED').toUpperCase())}</span><strong>#${escapeHtml(selectedGraphNodeId)}</strong><button type="button" class="graph-drawer-close" aria-label="Close receipt details" onclick="closeGraphDetails()">×</button></header><div class="graph-drawer-body"><div class="graph-drawer-kicker">RECEIPT INSPECTOR</div><article class="graph-mini-receipt"><h2>${fact}</h2><dl><dt>CONFIDENCE</dt><dd>${Math.round(confidence * 100)}%</dd><dt>SOURCE</dt><dd>${source}</dd><dt>SHA-256</dt><dd class="graph-hash">${hashValue ? `<button type="button" onclick="copyReceiptHash('${escapeHtml(selectedGraphNodeId)}')">${hash}</button>` : hash}</dd><dt>HALF-LIFE</dt><dd>${halfLifeDays ? `${halfLifeDays} days` : 'No source recorded'}</dd></dl><div class="graph-mini-barcode">${barcode}</div><div class="graph-short-hash">${escapeHtml(shortHash)}</div></article><p class="graph-drawer-related">${connected.length ? `${connected.length} derived relationship${connected.length === 1 ? '' : 's'}` : 'No derived links for this receipt.'}</p></div><footer class="graph-drawer-footer"><button type="button" class="btn-sm btn-secondary" onclick="refreshReceiptFreshness('${escapeHtml(selectedGraphNodeId)}')">Reaffirm</button><button type="button" class="btn-sm btn-secondary" onclick="openCorrectionModal('${escapeHtml(selectedGraphNodeId)}')">Edit</button><button type="button" class="btn-sm btn-danger" onclick="forgetReceipt('${escapeHtml(selectedGraphNodeId)}')">Forget</button><button class="btn-sm btn-secondary" type="button" onclick="switchView('vault')">Open in Vault</button></footer>`;

  detailPanel.querySelector('.graph-drawer-body').scrollTop = 0;

  renderSvgGraph(graphNodes, graphEdges, false);

}

function closeGraphDetails() { selectedGraphNodeId = null; graphHoveredNodeId = null; const panel = document.getElementById('graph-node-details'); if (panel) panel.hidden = true; highlightGraphNode(''); renderSvgGraph(graphNodes, graphEdges); }

function setGraphHover(id) {
  graphHoveredNodeId = id || null;
  highlightGraphNode(id || '');
  document.querySelectorAll('.graph-node').forEach(node => {
    const hovered = Boolean(id) && node.dataset.nodeId === id;
    node.classList.toggle('is-hovered', hovered);
    if (hovered) {
      node.querySelector('.graph-node-label')?.classList.add('is-visible');
      node.querySelector('.graph-node-fact')?.classList.add('is-visible');
    } else if (!graphLabelsEnabled && node.dataset.nodeId !== selectedGraphNodeId) {
      node.querySelector('.graph-node-label')?.classList.remove('is-visible');
      node.querySelector('.graph-node-fact')?.classList.remove('is-visible');
    }
  });
}

}

function handleGraphNodeKey(event, id) {

  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectGraphNode(id); }

  else if (event.key === 'Escape') { event.preventDefault(); closeGraphDetails(); }

  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowUp') {

    event.preventDefault(); const items = [...document.querySelectorAll('.graph-node:not([hidden]):not(.is-filtered)')]; const index = items.findIndex(item => item.dataset.nodeId === id); const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1; items[(index + delta + items.length) % items.length]?.focus();

  }

}

function filterGraphNodes(query) { const term = String(query || '').toLowerCase().trim(); graphFilteredIds = term ? new Set(graphNodes.filter(node => `${node.id} ${node.label}`.toLowerCase().includes(term)).map(node => String(node.id))) : null; renderSvgGraph(graphNodes, graphEdges, false); renderGraphList(); }

function toggleGraphCategory(category, button) { button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true')); if (button.getAttribute('aria-pressed') === 'true') graphHiddenCategories.delete(category); else graphHiddenCategories.add(category); renderSvgGraph(graphNodes, graphEdges, false); renderGraphList(); }

function toggleGraphLabels() {
  graphLabelsEnabled = !graphLabelsEnabled;
  const button = document.getElementById('graph-label-toggle');
  const svg = document.getElementById('memory-graph-svg');
  if (button) {
    button.setAttribute('aria-pressed', String(graphLabelsEnabled));
    button.title = graphLabelsEnabled ? 'Hide labels' : 'Show labels';
    button.setAttribute('aria-label', graphLabelsEnabled ? 'Hide labels' : 'Show labels');
  }
  if (svg) {
    svg.classList.toggle('labels-hidden', !graphLabelsEnabled);
  }
  document.querySelectorAll('.graph-node').forEach(node => {
    const label = node.querySelector('.graph-node-label');
    if (label) {
      label.classList.toggle('is-visible', graphLabelsEnabled || node.dataset.nodeId === selectedGraphNodeId || node.classList.contains('is-hovered'));
    }
  });
}

function setGraphMode(mode, button) { graphMode = mode; document.querySelectorAll('.graph-mode-toggle button').forEach(item => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-pressed', String(active)); }); document.getElementById('memory-graph-svg').hidden = mode !== 'graph'; document.getElementById('graph-list-view').hidden = mode !== 'list'; }

function renderGraphList() { const list = document.getElementById('graph-list-view'); if (!list) return; list.innerHTML = `<table><thead><tr><th>Receipt</th><th>Type</th><th>Status</th><th>Confidence</th></tr></thead><tbody>${graphNodes.filter(node => (!graphFilteredIds || graphFilteredIds.has(String(node.id))) && !graphHiddenCategories.has(String(node.category || 'memory').toLowerCase())).map(node => `<tr tabindex="0" onclick="selectGraphNode('${escapeHtml(String(node.id))}')"><td>#${escapeHtml(String(node.id))}</td><td>${escapeHtml(String(node.category || 'Memory'))}</td><td>${escapeHtml(String(node.status || 'recorded'))}</td><td>${Math.round(Number(node.confidence || 0) * 100)}%</td></tr>`).join('')}</tbody></table>`; }

function setGraphDay(value) { graphDay = Number(value) || 0; document.getElementById('graph-day-label').textContent = `DAY ${String(graphDay).padStart(2, '0')}`; document.querySelectorAll('.graph-node').forEach(node => { const initial = Number(node.dataset.confidence || 0); const memory = allMemories.find(item => String(item.id) === node.dataset.nodeId); const half = Number(memory?.half_life_days || memory?.half_life || 30); const simulated = Math.max(.05, initial * Math.pow(.5, graphDay / Math.max(1, half))); const ring = node.querySelector('.graph-confidence-ring'); const radius = Number(node.querySelector('.graph-node-disc')?.getAttribute('r') || 16) + 5; const length = 2 * Math.PI * radius; if (ring) ring.setAttribute('stroke-dashoffset', String(length * (1 - simulated))); }); }

function zoomGraph(factor, clientX = null, clientY = null) {

  const oldZoom = graphZoom;

  graphZoom = Math.max(0.5, Math.min(2.5, graphZoom * factor));

  if (clientX !== null && clientY !== null) {

    const svg = document.getElementById('memory-graph-svg'); const rect = svg?.getBoundingClientRect();

    if (rect) {

      const cursorX = clientX - rect.left; const cursorY = clientY - rect.top; const ratio = graphZoom / oldZoom;

      graphPan = { x: cursorX - (cursorX - graphPan.x) * ratio, y: cursorY - (cursorY - graphPan.y) * ratio };

    }

  }

  updateGraphTransform();

}

function resetGraphView() {

  const svg = document.getElementById('memory-graph-svg');

  if (svg) fitGraphToView(Math.max(320, svg.clientWidth), Math.max(320, svg.clientHeight));

}

// ─── Agentic Copilot & Health View ────────────────────────────────────────────

async function loadAgentDashboard() {

  fetchStats();

  await fetchStalenessAlertsGrid();

  await fetchAgentSuggestions();

}

async function fetchStalenessAlertsGrid() {

  const container = document.getElementById('agent-staleness-list');

  if (!container) return;

  try {

    const res = await fetch('/api/alerts/staleness?min_risk=low');

    if (!res.ok) return;

    const alerts = await res.json();

    const byReceipt = new Map();

    alerts.forEach(alert => {

      const id = String(alert.receipt_id);

      const current = byReceipt.get(id);

      if (!current || (alert.status === 'stale' && current.status !== 'stale')) byReceipt.set(id, alert);

    });

    const uniqueAlerts = [...byReceipt.values()];

    const freshCount = allMemories.filter(m => m.status === 'fresh').length;

    const decayCount = allMemories.filter(m => m.status === 'decaying').length;

    const staleCount = allMemories.filter(m => m.status === 'stale').length;

    document.getElementById('agent-fresh-stat').innerText = freshCount;

    document.getElementById('agent-decay-stat').innerText = decayCount;

    document.getElementById('agent-stale-stat').innerText = staleCount;

    const healthRatio = allMemories.length > 0 ? (freshCount + decayCount * 0.5) / allMemories.length : 1.0;

    const healthPct = Math.round(healthRatio * 100);

    const healthVal = document.getElementById('agent-health-value');

    if (healthVal) {

      healthVal.innerText = `${healthPct}%`;

      healthVal.style.color = healthPct > 70 ? 'var(--thermal-ledger-green)' : healthPct > 40 ? 'var(--thermal-ink-2)' : 'var(--thermal-stamp-red)';

    }

    const outerCircle = document.querySelector('.health-circle-outer');

    if (outerCircle) {

      outerCircle.style.setProperty('--health-deg', `${Math.round(healthPct * 3.6)}deg`);

    }

    if (uniqueAlerts.length === 0) {

      container.innerHTML = `

        <div style="grid-column:1/-1; padding:1.5rem; text-align:center; color:var(--thermal-ink-2); background:var(--thermal-receipt); border-radius:var(--radius-paper)">

          ${lucideIcon('sparkles')} All active memories are within healthy freshness bounds. No decay alerts at this time!

        </div>

      `;

      return;

    }

    container.innerHTML = uniqueAlerts.map(a => `

      <article class="alert-card ${a.status === 'stale' ? 'stale-danger' : ''}" tabindex="0" aria-label="Receipt ${escapeHtml(a.receipt_id)} alert, ${escapeHtml(a.status)}">

        <div class="alert-card-header">

          <strong style="color:${a.status === 'stale' ? 'var(--thermal-stamp-red)' : 'var(--thermal-ink-2)'}">

            ${a.status.toUpperCase()}: #${a.receipt_id}

          </strong>

          <span>${a.days_since_confirmed}d elapsed (${Math.round(a.current_confidence * 100)}% conf)</span>

        </div>

        <div style="font-size:0.84rem; color:var(--thermal-ink); line-height:1.4">

          "${escapeHtml(a.fact_snippet)}"

        </div>

        <div style="font-size:0.75rem; color:var(--thermal-ink-2)">

          ${escapeHtml(a.message)}

        </div>

        <div style="display:flex; gap:0.5rem; margin-top:0.4rem">

          <button class="btn-sm btn-primary" onclick="refreshReceiptFreshness('${a.receipt_id}')">Reaffirm Freshness</button>

          <button class="btn-sm btn-secondary" onclick="openCorrectionModal('${a.receipt_id}')">Correct Fact</button>

          <button class="btn-sm btn-secondary" onclick="forgetReceipt('${a.receipt_id}')">Forget</button>

        </div>

      </article>

    `).join('');

  } catch (err) {

    container.textContent = 'Freshness alerts could not be loaded. Refresh Copilot to try again.';

  }

}

async function fetchAgentSuggestions() {

  const container = document.getElementById('agent-suggestions-list');

  const spinner = document.getElementById('agent-spinner');

  const metaLabel = document.getElementById('agent-suggestions-meta');

  if (!container) return;

  if (spinner) spinner.style.display = 'inline-block';

  try {

    const res = await fetch('/api/agent/suggest', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ max_suggestions: 4 })

    });

    if (!res.ok) throw new Error('Agent analysis failed');

    const data = await res.json();

    const modelSource = String(data.model_used || '');

    const suggestionSource = data.is_simulated || /local|rule|fallback/i.test(modelSource)

      ? 'Local rules'

      : (/nemotron/i.test(modelSource) ? `Nemotron · ${modelSource.slice(0, 48)}` : 'Source not reported');

    if (metaLabel) {

      metaLabel.innerText = `Suggestion source: ${suggestionSource}`;

    }

    const rawSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];

    const uniqueSuggestions = new Map();

    rawSuggestions.forEach(suggestion => {

      const receiptIds = Array.isArray(suggestion.receipt_ids) ? suggestion.receipt_ids : [];

      const signature = `${String(suggestion.type||'').trim().toLowerCase()}|${String(suggestion.title||'').trim().toLowerCase()}|${receiptIds.slice().sort().join(',')}`;

      const key = signature.replaceAll('|','').replaceAll(',','') ? signature : JSON.stringify(suggestion);

      if (!uniqueSuggestions.has(key)) uniqueSuggestions.set(key, { ...suggestion, receipt_ids:receiptIds });

    });

    const suggestions = [...uniqueSuggestions.values()];

    if (suggestions.length === 0) {

      container.innerHTML = `

        <div style="grid-column:1/-1; padding:1.5rem; text-align:center; color:var(--thermal-ink-2); background:var(--thermal-receipt); border-radius:var(--radius-paper)">

          No maintenance recommendations were returned by ${escapeHtml(suggestionSource)}.

        </div>

      `;

      return;

    }

    container.innerHTML = suggestions.map(s => `

      <div class="suggestion-card agent-suggestion-card">

        <div class="suggestion-card-header">

          <span class="suggestion-type-tag">${escapeHtml(String(s.type || 'suggestion').replaceAll('_', ' '))}</span>

          <span class="brand-badge">${escapeHtml(String(s.priority || 'MEDIUM').toUpperCase())} PRIORITY</span>

        </div>

        <strong class="suggestion-card-title">${escapeHtml(s.title)}</strong>

        <p class="suggestion-card-desc">Rationale · ${escapeHtml(s.description || 'No rationale was returned.')}</p>

        <small class="suggestion-source">${escapeHtml(suggestionSource)}</small>

        <div class="suggestion-card-footer">

          <span class="suggestion-receipt-ids">Receipts: ${s.receipt_ids.join(', ') || 'N/A'}</span>

          ${s.receipt_ids.length > 0 ? `

            <button class="btn-sm btn-primary" onclick="openCorrectionModal('${s.receipt_ids[0]}')">Inspect / Edit</button>

          ` : ''}

        </div>

      </div>

    `).join('');

  } catch (err) {

    container.innerHTML = '<div class="agent-unavailable" role="status">Suggestions are unavailable. The saved receipts and manual actions remain available.</div>';

  } finally {

    if (spinner) spinner.style.display = 'none';

  }

}

// ─── Encrypted Cross-Device Sync ──────────────────────────────────────────────

let lastExportPayloadJson = null;

function openSyncModal(initialTab = 'export') {

  switchSyncTab(initialTab);

  openModal('modal-sync');

}

function switchSyncTab(tabName) {

  document.querySelectorAll('.sync-tab-btn').forEach(btn => btn.classList.remove('active'));

  document.querySelectorAll('.sync-panel').forEach(p => p.style.display = 'none');

  const btn = document.getElementById(`sync-tab-${tabName}`);

  const panel = document.getElementById(`sync-panel-${tabName}`);

  if (btn) btn.classList.add('active');

  if (panel) panel.style.display = 'block';

}

function switchUserProfile(profileName) {

  currentProfile = profileName;

  const shortName = profileName.split(' ')[0];

  const userLabel = document.getElementById('current-user-label');

  if (userLabel) userLabel.innerText = shortName;

  const exportUser = document.getElementById('sync-export-user');

  if (exportUser) exportUser.value = profileName;

  showToast(`Switched active profile to: ${profileName}`, 'info');

  closeModal('modal-sync');

}

async function performSyncExport() {

  const passphrase = document.getElementById('sync-export-pass').value;

  if (!passphrase || passphrase.length < 4) {

    showToast('Please enter a passphrase of at least 4 characters.', 'error');

    return;

  }

  const includeAudit = document.getElementById('sync-export-audit').checked;

  const spinner = document.getElementById('export-spinner');

  const btnLabel = document.getElementById('export-btn-label');

  const resultBox = document.getElementById('sync-export-result-box');

  const textarea = document.getElementById('sync-export-textarea');

  const checksumLabel = document.getElementById('sync-export-checksum');

  const dlBtn = document.getElementById('btn-download-bundle');

  spinner.style.display = 'inline-block';

  btnLabel.innerText = 'Encrypting Vault (PBKDF2 100k)...';

  try {

    const res = await fetch('/api/sync/export', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        passphrase: passphrase,

        user_id: currentProfile,

        include_audit_history: includeAudit

      })

    });

    if (!res.ok) {

      const err = await res.json();

      throw new Error(err.detail || 'Export failed');

    }

    const data = await res.json();

    lastExportPayloadJson = JSON.stringify(data.encrypted_bundle, null, 2);

    textarea.value = lastExportPayloadJson;

    checksumLabel.innerText = `SHA-256 Checksum: ${data.encrypted_bundle.checksum_sha256.substring(0, 24)}...`;

    resultBox.style.display = 'block';

    dlBtn.style.display = 'inline-block';

    showToast(`Encrypted ${data.encrypted_bundle.fact_count} facts with AES-256-GCM!`, 'success');

  } catch (err) {

    showToast('The encrypted export could not be created. Check the local service and try again.', 'error');

  } finally {

    spinner.style.display = 'none';

    btnLabel.innerText = 'Generate Encrypted Bundle';

  }

}

function copyExportPayload() {

  const textarea = document.getElementById('sync-export-textarea');

  if (!textarea || !textarea.value) return;

  navigator.clipboard.writeText(textarea.value);

  showToast('Encrypted JSON bundle copied to clipboard!', 'success');

}

function downloadExportBundle() {

  if (!lastExportPayloadJson) return;

  const blob = new Blob([lastExportPayloadJson], { type: 'application/json' });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;

  a.download = `receipts-vault-${currentProfile.toLowerCase().replace(/[^a-z0-9]/g, '_')}-${Date.now()}.vault`;

  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a);

  URL.revokeObjectURL(url);

  showToast('Vault bundle downloaded successfully.', 'success');

}

async function performSyncImport() {

  const payloadText = document.getElementById('sync-import-payload').value.trim();

  const passphrase = document.getElementById('sync-import-pass').value;

  const mergeStrategy = document.getElementById('sync-import-strategy').value;

  if (!payloadText) {

    showToast('Please paste an armored encrypted bundle JSON.', 'error');

    return;

  }

  if (!passphrase) {

    showToast('Please enter the decryption passphrase.', 'error');

    return;

  }

  let bundleObj;

  try {

    bundleObj = JSON.parse(payloadText);

  } catch (err) {

    showToast('Invalid JSON format in encrypted bundle.', 'error');

    return;

  }

  const spinner = document.getElementById('import-spinner');

  const btnLabel = document.getElementById('import-btn-label');

  spinner.style.display = 'inline-block';

  btnLabel.innerText = 'Decrypting & Verifying Checksum...';

  try {

    const res = await fetch('/api/sync/import', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        encrypted_bundle: bundleObj,

        passphrase: passphrase,

        merge_strategy: mergeStrategy

      })

    });

    if (!res.ok) {

      const err = await res.json();

      throw new Error(err.detail || 'Import failed');

    }

    const data = await res.json();

    closeModal('modal-sync');

    showToast(`Import complete! ${data.imported_count} facts imported, ${data.skipped_count} skipped.`, 'success');

    await fetchMemories();

    fetchStats();

  } catch (err) {

    showToast('The bundle could not be imported. Check the passphrase and bundle, then try again.', 'error');

  } finally {

    spinner.style.display = 'none';

    btnLabel.innerText = 'Decrypt & Import Vault';

  }

}

// ─── Chat Assistant & Reasoning ───────────────────────────────────────────────

function applyQuickPrompt(promptText) {

  const input = document.getElementById('chat-input');

  if (input) {

    input.value = promptText;

    input.focus();

  }

}

function toggleCompareMode() {

  compareMode = false;

  const button = document.getElementById('compare-mode-button');

  if (button) {

    button.setAttribute('aria-pressed', 'false');

    button.textContent = 'Compare · unavailable';

    button.title = 'Comparison endpoint is not available in the restored backend';

  }

  showToast('Not available with the restored backend. Standard receipt-backed chat remains available.', 'info');

}

function renderCompareResults(data) {

  const messagesContainer = document.getElementById('chat-messages');

  const staleHtml = (data.stale_receipts || []).length

    ? `<div class="compare-stale"><strong>Stale matches excluded from Receipts answer</strong>${data.stale_receipts.map(item => `<div><code>${escapeHtml(item.id)}</code> · ${Math.round(item.confidence * 100)}% · ${escapeHtml(item.content)}</div>`).join('')}</div>`

    : '<div class="compare-stale">No matching stale receipts were found.</div>';

  const wrapper = document.createElement('div');

  wrapper.className = 'compare-result-grid';

  wrapper.innerHTML = `

    <article class="compare-result-card"><h3>Without memory</h3>

      <p>${data.baseline_status === 'live' ? escapeHtml(data.baseline_answer || '') : 'Unavailable: live provider inference did not complete.'}</p>

      <small>${data.baseline_status === 'live' ? 'Live model response; no personal receipts were included.' : 'No baseline was invented.'}</small>

    </article>

    <article class="compare-result-card compare-receipts"><h3>Receipts answer</h3>

      <p>${escapeHtml(data.receipts_answer || '')}</p>

      <small>Receipt context: ${data.receipts_used?.length ? data.receipts_used.map(escapeHtml).join(', ') : 'none used'}</small>

    </article>${staleHtml}`;

  messagesContainer.appendChild(wrapper);

  messagesContainer.scrollTop = messagesContainer.scrollHeight;

}

async function handleChatSubmit(e) {

  e.preventDefault();

  if (activeChatRequestController) {

    activeChatRequestController.abort();

    return;

  }

  const input = document.getElementById('chat-input');

  const query = input.value.trim();

  if (!query) return;

  const includeStale = document.getElementById('check-include-stale').checked;

  const messagesContainer = document.getElementById('chat-messages');

  // Render User Message

  const userMsgDiv = document.createElement('div');

  userMsgDiv.className = 'chat-msg user';

  userMsgDiv.innerHTML = `

    <span class="msg-avatar user-avatar" aria-hidden="true">H</span>

    <div class="msg-bubble">${escapeHtml(query)}</div>

    <div class="msg-meta"><span>You</span> • <span>Now</span></div>

  `;

  messagesContainer.appendChild(userMsgDiv);

  const emptyHero = document.getElementById('chat-empty-hero');

  if (emptyHero) emptyHero.remove();

  input.value = '';

  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Show Sending Spinner

  const sendSpinner = document.getElementById('send-spinner');

  const sendBtn = document.getElementById('btn-chat-send');

  sendSpinner.style.display = 'inline-block';

  activeChatRequestController = new AbortController();

  sendBtn.disabled = false;

  sendBtn.setAttribute('aria-label', 'Stop response');

  sendBtn.title = 'Stop response';

  sendBtn.querySelector('svg use')?.setAttribute('href', '/static/brand/icons.svg#close');

  const typing = document.createElement('div');

  typing.className = 'chat-msg assistant typing-state';

  typing.setAttribute('role', 'status');

  typing.innerHTML = `<span class="msg-avatar" aria-hidden="true">R</span><div class="msg-bubble"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Checking relevant receipts…</span><div class="typing-skeleton"></div></div>`;

  messagesContainer.appendChild(typing);

  try {

    const res = await fetch('/api/query', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ query, include_stale: includeStale, max_receipts: 4 }),

      signal: activeChatRequestController.signal

    });

    if (!res.ok) throw new Error('Request unavailable');

    const data = await res.json();

    noteModelCallResult(data);

    typing.remove();

    renderAssistantMessage(data);

    renderUsedReceiptsInspector(data.used_receipts, data.reasoning_steps);

    // Prompt user to save extracted facts if Nemotron Nano found new ones

    if (data.extracted_facts && data.extracted_facts.length > 0) {

      promptNanoExtractedFacts(data.extracted_facts, query);

    }

  } catch (err) {

    typing.remove();

    if (err.name === 'AbortError') {

      return;

    }

    const errorDiv = document.createElement('div');

    errorDiv.className = 'chat-msg assistant';

    errorDiv.innerHTML = `

      <div class="msg-bubble" style="border-left: 3px solid var(--thermal-stamp-red)">

        <strong>${lucideIcon('alert')} Inference Error:</strong><br>

        This local assistant request could not be completed. Please check the service status and try again.

        <div style="margin-top:0.5rem; font-size:0.75rem; color:var(--thermal-ink-2)">

          This request did not complete. Check the Nebius Token Factory configuration and connection status in Settings.

        </div>

      </div>

      <div class="msg-meta"><span>Receipts Error Handler</span></div>

    `;

    messagesContainer.appendChild(errorDiv);

  } finally {

    sendSpinner.style.display = 'none';

    sendBtn.disabled = false;

    sendBtn.setAttribute('aria-label', 'Send message');

    sendBtn.title = 'Send message';

    sendBtn.querySelector('svg use')?.setAttribute('href', '/static/brand/icons.svg#send');

    activeChatRequestController = null;

    messagesContainer.scrollTop = messagesContainer.scrollHeight;

  }

}

function renderAssistantMessage(data) {

  const messagesContainer = document.getElementById('chat-messages');

  const lastModel = document.getElementById('diag-last-model');

  const lastTokens = document.getElementById('diag-last-tokens');

  const lastLatency = document.getElementById('diag-last-latency');

  if (lastModel) lastModel.textContent = data.model_used || 'Unknown';

  if (lastTokens) lastTokens.textContent = `${data.input_tokens ?? '—'} input / ${data.output_tokens ?? '—'} output`;

  if (lastLatency) lastLatency.textContent = data.latency_ms == null ? '—' : `${data.latency_ms} ms`;

  const msgDiv = document.createElement('div');

  msgDiv.className = 'chat-msg assistant';

  let receiptPills = '';

  if (data.used_receipts && data.used_receipts.length > 0) {

    const confidenceTotal = data.used_receipts.reduce((sum, receipt) => sum + Math.max(0, Math.min(1, Number(receipt.current_confidence) || 0)), 0);

    const weightedConfidence = confidenceTotal

      ? Math.round(100 * data.used_receipts.reduce((sum, receipt) => { const value = Math.max(0, Math.min(1, Number(receipt.current_confidence) || 0)); return sum + value * value; }, 0) / confidenceTotal)

      : 0;

    receiptPills = `

      <div class="used-receipts-pills">

        <div class="thermal-citation-head"><span class="pills-label">ITEMS USED</span><span title="Each cited receipt's confidence is its own weight">WEIGHTED CONFIDENCE · ${weightedConfidence}%</span></div>

        ${data.used_receipts.map(r => `

          <div class="thermal-citation-row"><button type="button" class="receipt-pill status-${r.status}" onclick="inspectReceipt('${r.id}')" title="Open Receipt #${r.id} (${r.status})">#${r.id}</button><i></i><span>${Math.round(r.current_confidence * 100)}% · ${r.status === 'decaying' ? 'FADING' : r.status.toUpperCase()}</span></div>

        `).join('')}

      </div>

    `;

  }

  const lowConfidence = (data.used_receipts || []).filter(receipt => receipt.current_confidence < 0.70);

  const confidenceNotice = lowConfidence.length ? `

    <div class="low-confidence-notice" role="status">

      <strong>Some memories need confirmation.</strong>

      ${lowConfidence.map(receipt => `<div>Receipt #${receipt.id}: ${Math.round(receipt.current_confidence * 100)}% confidence. <button type="button" class="btn-sm btn-secondary" onclick="refreshReceiptFreshness('${receipt.id}')">Reaffirm</button></div>`).join('')}

    </div>` : '';

  const telemetry = `<div class="chat-telemetry"><span>${escapeHtml(data.model_used || 'Nemotron')}</span><span>${data.input_tokens ?? '—'} input / ${data.output_tokens ?? '—'} output tokens</span><span>${data.latency_ms ?? '—'} ms</span><span>${(data.used_receipts || []).length} receipts</span></div>`;

  msgDiv.innerHTML = `

    <span class="msg-avatar" aria-hidden="true">R</span>

    <div class="msg-bubble">

      ${formatMarkdown(data.answer)}

      ${receiptPills}

    </div>

      ${confidenceNotice}

      ${data.is_simulated || data.degraded_message ? '<div class="degraded-notice" role="status">Local fallback · this answer did not come from a live model response.</div>' : ''}

      ${telemetry}

  `;

  messagesContainer.appendChild(msgDiv);

}

async function openOutboundLedger() {

  openModal('modal-outbound');

  const list = document.getElementById('outbound-ledger-list');

  if (!list) return;

  list.innerText = 'Loading outbound requests…';

  try {

    const response = await fetch('/api/outbound-ledger?limit=50');

    const data = await response.json();

    if (!response.ok) throw new Error(data.detail || 'Ledger request failed');

    if (!data.requests.length) {

      list.innerText = 'No model requests have been sent in this session.';

      return;

    }

    list.innerHTML = data.requests.map(item => `

      <details class="ledger-entry">

        <summary><span>${escapeHtml(item.purpose || 'inference')}</span><span>${escapeHtml(item.model)}</span><span>${escapeHtml(item.outcome)}</span><time>${escapeHtml(item.created_at)}</time></summary>

        <p class="ledger-redacted-preview">${escapeHtml(item.redacted_preview || 'No preview recorded.')}</p>

        <small>Receipts: ${item.receipt_ids?.length ? item.receipt_ids.map(escapeHtml).join(', ') : 'none'} · Tokens: ${item.prompt_tokens ?? '—'} input / ${item.completion_tokens ?? '—'} output · ${item.latency_ms ?? '—'} ms</small>

        <details class="ledger-exact-payload"><summary>Inspect exact request payload</summary><pre>${escapeHtml(JSON.stringify(item.request, null, 2))}</pre></details>

      </details>`).join('');

  } catch (error) {

    list.innerText = 'Outbound ledger is not available right now. Check the local service status and try again.';

  }

}

function renderUsedReceiptsInspector(usedReceipts, reasoningSteps) {

  const body = document.getElementById('inspector-body');

  const countBadge = document.getElementById('inspector-count-badge');

  if (!body) return;

  if (!usedReceipts || usedReceipts.length === 0) {

    body.innerHTML = `

      <div class="empty-inspector">

        <div style="font-size:1.1rem; color:var(--thermal-ink-2); font-weight:600">No Receipts Used</div>

        <div>Assistant answered from parametric base weights. No local sovereign receipts matched query context.</div>

      </div>

    `;

    if (countBadge) countBadge.innerText = '0 Receipts';

    return;

  }

  if (countBadge) countBadge.innerText = `${usedReceipts.length} Receipt${usedReceipts.length > 1 ? 's' : ''}`;

  let stepsHtml = '';

  if (reasoningSteps && reasoningSteps.length > 0) {

    stepsHtml = `

      <div class="reasoning-steps-box">

        <div class="reasoning-title">NEMOTRON PROVENANCE TRACE</div>

        ${reasoningSteps.map(s => `<div class="step-line">• ${escapeHtml(s)}</div>`).join('')}

      </div>

    `;

  }

  const receiptsHtml = usedReceipts.map(r => {

    const mem = allMemories.find(m => m.id === r.id);

    if (mem) return renderReceiptCardHtml(mem);

    return `

      <div class="receipt-mini-card">

        <strong>#${r.id}</strong> — ${escapeHtml(r.fact_snippet)} (${Math.round(r.confidence * 100)}%)

      </div>

    `;

  }).join('');

  body.innerHTML = stepsHtml + receiptsHtml;

}

function inspectReceipt(receiptId) {
  const mem = allMemories.find(m => m.id === receiptId);
  const body = document.getElementById('inspector-body');
  if (!body) return;

  if (mem) {
    body.innerHTML = renderReceiptCardHtml(mem);
    const countBadge = document.getElementById('inspector-count-badge');
    if (countBadge) countBadge.innerText = '#' + receiptId;
    const card = body.querySelector('.receipt-card');
    if (card) card.setAttribute('open', '');
  }
}

function promptNanoExtractedFacts(extractedFacts, userMessage) {

  const messagesContainer = document.getElementById('chat-messages');

  const promptDiv = document.createElement('div');

  promptDiv.className = 'chat-msg assistant';

  promptDiv.innerHTML = `

    <div class="msg-bubble nano-extract-prompt">

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem">

        <strong>${lucideIcon('sparkles')} Nemotron Nano Extracted Facts</strong>

        <span class="brand-badge">Auto-Extraction</span>

      </div>

      <p style="font-size:0.8rem; color:var(--thermal-ink-2); margin-bottom:0.5rem">

        Nemotron Nano detected new factual statements in this interaction. Would you like to commit them to your sovereign vault?

      </p>

      ${extractedFacts.map((f, i) => `

        <div class="extracted-fact-item" id="ext-fact-${i}">

          <div style="font-size:0.85rem"><strong>Fact:</strong> ${escapeHtml(f.content)}</div>

          <div style="font-size:0.75rem; color:var(--thermal-ink-3); margin-top:2px">

            Excerpt: "${escapeHtml(f.source_excerpt)}" • Curve: ${f.decay_curve}

          </div>

        </div>

      `).join('')}

      <div style="display:flex; gap:0.5rem; margin-top:0.75rem">

        <button class="btn-sm btn-primary" onclick="saveExtractedFacts(${JSON.stringify(extractedFacts).replace(/"/g, '&quot;')}, '${escapeHtml(userMessage)}')">

          Save to Vault Receipts

        </button>

        <button class="btn-sm btn-secondary" onclick="this.closest('.chat-msg').remove()">

          Discard

        </button>

      </div>

    </div>

  `;

  messagesContainer.appendChild(promptDiv);

  messagesContainer.scrollTop = messagesContainer.scrollHeight;

}

async function saveExtractedFacts(facts, userMsg) {

  try {

    const res = await fetch('/api/memories/nano-save', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        facts: facts,

        source_title: `Conversation Query: "${userMsg.substring(0, 30)}..."`

      })

    });

    if (!res.ok) throw new Error('Failed to save extracted facts');

    const created = await res.json();

    showToast(`Saved ${created.length} new receipt(s) from Nemotron Nano!`, 'success');

    await fetchMemories();

  } catch (err) {

    showToast('The extracted receipts could not be saved. Try again in a moment.', 'error');

  }

}

// ─── Tavily Web Ingest Modal ──────────────────────────────────────────────────

function openTavilyIngestModal() {

  openModal('modal-tavily');

}

async function submitTavilyIngest() {

  const query = document.getElementById('tavily-query-input').value.trim();

  const decay_curve = document.getElementById('tavily-decay-select').value;

  if (!query) {

    showToast('Please enter a query to search and ingest via Tavily.', 'error');

    return;

  }

  const spinner = document.getElementById('tavily-spinner');

  const btnText = document.getElementById('tavily-btn-text');

  spinner.style.display = 'inline-block';

  btnText.innerText = 'Searching & Ingesting...';

  try {

    const res = await fetch('/api/tavily/ingest', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ query, category: 'factual_web', decay_curve })

    });

    if (!res.ok) throw new Error('Search failed');

    const created = await res.json();

    closeModal('modal-tavily');

    showToast(`Tavily web fact ingested as Receipt #${created.id}!`, 'success');

    await fetchMemories();

    inspectReceipt(created.id);

  } catch (err) {

    showToast('Web receipts could not be added. Check the Tavily key in Settings and try again.', 'error');

  } finally {

    spinner.style.display = 'none';

    btnText.innerText = 'Search & Ingest';

  }

}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function openSettingsModal() {

  openModal('modal-settings');

  const status = document.getElementById('settings-status');

  if (status) status.textContent = '';

  loadAvailableModels();

}

function toggleCredentialVisibility(inputId, button) {

  const input = document.getElementById(inputId);

  if (!input || !button) return;

  const reveal = input.type === 'password';

  input.type = reveal ? 'text' : 'password';

  button.textContent = reveal ? 'Hide' : 'Show';

  button.setAttribute('aria-pressed', String(reveal));

  button.setAttribute('aria-label', `${reveal ? 'Hide' : 'Show'} ${inputId.includes('tavily') ? 'Tavily' : 'Nebius'} API key`);

}

async function loadAvailableModels() {

  const select = document.getElementById('setting-nemotron-model');

  const status = document.getElementById('model-list-status');

  if (!select) return;

  if (status) status.innerText = 'Checking saved API key…';

  try {

    const engineResponse = await fetch('/api/engine-status');

    if (!engineResponse.ok) throw new Error('Engine status unavailable');

    const engine = await engineResponse.json();

    if (!engine.has_api_key) {

      if (status) status.innerText = 'Add an API key and save Settings before checking model IDs.';

      select.replaceChildren(new Option('Save an API key to load models', ''));

      return false;

    }

    if (status) status.innerText = 'Loading model IDs from Token Factory…';

    const res = await fetch('/api/models');

    const data = await res.json();

    if (!res.ok) throw new Error('Model list unavailable');

    const models = (data.models || []).filter(id => id.toLowerCase().includes('nemotron'));

    const current = select.dataset.current || '';

    select.replaceChildren(new Option('Keep current model', ''));

    models.forEach(id => select.add(new Option(id, id)));

    select.dataset.current = current;

    if (status) status.innerText = models.length ? `${models.length} Nemotron model IDs returned by Token Factory.` : 'No Nemotron model IDs returned; current model is unchanged.';

    return models.length > 0;

  } catch (err) {

    select.replaceChildren(new Option('Keep current model (lookup unavailable)', ''));

    if (status) status.innerText = 'Model list is unavailable. The saved model remains unchanged.';

    return false;

  }

}

async function testTokenFactoryConnection() {

  const status = document.getElementById('model-list-status');

  const button = document.getElementById('btn-test-tokenfactory');

  const spinner = document.getElementById('tokenfactory-spinner');

  if (button) button.disabled = true;

  if (spinner) spinner.hidden = false;

  if (status) status.innerText = 'Checking the saved Token Factory connection…';

  const result = await loadAvailableModels();

  if (status) status.innerText = result ? 'Connection and model list verified.' : (status.textContent.includes('API key') ? status.textContent : 'Connection could not be verified. The saved model remains unchanged.');

  if (button) button.disabled = false;

  if (spinner) spinner.hidden = true;

  fetchEngineStatus();

}

async function runDemoSelfTest() {

  const button = document.getElementById('btn-demo-self-test');

  const result = document.getElementById('demo-self-test-result');

  if (button) button.disabled = true;

  if (result) result.innerText = 'Running local checks and configured provider probes…';

  try {

    const res = await fetch('/api/self-test', { method: 'POST' });

    const data = await res.json();

    if (!res.ok) throw new Error('self-test unavailable');

    const lines = Object.entries(data.checks || {}).map(([name, check]) => `${name}: ${String(check.status || 'unknown').toUpperCase()}`);

    if (result) result.innerText = `${String(data.status || 'complete').toUpperCase()}\n${lines.join('\n') || 'No individual checks were returned.'}`;

  } catch {

    if (result) result.innerText = 'Self-test could not complete. Check the local server and try again.';

  } finally {

    if (button) button.disabled = false;

  }

}

async function submitSettings() {

  const nebiusKey = document.getElementById('setting-nebius-key').value.trim();

  const nemotronModel = document.getElementById('setting-nemotron-model').value;

  const tavilyKey = document.getElementById('setting-tavily-key').value.trim();

  const status = document.getElementById('settings-status');

  const saveButton = document.querySelector('#modal-settings .modal-footer .btn-primary');

  if (status) status.textContent = 'Saving settings…';

  if (saveButton) saveButton.disabled = true;

  try {

    const res = await fetch('/api/settings', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        nebius_api_key: nebiusKey || null,

        tavily_api_key: tavilyKey || null,

        nemotron_model: nemotronModel || null

      })

    });

    const data = await res.json();

    if (!res.ok) throw new Error('Settings update failed');

    closeModal('modal-settings');

    showToast('Settings saved. Active model: ' + data.model, 'success');

    const keyInput = document.getElementById('setting-nebius-key');

    if (keyInput) keyInput.value = '';

    const tavilyInput = document.getElementById('setting-tavily-key');

    if (tavilyInput) tavilyInput.value = '';

    fetchEngineStatus();

  } catch {

    if (status) status.textContent = 'Settings could not be saved. Check the local server and try again.';

    showToast('Settings could not be saved.', 'error');

  } finally {

    if (saveButton) saveButton.disabled = false;

  }

}

// ─── Reset Demo ───────────────────────────────────────────────────────────────

async function resetDemoData() {

  if (!confirm('Reset memory vault back to pristine default demo state?')) return;

  try {

    const res = await fetch('/api/reset-demo', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ confirmed: true })

    });

    if (!res.ok) throw new Error('Reset failed');

    showToast('Memory vault reset to default receipts.', 'success');

    await fetchMemories();

  } catch (err) {

    showToast('The demo vault could not be reset. Try again in a moment.', 'error');

  }

}

async function copyReceiptHash(receiptId) {

  const receipt = allMemories.find(item => item.id === receiptId);

  if (!receipt?.receipt_hash) return;

  try {

    await navigator.clipboard.writeText(receipt.receipt_hash);

    showToast('Receipt hash copied.', 'success');

  } catch {

    showToast('Clipboard access is unavailable in this browser context.', 'error');

  }

}

async function verifyVaultIntegrity() {

  try {

    const response = await fetch('/api/integrity');

    if (!response.ok) throw new Error('Integrity check request failed');

    const result = await response.json();

    if (result.valid) showToast(`Receipt chain verified: ${result.receipts_checked} records checked.`, 'success');

    else showToast(`Receipt chain check failed at ${result.failed_receipt_id}. Do not modify this vault until reviewed.`, 'error');

  } catch (error) {

    showToast('Integrity check is not available right now. Check the local service status and try again.', 'error');

  }

}

// ─── Interactive Sovereignty Demo Tour Runner ─────────────────────────────────

function initializeTourChecklist() {

  const cards = [...document.querySelectorAll('#view-tour .tour-card')];

  cards.forEach((card, index) => {

    const step = index + 1;

    card.dataset.tourStep = String(step);

    let result = card.querySelector('.tour-step-result');

    if (!result) {

      result = document.createElement('p');

      result.className = 'tour-step-result';

      result.setAttribute('role', 'status');

      result.setAttribute('aria-live', 'polite');

      result.innerHTML = '<span aria-hidden="true">○</span> Ready to inspect';

      card.append(result);

    }

    const button = card.querySelector('.tour-action-box button');

    if (button) { button.dataset.tourRun = String(step); button.setAttribute('aria-label', `Run tour check ${step}`); }

  });

  document.querySelectorAll('[data-tour-jump]').forEach(button => button.addEventListener('click', () => {

    const card = document.querySelector(`#view-tour [data-tour-step="${button.dataset.tourJump}"]`);

    card?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });

  }));

}

async function runTourStep(stepNum) {

  const card = document.querySelector(`#view-tour [data-tour-step="${stepNum}"]`);

  const result = card?.querySelector('.tour-step-result');

  const button = card?.querySelector('.tour-action-box button');

  if (!card || !result) return;

  if (button) button.disabled = true;

  result.className = 'tour-step-result is-running';

  result.innerHTML = '<span class="spinner" aria-hidden="true"></span> Checking this step…';

  let state = 'passed'; let message = 'Step completed.';

  try {

    if (stepNum === 1 || stepNum === 4) {

      switchView('chat');

      applyQuickPrompt('How should we schedule the sprint planning meeting?');

      const before = document.querySelectorAll('#chat-messages .chat-msg').length;

      document.getElementById('chat-form')?.requestSubmit();

      const startedAt = Date.now();

      while (activeChatRequestController && Date.now() - startedAt < 30000) await new Promise(resolve => setTimeout(resolve, 100));

      const messages = document.querySelectorAll('#chat-messages .chat-msg');

      if (messages.length <= before) throw new Error('Chat did not produce a response');

      message = 'PASSED · Chat returned a response with its current provider or local fallback.';

    } else if (stepNum === 2) {

      switchView('vault');

      await fetchMemories();

      const target = allMemories.find(memory => memory.id === 'REC-ASYNC1') || allMemories[0];

      if (!target) throw new Error('No receipt is available to inspect');

      inspectReceipt(target.id);

      message = `PASSED · Receipt #${target.id} opened in the inspector.`;

    } else if (stepNum === 3) {

      switchView('vault');

      await fetchMemories();

      const target = allMemories.find(memory => memory.id === 'REC-ASYNC1') || allMemories[0];

      if (!target) throw new Error('No receipt is available to correct');

      openCorrectionModal(target.id);

      message = `PASSED · Correction dialog opened for #${target.id}. Save is still user-confirmed.`;

    } else if (stepNum === 5) {

      switchView('vault');

      await fetchMemories();

      const target = allMemories.find(memory => memory.id === 'REC-NEMO3' && memory.source_url) || allMemories.find(memory => memory.source_url);

      if (!target) throw new Error('No web receipt is available to verify');

      state = 'unavailable';

      message = `STATUS UNAVAILABLE · The read-only engine endpoint does not expose Tavily key status. Open Settings, then use Verify on #${target.id}.`;

    } else if (stepNum === 6) {

      await openSyncModal('export');

      message = 'PASSED · Encrypted Sync is open. Export remains user-confirmed.';

    } else {

      throw new Error('Unknown tour step');

    }

  } catch (error) {

    state = 'failed';

    message = 'FAILED · This step could not complete. Check the related screen and try again.';

  } finally {

    result.className = `tour-step-result is-${state}`;

    result.textContent = message;

    if (button) button.disabled = false;

    document.querySelectorAll('[data-tour-jump]').forEach(item => item.classList.toggle('is-complete', item.dataset.tourJump === String(stepNum) && state === 'passed'));

  }

}

async function runAllTourChecks() {

  const button = document.querySelector('.tour-run-all');

  if (button) button.disabled = true;

  try {

    for (let step = 1; step <= 6; step += 1) await runTourStep(step);

    showToast('Tour checks finished. Review each step result.', 'success');

  } finally {

    if (button) button.disabled = false;

  }

}

async function runGuidedDemo() { return runAllTourChecks(); }

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function escapeHtml(text) {

  if (!text) return '';

  return String(text)

    .replace(/&/g, '&amp;')

    .replace(/</g, '&lt;')

    .replace(/>/g, '&gt;')

    .replace(/"/g, '&quot;')

    .replace(/'/g, '&#039;');

}

function formatMarkdown(text) {

  if (!text) return '';

  return escapeHtml(text)

    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

    .replace(/\*(.*?)\*/g, '<em>$1</em>')

    .replace(/`(.*?)`/g, '<code>$1</code>')

    .replace(/\n\n/g, '<br><br>')

    .replace(/\n/g, '<br>');

}

