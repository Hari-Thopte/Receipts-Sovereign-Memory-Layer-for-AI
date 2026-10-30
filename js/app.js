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
let addConflictDebounceTimer = null;

// Barcode SVG Generator for physical receipt feel
function generateBarcodeSvg() {
  const bars = [2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 2, 3, 1, 4, 2, 1, 3, 1, 2];
  let rects = '';
  let x = 0;
  bars.forEach((w, i) => {
    if (i % 2 === 0) {
      rects += `<rect x="${x}" y="0" width="${w * 1.5}" height="22" fill="#1e293b" />`;
    }
    x += w * 2.2;
  });
  return `<svg class="barcode-svg" viewBox="0 0 ${x} 22" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

// Lifecycle Init
document.addEventListener('DOMContentLoaded', () => {
  fetchStats();
  fetchMemories();
  fetchEngineStatus();
  checkStalenessAlerts();
  // Poll staleness alerts every 30 seconds
  setInterval(checkStalenessAlerts, 30000);
});

// Navigation View Switcher
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab-btn').forEach(el => el.classList.remove('active'));

  const viewEl = document.getElementById(`view-${viewName}`);
  const btnEl = document.getElementById(`tab-btn-${viewName}`);

  if (viewEl) viewEl.classList.add('active');
  if (btnEl) btnEl.classList.add('active');

  if (viewName === 'vault') {
    fetchMemories();
  } else if (viewName === 'graph') {
    reloadMemoryGraph();
  } else if (viewName === 'agent') {
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
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

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
    if (healthEl) {
      healthEl.innerText = `${healthPct}%`;
      healthEl.style.color = healthPct > 70 ? 'var(--accent-fresh)' : healthPct > 40 ? 'var(--accent-decay)' : 'var(--accent-stale)';
    }

    const dbPathLabel = document.getElementById('vault-db-path-label');
    if (dbPathLabel && data.db_path) {
      dbPathLabel.innerText = `${data.db_path} (${data.storage_size_kb} KB)`;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function fetchEngineStatus() {
  try {
    const res = await fetch('/api/engine-status');
    if (!res.ok) return;
    const data = await res.json();

    const pill = document.getElementById('model-display-pill');
    if (pill) {
      pill.innerText = formatModelPill(data.chat_model);
    }

    const dot = document.getElementById('engine-status-dot');
    const liveTag = document.getElementById('engine-live-tag');
    if (dot) {
      dot.className = data.is_live ? 'dot dot-green' : 'dot dot-amber';
    }
    if (liveTag) {
      liveTag.innerText = data.is_live ? 'LIVE' : 'KEY REQ';
      liveTag.style.borderColor = data.is_live ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)';
      liveTag.style.color = data.is_live ? '#10b981' : '#f59e0b';
    }

    // Diagnostics modal elements
    const diagProv = document.getElementById('diag-provider');
    if (diagProv) diagProv.innerText = data.active_endpoint.includes('nvidia') ? 'NVIDIA NIM (integrate.api.nvidia.com)' : 'Nebius Token Factory';
    const diagBase = document.getElementById('diag-base-url');
    if (diagBase) diagBase.innerText = data.active_endpoint;
    const diagChat = document.getElementById('diag-chat-model');
    if (diagChat) diagChat.innerText = data.chat_model;
    const diagExtr = document.getElementById('diag-extract-model');
    if (diagExtr) diagExtr.innerText = data.extract_model;
    const diagKey = document.getElementById('diag-key-status');
    if (diagKey) diagKey.innerText = data.has_api_key ? `Active Key (${data.key_prefix})` : 'Missing Key';
    const diagStrict = document.getElementById('diag-strict-mode');
    if (diagStrict) diagStrict.innerText = data.strict_live_mode ? 'ENABLED (Strict Demo — No Simulations)' : 'Simulation Fallbacks Allowed';
  } catch (err) {
    console.error('Failed to load engine status:', err);
  }
}

function openEngineModal() {
  fetchEngineStatus();
  openModal('modal-engine');
}

// ─── Proactive Staleness Alerts ───────────────────────────────────────────────

async function checkStalenessAlerts() {
  try {
    const res = await fetch('/api/alerts/staleness?min_risk=medium');
    if (!res.ok) return;
    const alerts = await res.json();

    const banner = document.getElementById('staleness-alert-banner');
    const bannerText = document.getElementById('staleness-banner-text');
    const badge = document.getElementById('agent-alerts-badge');

    if (alerts.length > 0) {
      const staleCount = alerts.filter(a => a.status === 'stale').length;
      const decayCount = alerts.length - staleCount;
      let text = '<strong>Memory Staleness Alert:</strong> ';
      if (staleCount > 0) {
        text += `${staleCount} fact${staleCount > 1 ? 's have' : ' has'} decayed below 40% confidence (stale). `;
      }
      if (decayCount > 0) {
        text += `${decayCount} decaying fact${decayCount > 1 ? 's' : ''} require freshness reaffirmation.`;
      }
      bannerText.innerHTML = text;
      banner.style.display = 'block';

      if (badge) {
        badge.innerText = alerts.length;
        badge.style.display = 'inline-block';
      }
    } else {
      banner.style.display = 'none';
      if (badge) badge.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to fetch staleness alerts:', err);
  }
}

function dismissStalenessBanner() {
  const banner = document.getElementById('staleness-alert-banner');
  if (banner) banner.style.display = 'none';
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
    fetchStats();
  } catch (err) {
    showToast('Error loading memory receipts: ' + err.message, 'error');
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
        <div style="font-size:2rem; margin-bottom:0.5rem">📂</div>
        <h3>No Sovereign Receipts Found</h3>
        <p style="color:var(--text-muted); font-size:0.9rem; margin-top:0.4rem">
          Try clearing filters or add a new memory receipt above.
        </p>
      </div>
    `;
    return;
  }

  grid.innerHTML = memories.map(mem => renderReceiptCardHtml(mem)).join('');
}

function renderReceiptCardHtml(mem) {
  const confPct = Math.round(mem.current_confidence * 100);
  const statusColor = mem.status === 'fresh' ? 'var(--accent-fresh)' : mem.status === 'decaying' ? 'var(--accent-decay)' : 'var(--accent-stale)';
  const statusBg = mem.status === 'fresh' ? 'var(--accent-fresh-bg)' : mem.status === 'decaying' ? 'var(--accent-decay-bg)' : 'var(--accent-stale-bg)';

  const auditRows = (mem.audit_history || []).slice(-3).map(a => `
    <div class="audit-entry">
      <span class="audit-time">${a.timestamp.substring(0, 10)}</span>
      <span class="audit-action">${a.action.toUpperCase()}</span>
      <span class="audit-note">${a.reason || ''}</span>
    </div>
  `).join('');

  return `
    <div class="receipt-card status-${mem.status}" id="card-${mem.id}">
      <div class="receipt-cutout-top"></div>
      
      <!-- Receipt Header -->
      <div class="receipt-header">
        <div class="receipt-header-row">
          <span class="receipt-id">#${mem.id}</span>
          <span class="receipt-status-badge" style="color:${statusColor}; background:${statusBg}">
            ${mem.status.toUpperCase()} (${confPct}%)
          </span>
        </div>
        <div class="receipt-category-tag">${mem.category.replace('_', ' ').toUpperCase()} • ${mem.decay_curve.replace('_', ' ').toUpperCase()}</div>
      </div>

      <!-- Receipt Fact Body -->
      <div class="receipt-body">
        <div class="receipt-fact-label">SOVEREIGN FACT STATEMENT</div>
        <div class="receipt-fact-content">${escapeHtml(mem.content)}</div>

        <!-- Literal Provenance Excerpt -->
        <div class="receipt-provenance-box">
          <div class="provenance-header">
            <span>SOURCE: ${escapeHtml(mem.source_title)} (${mem.source_type})</span>
            ${mem.source_url ? `<a href="${mem.source_url}" target="_blank" class="source-link" title="Open source URL">↗</a>` : ''}
          </div>
          <div class="provenance-excerpt">"${escapeHtml(mem.source_excerpt)}"</div>
          ${mem.source_hash ? `<div class="provenance-hash">SHA-256: ${mem.source_hash.substring(0, 16)}...</div>` : ''}
        </div>

        <!-- Freshness Decay Bar -->
        <div class="decay-bar-container">
          <div class="decay-bar-labels">
            <span>CONFIDENCE DECAY (${mem.days_since_confirmed}d ago)</span>
            <span>${confPct}%</span>
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
          ${generateBarcodeSvg()}
        </div>

        <div class="receipt-actions">
          <button class="btn-action btn-refresh" onclick="refreshReceiptFreshness('${mem.id}')" title="Reaffirm that this fact is still accurate to reset decay clock">
            ↻ Fresh
          </button>
          <button class="btn-action btn-correct" onclick="openCorrectionModal('${mem.id}')" title="Sovereign edit: correct this memory with auditable trail">
            ✎ Correct
          </button>
          ${mem.source_type === 'tavily_search' ? `
            <button class="btn-action btn-verify-tavily" onclick="verifyTavilySource('${mem.id}', this)" title="Verify live web source via Tavily">
              ✓ Verify Web
            </button>
          ` : ''}
          <button class="btn-action btn-forget" onclick="forgetReceipt('${mem.id}')" title="Permanent sovereign erasure">
            ✕ Forget
          </button>
        </div>
      </div>

      <div class="receipt-cutout-bottom"></div>
    </div>
  `;
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
    console.error('Conflict check error:', err);
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
        warn.innerText = `⚠️ Notice: Also overlaps with #${top.existing_receipt_id}: "${top.existing_content.substring(0, 60)}..."`;
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
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px">
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
    showToast('Failed to check vault conflicts: ' + err.message, 'error');
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
    showToast('Conflict resolution error: ' + err.message, 'error');
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
  const pill = document.getElementById('add-conflict-pill');
  if (pill) pill.style.display = 'none';
  openModal('modal-add');
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
    showToast('Error saving receipt: ' + err.message, 'error');
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
    showToast('Correction error: ' + err.message, 'error');
  }
}

// ─── Freshness Refresh & Sovereign Forget ─────────────────────────────────────

async function refreshReceiptFreshness(receiptId) {
  try {
    const res = await fetch(`/api/memories/${receiptId}/refresh`, { method: 'POST' });
    if (!res.ok) throw new Error('Refresh failed');
    const updated = await res.json();
    showToast(`Freshness reaffirmed for #${updated.id}! Decay clock reset to 100%.`, 'success');
    await fetchMemories();
    checkStalenessAlerts();
  } catch (err) {
    showToast('Error refreshing memory: ' + err.message, 'error');
  }
}

async function forgetReceipt(receiptId) {
  if (!confirm(`Permanently erase Receipt #${receiptId} from your sovereign local SQLite vault?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/memories/${receiptId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Deletion failed');
    showToast(`Receipt #${receiptId} permanently erased. Tombstone recorded.`, 'info');
    await fetchMemories();
    checkStalenessAlerts();
  } catch (err) {
    showToast('Error deleting memory: ' + err.message, 'error');
  }
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
    } else if (data.status === 'drifted') {
      showToast(`Source content has drifted on the live web since ingestion.`, 'info');
    } else {
      showToast(`Source check status: ${data.status}. Details: ${data.details}`, 'info');
    }
    await fetchMemories();
  } catch (err) {
    showToast('Tavily verification failed: ' + err.message, 'error');
  } finally {
    if (buttonEl) {
      buttonEl.innerText = '✓ Verify Web';
      buttonEl.disabled = false;
    }
  }
}

// ─── Interactive Long-Term Memory Graph ───────────────────────────────────────

async function reloadMemoryGraph() {
  const svg = document.getElementById('memory-graph-svg');
  const emptyState = document.getElementById('graph-empty-state');
  if (!svg) return;

  if (emptyState) emptyState.style.display = 'flex';

  try {
    const res = await fetch('/api/graph');
    if (!res.ok) throw new Error('Failed to load memory graph');
    const graphData = await res.json();

    graphNodes = graphData.nodes || [];
    graphEdges = graphData.edges || [];

    renderSvgGraph(graphNodes, graphEdges);
    if (emptyState) emptyState.style.display = 'none';
  } catch (err) {
    if (emptyState) emptyState.innerText = 'Failed to render memory graph: ' + err.message;
  }
}

function renderSvgGraph(nodes, edges) {
  const svg = document.getElementById('memory-graph-svg');
  if (!svg) return;

  const width = svg.clientWidth || 750;
  const height = svg.clientHeight || 560;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.36;

  // Compute circular/cluster coordinates for nodes
  const nodeMap = {};
  const total = nodes.length;

  nodes.forEach((node, i) => {
    // Cluster by category angles
    const catOffset = {
      preference: 0,
      active_project: Math.PI * 0.5,
      factual_web: Math.PI * 1.0,
      personal: Math.PI * 1.5
    }[node.category] || 0;

    const angle = (i / total) * Math.PI * 2 + catOffset * 0.2;
    const r = radius * (0.65 + (i % 3) * 0.18);
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;
    nodeMap[node.id] = { ...node, x, y };
  });

  // Render SVG Edges
  let edgesHtml = edges.map((e, idx) => {
    const src = nodeMap[e.source];
    const tgt = nodeMap[e.target];
    if (!src || !tgt) return '';
    return `<line id="edge-${idx}" class="graph-edge" x1="${src.x}" y1="${src.y}" x2="${tgt.x}" y2="${tgt.y}" stroke-width="${Math.max(1, e.weight * 3)}" data-source="${e.source}" data-target="${e.target}" />`;
  }).join('');

  // Render SVG Nodes
  let nodesHtml = Object.values(nodeMap).map(n => {
    const r = Math.max(14, Math.min(28, n.confidence * 24));
    const label = n.label.length > 25 ? n.label.substring(0, 25) + '...' : n.label;
    return `
      <g class="graph-node" id="node-${n.id}" transform="translate(${n.x}, ${n.y})" onclick="selectGraphNode('${n.id}')">
        <circle r="${r}" fill="${n.color}" opacity="0.85" stroke="rgba(255,255,255,0.2)" stroke-width="1.5">
          <title>${escapeHtml(n.label)} (${Math.round(n.confidence * 100)}%)</title>
        </circle>
        <text y="${r + 14}" text-anchor="middle">${escapeHtml(label)}</text>
      </g>
    `;
  }).join('');

  svg.innerHTML = `
    <g id="graph-viewport" transform="scale(${graphZoom})">
      <g class="edges-group">${edgesHtml}</g>
      <g class="nodes-group">${nodesHtml}</g>
    </g>
  `;
}

function selectGraphNode(nodeId) {
  selectedGraphNodeId = nodeId;
  const mem = allMemories.find(m => m.id === nodeId);
  const detailPanel = document.getElementById('graph-node-details');
  if (!detailPanel) return;

  if (!mem) {
    detailPanel.innerHTML = `<div class="empty-inspector"><div>Receipt #${nodeId} not found in active vault.</div></div>`;
    return;
  }

  // Highlight connected edges
  document.querySelectorAll('.graph-edge').forEach(edge => {
    const isConn = edge.getAttribute('data-source') === nodeId || edge.getAttribute('data-target') === nodeId;
    edge.classList.toggle('highlighted', isConn);
  });

  detailPanel.innerHTML = `
    <div style="padding:0.5rem 0">
      ${renderReceiptCardHtml(mem)}
    </div>
  `;
}

function zoomGraph(factor) {
  graphZoom = Math.max(0.5, Math.min(2.5, graphZoom * factor));
  const vp = document.getElementById('graph-viewport');
  if (vp) vp.setAttribute('transform', `scale(${graphZoom})`);
}

function resetGraphView() {
  graphZoom = 1.0;
  const vp = document.getElementById('graph-viewport');
  if (vp) vp.setAttribute('transform', 'scale(1.0)');
  reloadMemoryGraph();
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
      healthVal.style.color = healthPct > 70 ? 'var(--accent-fresh)' : healthPct > 40 ? 'var(--accent-decay)' : 'var(--accent-stale)';
    }

    const outerCircle = document.querySelector('.health-circle-outer');
    if (outerCircle) {
      outerCircle.style.setProperty('--health-deg', `${Math.round(healthPct * 3.6)}deg`);
    }

    if (alerts.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1; padding:1.5rem; text-align:center; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-md)">
          ✨ All active memories are within healthy freshness bounds. No decay alerts at this time!
        </div>
      `;
      return;
    }

    container.innerHTML = alerts.map(a => `
      <div class="alert-card ${a.status === 'stale' ? 'stale-danger' : ''}">
        <div class="alert-card-header">
          <strong style="color:${a.status === 'stale' ? 'var(--accent-stale)' : 'var(--accent-decay)'}">
            ${a.status.toUpperCase()}: #${a.receipt_id}
          </strong>
          <span>${a.days_since_confirmed}d elapsed (${Math.round(a.current_confidence * 100)}% conf)</span>
        </div>
        <div style="font-size:0.84rem; color:var(--text-main); line-height:1.4">
          "${escapeHtml(a.fact_snippet)}"
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted)">
          ${escapeHtml(a.message)}
        </div>
        <div style="display:flex; gap:0.5rem; margin-top:0.4rem">
          <button class="btn-sm btn-primary" onclick="refreshReceiptFreshness('${a.receipt_id}')">Reaffirm Freshness</button>
          <button class="btn-sm btn-secondary" onclick="openCorrectionModal('${a.receipt_id}')">Correct Fact</button>
          <button class="btn-sm btn-secondary" onclick="forgetReceipt('${a.receipt_id}')">Forget</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to render staleness grid:', err);
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

    if (metaLabel && data.model_used) {
      metaLabel.innerText = `Engine: ${data.model_used.substring(0, 60)}`;
    }

    const suggestions = data.suggestions || [];
    if (suggestions.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1; padding:1.5rem; text-align:center; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-md)">
          Vault topology is cleanly configured. Nemotron found no urgent maintenance items.
        </div>
      `;
      return;
    }

    container.innerHTML = suggestions.map(s => `
      <div class="suggestion-card">
        <div style="display:flex; justify-content:space-between; align-items:center">
          <span class="suggestion-type-tag">${s.type.replace('_', ' ')}</span>
          <span class="brand-badge">${s.priority.toUpperCase()} PRIORITY</span>
        </div>
        <strong style="font-size:0.92rem">${escapeHtml(s.title)}</strong>
        <p style="font-size:0.82rem; color:var(--text-muted); line-height:1.4">${escapeHtml(s.description)}</p>
        <div style="margin-top:auto; padding-top:0.5rem; display:flex; justify-content:space-between; align-items:center">
          <span style="font-size:0.75rem; color:var(--text-dim)">Receipts: ${s.receipt_ids.join(', ') || 'N/A'}</span>
          ${s.receipt_ids.length > 0 ? `
            <button class="btn-sm btn-primary" onclick="openCorrectionModal('${s.receipt_ids[0]}')">Inspect / Edit</button>
          ` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="grid-column:1/-1; color:var(--accent-stale)">Agent suggestions unavailable: ${err.message}</div>`;
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
    showToast('Export error: ' + err.message, 'error');
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
    showToast('Import error: ' + err.message, 'error');
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

async function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const query = input.value.trim();
  if (!query) return;

  const includeStale = document.getElementById('check-include-stale').checked;
  const messagesContainer = document.getElementById('chat-messages');

  // Render User Message
  const userMsgDiv = document.createElement('div');
  userMsgDiv.className = 'chat-msg user';
  userMsgDiv.innerHTML = `
    <div class="msg-bubble">${escapeHtml(query)}</div>
    <div class="msg-meta"><span>You</span> • <span>Now</span></div>
  `;
  messagesContainer.appendChild(userMsgDiv);
  input.value = '';
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Show Sending Spinner
  const sendSpinner = document.getElementById('send-spinner');
  const sendBtn = document.getElementById('btn-chat-send');
  sendSpinner.style.display = 'inline-block';
  sendBtn.disabled = true;

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, include_stale: includeStale, max_receipts: 4 })
    });

    if (!res.ok) {
      const errData = await res.json();
      const detail = errData.detail;
      const errorMsg = typeof detail === 'object' ? `${detail.error}: ${detail.reason}` : (detail || 'Query failed');
      throw new Error(errorMsg);
    }

    const data = await res.json();
    renderAssistantMessage(data);
    renderUsedReceiptsInspector(data.used_receipts, data.reasoning_steps);

    // Prompt user to save extracted facts if Nemotron Nano found new ones
    if (data.extracted_facts && data.extracted_facts.length > 0) {
      promptNanoExtractedFacts(data.extracted_facts, query);
    }
  } catch (err) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'chat-msg assistant';
    errorDiv.innerHTML = `
      <div class="msg-bubble" style="border-left: 3px solid var(--accent-stale)">
        <strong>⚠️ Inference Error (Strict Live Mode):</strong><br>
        ${escapeHtml(err.message)}
        <div style="margin-top:0.5rem; font-size:0.75rem; color:var(--text-muted)">
          Receipts runs strictly against live inference. Ensure your NVIDIA NIM or Nebius key is configured in Settings.
        </div>
      </div>
      <div class="msg-meta"><span>Receipts Error Handler</span></div>
    `;
    messagesContainer.appendChild(errorDiv);
  } finally {
    sendSpinner.style.display = 'none';
    sendBtn.disabled = false;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

function renderAssistantMessage(data) {
  const messagesContainer = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg assistant';

  let receiptPills = '';
  if (data.used_receipts && data.used_receipts.length > 0) {
    receiptPills = `
      <div class="used-receipts-pills">
        <span class="pills-label">CITED RECEIPTS:</span>
        ${data.used_receipts.map(r => `
          <span class="receipt-pill status-${r.status}" onclick="inspectReceipt('${r.id}')" title="Click to audit Receipt #${r.id} (${r.status})">
            #${r.id} (${Math.round(r.confidence * 100)}%)
          </span>
        `).join('')}
      </div>
    `;
  }

  msgDiv.innerHTML = `
    <div class="msg-bubble">
      ${formatMarkdown(data.answer)}
      ${receiptPills}
    </div>
    <div class="msg-meta">
      <span>${escapeHtml(data.model_used || 'Nemotron 3 Super')}</span> • <span>${data.used_receipts.length} Receipts Cited</span>
    </div>
  `;
  messagesContainer.appendChild(msgDiv);
}

function renderUsedReceiptsInspector(usedReceipts, reasoningSteps) {
  const body = document.getElementById('inspector-body');
  const countBadge = document.getElementById('inspector-count-badge');
  if (!body) return;

  if (!usedReceipts || usedReceipts.length === 0) {
    body.innerHTML = `
      <div class="empty-inspector">
        <div style="font-size:1.1rem; color:var(--text-muted); font-weight:600">No Receipts Used</div>
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
    if (countBadge) countBadge.innerText = `#${receiptId}`;
  }
}

function promptNanoExtractedFacts(extractedFacts, userMessage) {
  const messagesContainer = document.getElementById('chat-messages');
  const promptDiv = document.createElement('div');
  promptDiv.className = 'chat-msg assistant';

  promptDiv.innerHTML = `
    <div class="msg-bubble nano-extract-prompt">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem">
        <strong>✨ Nemotron Nano Extracted Facts</strong>
        <span class="brand-badge">Auto-Extraction</span>
      </div>
      <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem">
        Nemotron Nano detected new factual statements in this interaction. Would you like to commit them to your sovereign vault?
      </p>
      ${extractedFacts.map((f, i) => `
        <div class="extracted-fact-item" id="ext-fact-${i}">
          <div style="font-size:0.85rem"><strong>Fact:</strong> ${escapeHtml(f.content)}</div>
          <div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px">
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
    showToast('Error saving extracted facts: ' + err.message, 'error');
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
    showToast('Tavily ingestion error: ' + err.message, 'error');
  } finally {
    spinner.style.display = 'none';
    btnText.innerText = 'Search & Ingest';
  }
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function openSettingsModal() {
  openModal('modal-settings');
}

async function submitSettings() {
  const nebiusKey = document.getElementById('setting-nebius-key').value.trim();
  const nemotronModel = document.getElementById('setting-nemotron-model').value;
  const tavilyKey = document.getElementById('setting-tavily-key').value.trim();

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nebius_api_key: nebiusKey || null,
        tavily_api_key: tavilyKey || null,
        nemotron_model: nemotronModel
      })
    });
    const data = await res.json();
    closeModal('modal-settings');
    showToast('Settings saved. Active model: ' + data.model, 'success');
    document.getElementById('model-display-pill').innerText = formatModelPill(nemotronModel);
    fetchEngineStatus();
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  }
}

// ─── Reset Demo ───────────────────────────────────────────────────────────────

async function resetDemoData() {
  if (!confirm('Reset memory vault back to pristine default demo state?')) return;
  try {
    const res = await fetch('/api/reset-demo', { method: 'POST' });
    if (!res.ok) throw new Error('Reset failed');
    showToast('Memory vault reset to default receipts.', 'success');
    await fetchMemories();
  } catch (err) {
    showToast('Reset error: ' + err.message, 'error');
  }
}

// ─── Interactive Sovereignty Demo Tour Runner ─────────────────────────────────

async function runTourStep(stepNum) {
  if (stepNum === 1) {
    switchView('chat');
    applyQuickPrompt('How should we schedule the sprint planning meeting?');
    showToast('Step 1: Assistant queried using Receipt #REC-ASYNC1', 'info');
  } else if (stepNum === 2) {
    switchView('vault');
    filterVault('all', 'all');
    setTimeout(() => {
      const card = document.getElementById('card-REC-ASYNC1');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.outline = '3px solid #6366f1';
        setTimeout(() => card.style.outline = '', 2500);
      }
    }, 300);
    showToast('Step 2: Inspecting Receipt #REC-ASYNC1 with literal email excerpt', 'info');
  } else if (stepNum === 3) {
    openCorrectionModal('REC-ASYNC1');
    document.getElementById('correct-new-content').value = 'User now prefers live 15-minute morning syncs over async communication.';
    document.getElementById('correct-reason').value = 'Live demo correction proving user sovereignty over memory';
    showToast('Step 3: Modify the fact to live 15-minute morning syncs and click Save', 'info');
  } else if (stepNum === 4) {
    switchView('chat');
    applyQuickPrompt('How should we schedule the sprint planning meeting?');
    showToast('Step 4: Re-queried assistant. Notice the answer immediately reflects your correction!', 'success');
  } else if (stepNum === 5) {
    switchView('vault');
    setTimeout(() => {
      const card = document.getElementById('card-REC-NEMO3');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const verifyBtn = card.querySelector('.btn-verify-tavily');
        if (verifyBtn) verifyTavilySource('REC-NEMO3', verifyBtn);
      }
    }, 300);
    showToast('Step 5: Verifying REC-NEMO3 source URL via Tavily', 'info');
  } else if (stepNum === 6) {
    openSyncModal('export');
    showToast('Step 6: Open Encrypted Sync to export AES-256-GCM zero-trust vault bundle', 'info');
  }
}

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
