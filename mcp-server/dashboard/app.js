/* ============================================================
   Free LLM MCP Dashboard v2 — app.js
   ============================================================ */

'use strict';

// ─── Utility ────────────────────────────────────────────────────
function modelBadge(model, provider) {
  if (!model && !provider) return '';
  const label = provider && model ? `${provider}/${model}` : (provider || model);
  return `<span class="latency-badge model-badge" style="display:inline-flex;" title="Model used for this call">🧬 ${esc(label)}</span>`;
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function fmt(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString();
}

// JSON syntax highlighter — XSS-safe: escape HTML first
function highlightJSON(obj) {
  const raw = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  // Escape HTML entities before injecting into DOM
  const safe = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return safe.replace(
    /(&quot;(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\&])*&quot;(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    match => {
      if (/^&quot;/.test(match)) {
        if (/:$/.test(match)) return `<span class="json-key">${match}</span>`;
        return `<span class="json-str">${match}</span>`;
      }
      if (/true|false/.test(match)) return `<span class="json-bool">${match}</span>`;
      if (/null/.test(match))       return `<span class="json-null">${match}</span>`;
      return `<span class="json-num">${match}</span>`;
    }
  );
}

// ─── Markdown + Mermaid Renderer ────────────────────────────────
let _mermaidCounter = 0;

async function renderMarkdown(text) {
  if (!text) return '';
  // Split on mermaid fences first
  const parts = text.split(/(```mermaid[\s\S]*?```)/g);
  const rendered = await Promise.all(parts.map(async (part, i) => {
    const mermaidMatch = part.match(/^```mermaid\s*([\s\S]*?)```$/);
    if (mermaidMatch) {
      const definition = mermaidMatch[1].trim();
      const id = `mermaid-${Date.now()}-${_mermaidCounter++}`;
      if (window.__mermaid) {
        try {
          const { svg } = await window.__mermaid.render(id, definition);
          return `<div class="mermaid-diagram" style="overflow:auto;margin:12px 0;padding:12px;background:rgba(0,0,0,.25);border-radius:var(--radius-sm);">${svg}</div>`;
        } catch (e) {
          return `<pre style="color:var(--accent-red);font-size:.78rem;">Mermaid error: ${esc(e.message)}</pre>`;
        }
      }
      return `<pre class="code-block" style="font-size:.78rem;">${esc(definition)}</pre>`;
    }
    // Regular markdown
    const safePart = esc(part);
    return safePart
      // Fenced code blocks (non-mermaid)
      .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
        `<pre class="code-block" style="font-size:.78rem;overflow-x:auto;"><code>${code.trim()}</code></pre>`)
      // Inline code
      .replace(/`([^`]+)`/g, (_, c) => `<code style="background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px;font-family:'JetBrains Mono',monospace;font-size:.85em;">${c}</code>`)
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${t}</strong>`)
      // Italic
      .replace(/\*([^*]+)\*/g, (_, t) => `<em>${t}</em>`)
      // Wiki-style internal links: [[Title]] — text here is already HTML-escaped by the esc(part) pass above
      .replace(/\[\[([^\]]+)\]\]/g, (_, title) => `<a href="#" class="wiki-link" data-title="${title.replace(/"/g, '&quot;')}">${title}</a>`)
      // Markdown links: [text](url) — only http(s) URLs become real links, everything else stays plain text
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) => `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${text}</a>`)
      // H1-H3
      .replace(/^### (.+)$/gm, '<h3 style="font-size:.85rem;color:var(--text-primary);margin:10px 0 4px;">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="font-size:.95rem;color:var(--text-primary);margin:12px 0 6px;">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="font-size:1.05rem;color:var(--accent-purple);margin:14px 0 8px;">$1</h1>')
      // Unordered lists
      .replace(/^[\-\*] (.+)$/gm, '<li style="margin-left:16px;list-style:disc;">$1</li>')
      // Ordered lists
      .replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal;">$1</li>')
      // Horizontal rule
      .replace(/^---+$/gm, '<hr style="border-color:var(--glass-border);margin:12px 0;">')
      // Paragraphs — blank line becomes paragraph break
      .replace(/\n\n+/g, '</p><p style="margin:6px 0;">')
      // Single newlines become <br>
      .replace(/\n/g, '<br>');
  }));
  return `<div class="md-body" style="line-height:1.6;font-size:.82rem;color:var(--text-secondary);">${rendered.join('')}</div>`;
}

// Smart response renderer: extracts the actual message text (result / result.content)
// and renders it as markdown regardless of whether it "looks like" markdown — the
// markdown-indicator regex used to gate this, so plain short replies (e.g. "OK", "9")
// fell through to a raw JSON dump of the whole result object, which meant metadata
// fields like `model`/`provider` (added for the UI badges, never meant to be shown as
// message text) ended up printed inline in the chat bubble. Falls back to a JSON dump
// only when there's genuinely no string content field to render.
async function renderResponse(data) {
  const result = data.result ?? data;
  // Plain string result
  if (typeof result === 'string') {
    return await renderMarkdown(result);
  }
  // Nested text field — different tools use different keys (use_free_llm/vision_tool
  // use `content`/`response`, execute_skill uses `response`, etc.)
  const nestedText = result?.content ?? result?.response;
  if (typeof nestedText === 'string') {
    return await renderMarkdown(nestedText);
  }
  const SIZE_THRESHOLD = 100 * 1024; // 100KB
  const jsonStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  if (jsonStr.length > SIZE_THRESHOLD) {
    return `<span style="color:var(--text-muted);font-size:.78rem;">Response too large to render (${(jsonStr.length/1024).toFixed(0)}KB). </span><button class="copy-raw-btn btn btn-outline btn-sm" data-v="${esc(jsonStr)}" style="margin-left:8px;">Copy Raw</button>`;
  }
  return highlightJSON(result);
}

// ─── Tab System ─────────────────────────────────────────────────
const tabBtns   = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected','true');
    document.getElementById(`panel-${target}`)?.classList.add('active');

    // Tab-specific actions
    if (target === 'memory')   { fetchSessions(); if (activeMemSid) startMemPoll(activeMemSid); }
    if (target === 'providers') fetchStats();
    if (target === 'playground') ensureModels();
    if (target === 'profile')  { fetchUserConfig(); fetchLeaderboard(); }
    if (target === 'wiki')     { initWikiTab(); }
  });
});

// ─── SSE Connection ─────────────────────────────────────────────
const statusPill  = document.getElementById('status-pill');
const statusDot   = document.getElementById('status-dot');
const statusLabel = document.getElementById('status-label');
let sse;

function setOnline(on) {
  if (on) {
    statusPill.className  = 'status-pill online';
    statusDot.classList.add('pulse');
    statusLabel.textContent = 'Connected';
  } else {
    statusPill.className  = 'status-pill offline';
    statusDot.classList.remove('pulse');
    statusLabel.textContent = 'Disconnected';
  }
}

function connectSSE() {
  if (sse) { try { sse.close(); } catch {} }
  sse = new EventSource('/mcp?heartbeat=true');
  sse.onopen  = () => setOnline(true);
  sse.onerror = () => {
    setOnline(false);
    sse.close();
    sse = null;
    setTimeout(connectSSE, 3000);
  };
}

connectSSE();

// ─── Overview Stats ──────────────────────────────────────────────
async function fetchStats() {
  try {
    const [statsRes, provRes] = await Promise.all([
      fetch('/api/token-stats'),
      fetch('/api/provider-stats')
    ]);
    if (!statsRes.ok) return;

    const data      = await statsRes.json();
    const provStats = provRes.ok ? await provRes.json() : {};

    const totals = data.serverTotals || {};
    document.getElementById('stat-daily-req').textContent = fmt(totals.dailyRequests);
    document.getElementById('stat-daily-tok').textContent = fmt(totals.dailyTokens);
    document.getElementById('stat-lifetime').textContent  = fmt(totals.lifetimeRequests);

    renderProviders(data.stats || [], provStats);
  } catch (err) {
    console.error('[Dashboard] fetchStats error:', err);
  }
}

// ─── Providers Grid ──────────────────────────────────────────────
const providersGrid = document.getElementById('providers-grid');

function renderProviders(providers, provStats) {
  if (!providers.length) {
    providersGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px 0;color:var(--text-muted);">No providers configured.</div>';
    document.getElementById('stat-providers').textContent = '0';
    return;
  }

  let activeCount = 0;

  providersGrid.innerHTML = providers.map(p => {
    const ps      = provStats[p.id] || { errors: 0, circuitOpen: false };
    const online  = p.isAvailable && !ps.circuitOpen;
    if (online) activeCount++;

    const quota   = p.rateLimits?.tokensPerMonth || p.rateLimits?.rpd || p.rateLimits?.rpm || 'Free';
    const daily   = p.usage ? `${fmt(p.usage.dailyTotalRequests)} reqs / ${fmt(p.usage.dailyTotalTokens)} tokens` : '0 reqs / 0 tokens';
    const life    = p.usage ? `${fmt(p.usage.localTotalRequests)} reqs / ${fmt(p.usage.localTotalTokens)} tokens` : '0 reqs / 0 tokens';

    let badgeCls = ps.circuitOpen ? 'badge-amber' : (p.isAvailable ? 'badge-green' : 'badge-red');
    let badgeTxt = ps.circuitOpen ? '⏸ Circuit Open' : (p.isAvailable ? '● Online' : '✕ Offline');

    return `
    <div class="provider-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div>
          <div class="provider-name">${esc(p.name)}</div>
          <div class="provider-id">${esc(p.id)}</div>
        </div>
        <span class="badge ${badgeCls}">${badgeTxt}</span>
      </div>

      ${ps.errors > 0 ? `<div style="font-size:.72rem;color:var(--accent-red);margin-bottom:6px;">⚠ ${ps.errors} error${ps.errors > 1 ? 's' : ''}</div>` : ''}
      ${ps.circuitOpen ? `<div style="font-size:.72rem;color:var(--accent-amber);margin-bottom:6px;">⏱ ${Math.ceil((ps.cooldownRemaining||0)/1000)}s cooldown</div>` : ''}

      <div class="progress-bar-track"><div class="progress-bar-fill"></div></div>

      <div class="provider-stat"><span>Quota</span><span>${esc(String(quota))}</span></div>
      <div class="provider-stat" style="color:var(--accent-cyan);"><span>📅 Daily</span><span>${esc(daily)}</span></div>
      <div class="provider-stat"><span>🕒 Lifetime</span><span>${esc(life)}</span></div>

      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--glass-border);display:flex;justify-content:flex-end;">
        <button class="btn btn-outline btn-sm verify-btn" data-pid="${esc(p.id)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Verify
        </button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('stat-providers').textContent = activeCount;
}

// Delegated: bound once (not re-bound per render), since providersGrid.innerHTML
// gets fully replaced by fetchStats() every 5s — a per-render addEventListener
// binding is harmless here, but the button element itself can be swapped out
// from under an in-flight click, so verifyProvider() below re-queries the live
// node by data-pid at each step instead of trusting the one it started with.
providersGrid?.addEventListener('click', (e) => {
  const btn = e.target.closest('.verify-btn');
  if (btn) verifyProvider(btn.dataset.pid);
});

const VERIFY_BTN_MARKUP = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Verify`;

function getVerifyBtn(providerId) {
  return providersGrid?.querySelector(`.verify-btn[data-pid="${CSS.escape(providerId)}"]`) || null;
}

async function verifyProvider(providerId) {
  const setState = (html, color, disabled) => {
    const live = getVerifyBtn(providerId); // periodic refresh may have replaced the node
    if (!live) return;
    live.innerHTML = html;
    live.style.color = color;
    live.disabled = disabled;
  };
  setState('<span class="spinner"></span> Verifying…', '', true);
  try {
    const r  = await fetch('/api/validate-provider', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ providerId }) });
    const d  = await r.json();
    setState(d.success ? '✓ OK' : '✗ Failed', d.success ? 'var(--accent-green)' : 'var(--accent-red)', true);
    setTimeout(() => { setState(VERIFY_BTN_MARKUP, '', false); fetchStats(); }, 2000);
  } catch {
    setState('✗ Error', 'var(--accent-red)', true);
    setTimeout(() => { setState(VERIFY_BTN_MARKUP, '', false); }, 2000);
  }
}

document.getElementById('refresh-btn').addEventListener('click', fetchStats);

// ─── TOOL PLAYGROUND ─────────────────────────────────────────────

// Tool definitions
const TOOLS = [
  {
    id: 'use_free_llm', label: 'use_free_llm', icon: '💬',
    tag: 'Chat / Coding',
    fields: [
      { id: 'prompt', label: 'User Message', type: 'textarea', placeholder: 'Write a Hello World in Go' },
      { id: 'model',  label: 'Model Override', type: 'model-picker' },
      { id: 'keywords', label: 'Keywords (comma-separated)', type: 'text', placeholder: 'e.g. jwt, security' },
    ]
  },
  {
    id: 'vision_tool', label: 'vision_tool', icon: '👁',
    tag: 'Vision / VLM',
    fields: [
      { id: 'image_path', label: 'Image Path', type: 'text', placeholder: 'file:///C:/path/to/screenshot.png' },
      { id: 'prompt',     label: 'Analysis Prompt', type: 'textarea', placeholder: 'Describe the UI layout' },
      { id: 'model',      label: 'Model Override', type: 'model-picker' },
    ]
  },
  {
    id: 'execute_skill', label: 'execute_skill', icon: '⚡',
    tag: 'Skill Execution',
    fields: [
      { id: 'skill', label: 'Skill Name', type: 'text', placeholder: 'ab-test-setup' },
      { id: 'input', label: 'Task Input', type: 'textarea', placeholder: 'Design an A/B test for the checkout button' },
      { id: 'model', label: 'Model Override', type: 'model-picker' },
    ]
  },
  {
    id: 'load_skill_prompt', label: 'load_skill_prompt', icon: '📥',
    tag: 'Skill Loading',
    fields: [
      { id: 'type',         label: 'Action Type', type: 'select', options: ['load', 'search'] },
      { id: 'name',         label: 'Skill Name', type: 'text', placeholder: 'tdd-workflow' },
      { id: 'keywords',     label: 'Keywords (comma-separated for search)', type: 'text', placeholder: 'tdd, testing' },
      { id: 'workspaceDir', label: 'Workspace Directory (optional)', type: 'text', placeholder: 'C:/path/to/workspace' }
    ]
  },
  {
    id: 'manage_memory', label: 'manage_memory', icon: '🧠',
    tag: 'Memory',
    fields: [
      { id: 'action', label: 'Action', type: 'select', options: ['search','list','stats','clear'] },
      { id: 'query',  label: 'Query (for search)', type: 'text', placeholder: 'authentication patterns' },
      { id: 'limit',  label: 'Limit (results)', type: 'number', placeholder: '5' },
    ]
  },
  {
    id: 'index_workspace', label: 'index_workspace', icon: '🗂',
    tag: 'Indexing',
    fields: [
      { id: 'force', label: 'Force Re-index', type: 'toggle', hint: 'Re-index even if already indexed' },
    ]
  },
  {
    id: 'store_workspace_skill', label: 'store_workspace_skill', icon: '💾',
    tag: 'Skill Storage',
    fields: [
      { id: 'name',        label: 'Skill Name', type: 'text', placeholder: 'db-migration-helper' },
      { id: 'description', label: 'Description', type: 'text', placeholder: 'Database migration verification utility' },
      { id: 'what',        label: 'What was done (one item per line)', type: 'textarea', placeholder: 'Added verify-migrations.sh\nIntegrated schema diff checks' },
      { id: 'why',         label: 'Why', type: 'text', placeholder: 'Prevent schema drift during deployments' },
      { id: 'files',       label: 'Files (comma-separated)', type: 'text', placeholder: 'scripts/verify-migrations.sh' },
    ]
  },
  {
    id: 'get_token_stats', label: 'get_token_stats', icon: '📊',
    tag: 'Monitoring',
    fields: []
  },
  {
    id: 'validate_provider', label: 'validate_provider', icon: '🛡',
    tag: 'Health Check',
    fields: [
      { id: 'providerId', label: 'Provider ID', type: 'text', placeholder: 'groq' },
    ]
  },
];

let activeTool = TOOLS[0];
let availableModels = [];

const toolList      = document.getElementById('tool-list');
const pgForm        = document.getElementById('pg-form');
const pgToolTitle   = document.getElementById('pg-tool-title');
const pgResponseBody = document.getElementById('pg-response-body');

// Build tool list sidebar
toolList.innerHTML = TOOLS.map((t, i) => `
  <div class="tool-item${i === 0 ? ' active' : ''}" data-tool="${t.id}">
    <span class="tool-item-icon">${t.icon}</span>
    <div>
      <div class="tool-item-name">${t.label}</div>
      <div class="tool-item-tag">${t.tag}</div>
    </div>
  </div>
`).join('');

toolList.querySelectorAll('.tool-item').forEach(item => {
  item.addEventListener('click', () => {
    toolList.querySelectorAll('.tool-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    activeTool = TOOLS.find(t => t.id === item.dataset.tool);
    renderToolForm(activeTool);
  });
});

async function ensureModels() {
  if (availableModels.length) return;
  try {
    const r = await fetch('/api/models');
    if (!r.ok) return;
    const d = await r.json();
    availableModels = d.models || [];
  } catch {}
}

function renderToolForm(tool) {
  pgToolTitle.textContent = tool.label;
  pgForm.innerHTML = '';

  if (!tool.fields.length) {
    pgForm.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem;">No parameters required — just click Run Tool.</p>';
    return;
  }

  tool.fields.forEach(f => {
    const wrap = document.createElement('div');
    wrap.id = `field-wrap-${f.id}`;

    const lbl = document.createElement('label');
    lbl.className = 'field-label';
    lbl.setAttribute('for', `pg-field-${f.id}`);
    lbl.textContent = f.label;
    wrap.appendChild(lbl);

    if (f.type === 'toggle') {
      lbl.className = '';
      const row = document.createElement('div');
      row.className = 'toggle-row';

      const tog = document.createElement('label');
      tog.className = 'toggle';
      const inp = document.createElement('input');
      inp.type = 'checkbox'; inp.id = `pg-field-${f.id}`;
      const slider = document.createElement('span');
      slider.className = 'toggle-slider';
      tog.appendChild(inp); tog.appendChild(slider);

      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:.8rem;color:var(--text-secondary);';
      hint.textContent = f.hint || f.label;

      row.appendChild(tog); row.appendChild(hint);
      wrap.innerHTML = '';
      wrap.appendChild(row);

    } else if (f.type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.id = `pg-field-${f.id}`;
      ta.placeholder = f.placeholder || '';
      wrap.appendChild(ta);

    } else if (f.type === 'select') {
      const sel = document.createElement('select');
      sel.id = `pg-field-${f.id}`;
      (f.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        sel.appendChild(o);
      });
      wrap.appendChild(sel);

    } else if (f.type === 'model-picker') {
      // ── Combobox with live filtering ──────────────────────────
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative;';

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.id = `pg-field-${f.id}`;
      inp.placeholder = '— auto-route or type to filter —';
      inp.autocomplete = 'off';
      inp.setAttribute('aria-autocomplete', 'list');
      inp.setAttribute('role', 'combobox');
      wrapper.appendChild(inp);

      const dropdown = document.createElement('div');
      dropdown.style.cssText = 'position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:9999;background:#1a1a2e;border:1px solid var(--glass-border);border-radius:var(--radius-sm);max-height:220px;overflow-y:auto;display:none;box-shadow:0 8px 32px rgba(0,0,0,.6);';
      wrapper.appendChild(dropdown);

      // Store actual modelId separately from display value
      inp._modelId = '';

      const buildOptions = (filter = '') => {
        dropdown.innerHTML = '';
        const q = filter.toLowerCase();
        const items = availableModels.filter(m =>
          !q || m.modelName.toLowerCase().includes(q) || m.providerName.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q)
        );
        if (!items.length) {
          const empty = document.createElement('div');
          empty.style.cssText = 'padding:8px 12px;color:var(--text-muted);font-size:.78rem;';
          empty.textContent = filter ? `Use "${filter}" as custom model ID` : 'No models loaded';
          dropdown.appendChild(empty);
          return;
        }
        items.forEach(m => {
          const item = document.createElement('div');
          item.style.cssText = 'padding:7px 12px;cursor:pointer;font-size:.8rem;transition:background .15s;';
          item.innerHTML = `<span style="color:var(--text-primary);">${esc(m.modelName)}</span> <span style="color:var(--text-muted);font-size:.72rem;">[${esc(m.providerName)}]</span>`;
          item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,.07)');
          item.addEventListener('mouseleave', () => item.style.background = '');
          item.addEventListener('mousedown', e => {
            e.preventDefault();
            inp.value = `${m.modelName} [${m.providerName}]`;
            inp._modelId = m.modelId;
            dropdown.style.display = 'none';
          });
          dropdown.appendChild(item);
        });
      };

      inp.addEventListener('focus', async () => {
        await ensureModels();
        buildOptions(inp.value);
        dropdown.style.display = 'block';
      });
      inp.addEventListener('input', () => {
        inp._modelId = ''; // reset on manual type
        buildOptions(inp.value);
        dropdown.style.display = 'block';
      });
      inp.addEventListener('keydown', e => {
        const items = dropdown.querySelectorAll('div');
        const active = dropdown.querySelector('.combo-active');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = active ? active.nextElementSibling : items[0];
          if (next) { active?.classList.remove('combo-active'); next.classList.add('combo-active'); next.style.background = 'rgba(255,255,255,.12)'; next.scrollIntoView({ block: 'nearest' }); }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = active?.previousElementSibling;
          if (prev) { active.classList.remove('combo-active'); active.style.background = ''; prev.classList.add('combo-active'); prev.style.background = 'rgba(255,255,255,.12)'; prev.scrollIntoView({ block: 'nearest' }); }
        } else if (e.key === 'Enter' && active) {
          e.preventDefault(); active.dispatchEvent(new MouseEvent('mousedown'));
        } else if (e.key === 'Escape') {
          dropdown.style.display = 'none';
        }
      });
      document.addEventListener('click', e => { if (!wrapper.contains(e.target)) dropdown.style.display = 'none'; }, true);

      wrap.appendChild(wrapper);

    } else if (f.type === 'number') {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.id = `pg-field-${f.id}`;
      inp.placeholder = f.placeholder || ''; inp.min = 1; inp.max = 100;
      wrap.appendChild(inp);

    } else {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.id = `pg-field-${f.id}`;
      inp.placeholder = f.placeholder || '';
      wrap.appendChild(inp);
    }

    pgForm.appendChild(wrap);
  });
}

function collectParams(tool) {
  const params = {};
  const ws = pgWorkspace.value.trim();
  if (ws) params.workspace_root = ws;

  tool.fields.forEach(f => {
    const el = document.getElementById(`pg-field-${f.id}`);
    if (!el) return;

    if (f.type === 'toggle')       params[f.id] = el.checked;
    else if (f.type === 'number')  params[f.id] = el.value ? parseInt(el.value, 10) : undefined;
    else if (f.type === 'model-picker') {
      const inp = document.getElementById(`pg-field-${f.id}`);
      // Use the stored modelId if set (picked from dropdown), else use raw typed value
      params[f.id] = (inp?._modelId) || inp?.value.trim() || undefined;
    } else if (f.type === 'textarea' && f.id === 'what') {
      params[f.id] = el.value.split('\n').map(l => l.trim()).filter(Boolean);
    } else if (f.id === 'keywords') {
      params[f.id] = el.value ? el.value.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    } else if (f.id === 'files') {
      params[f.id] = el.value ? el.value.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    } else {
      const v = el.value.trim();
      if (v) params[f.id] = v;
    }
  });

  return params;
}

// ─── CHAT ENGINE ────────────────────────────────────────────────

const chatLog       = document.getElementById('pg-chat-log');
const chatEmpty     = document.getElementById('pg-chat-empty');
const chatLabel     = document.getElementById('pg-chat-session-label');
const chatBadge     = document.getElementById('pg-chat-mode-badge');
const pgRunBtn      = document.getElementById('pg-run-btn');
const pgClearBtn    = document.getElementById('pg-clear-btn');
const pgStatus      = document.getElementById('pg-status');
const pgLatency     = document.getElementById('pg-latency');
const pgWorkspace   = document.getElementById('pg-workspace');
const pgAgenticToggle = document.getElementById('pg-agentic-toggle');
const convList      = document.getElementById('pg-conv-list');
const convSearch    = document.getElementById('pg-conv-search');

// Delegated click handling for buttons rendered into chat bubbles (Copy / Copy Raw).
// The dashboard's CSP sets `script-src-attr: 'none'` (Helmet default, never overridden),
// which silently blocks inline onclick="..." attributes — these buttons used to rely on
// that and simply did nothing when clicked. Delegating from the container (loaded via the
// external, CSP-allowed /app.js) works correctly.
chatLog?.addEventListener('click', (e) => {
  const copyRaw = e.target.closest('.copy-raw-btn');
  if (copyRaw) {
    navigator.clipboard.writeText(copyRaw.dataset.v || '');
    copyRaw.textContent = 'Copied!';
    return;
  }
  const copyChat = e.target.closest('.chat-copy-btn');
  if (copyChat) {
    const text = copyChat.closest('.chat-msg')?.querySelector('.chat-bubble')?.innerText || '';
    navigator.clipboard.writeText(text);
    copyChat.textContent = 'Copied!';
    setTimeout(() => { copyChat.textContent = 'Copy'; }, 1500);
  }
});

// In-memory cache of current conversation (avoids re-fetching for every append)
let chatHistory = [];
let activeSessionId = '__no_ws__';

// ─── FILE ATTACHMENTS ───────────────────────────────────────────
const pgAttachBtn   = document.getElementById('pg-attach-btn');
const pgFileInput   = document.getElementById('pg-file-input');
const pgAttachments = document.getElementById('pg-attachments');

let attachments = []; // { id, kind, fileUri, relativePath, filename, page, targetFieldId }
let attachIdSeq = 0;

function getPrimaryTextFieldId(tool) {
  const f = tool?.fields?.find(f => f.type === 'textarea');
  return f ? f.id : null;
}

function insertTokenIntoField(fieldId, token) {
  const el = document.getElementById(`pg-field-${fieldId}`);
  if (!el) return;
  const sep = el.value && !el.value.endsWith('\n') && !el.value.endsWith(' ') ? ' ' : '';
  el.value = `${el.value}${sep}${token}`;
}

function replaceTokenInField(fieldId, oldToken, newToken) {
  const el = document.getElementById(`pg-field-${fieldId}`);
  if (!el) return;
  el.value = el.value.replace(oldToken, newToken);
}

function removeTokenFromField(fieldId, token) {
  const el = document.getElementById(`pg-field-${fieldId}`);
  if (!el) return;
  el.value = el.value.replace(token, '').replace(/\s{2,}/g, ' ').trim();
}

function renderAttachments() {
  pgAttachments.innerHTML = attachments.map(a => `
    <span class="attach-chip" data-attach-id="${a.id}">
      📎 ${esc(a.filename)}
      ${a.kind === 'pdf' ? `<input type="number" min="1" value="${a.page}" class="attach-page-input" data-attach-id="${a.id}" title="PDF page number">` : ''}
      <span class="attach-remove" data-attach-id="${a.id}">×</span>
    </span>
  `).join('');

  pgAttachments.querySelectorAll('.attach-remove').forEach(btn => {
    btn.addEventListener('click', () => removeAttachment(btn.dataset.attachId));
  });
  pgAttachments.querySelectorAll('.attach-page-input').forEach(inp => {
    inp.addEventListener('change', () => updateAttachmentPage(inp.dataset.attachId, inp.value));
  });
}

function updateAttachmentPage(id, newPageStr) {
  const a = attachments.find(a => a.id === id);
  if (!a) return;
  const newPage = Math.max(1, parseInt(newPageStr, 10) || 1);
  const oldToken = a.token;
  a.token = a.token.replace(/:\d+$/, `:${newPage}`);
  a.page = newPage;
  if (a.targetFieldId) replaceTokenInField(a.targetFieldId, oldToken, a.token);
}

function removeAttachment(id) {
  const a = attachments.find(a => a.id === id);
  if (!a) return;
  if (a.targetFieldId) {
    if (a.isDirectFieldValue) {
      const el = document.getElementById(`pg-field-${a.targetFieldId}`);
      if (el && el.value === a.token) el.value = '';
    } else {
      removeTokenFromField(a.targetFieldId, a.token);
    }
  }
  attachments = attachments.filter(x => x.id !== id);
  renderAttachments();
}

async function handleFileSelected(file) {
  if (!file) return;
  const ws = pgWorkspace.value.trim();
  const formData = new FormData();
  formData.append('file', file);
  if (ws) formData.append('workspace_root', ws);

  pgAttachBtn.disabled = true;
  try {
    const r = await fetch('/api/upload', { method: 'POST', body: formData });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Upload failed');

    const id = `att-${++attachIdSeq}`;
    const isVisionTool = activeTool.id === 'vision_tool';

    if (d.kind === 'image' && isVisionTool) {
      // Fill image_path directly — that field already exists on vision_tool
      const el = document.getElementById('pg-field-image_path');
      if (el) el.value = d.fileUri;
      attachments.push({ id, kind: 'image', filename: file.name, token: d.fileUri, targetFieldId: 'image_path', isDirectFieldValue: true });
    } else if (d.kind === 'image') {
      const fieldId = getPrimaryTextFieldId(activeTool);
      if (fieldId) insertTokenIntoField(fieldId, d.fileUri);
      attachments.push({ id, kind: 'image', filename: file.name, token: d.fileUri, targetFieldId: fieldId });
    } else {
      // PDF — embed as pdf://<relativePath>:<page>, page editable via the chip
      const ref = d.relativePath || d.absPath.replace(/\\/g, '/');
      const token = `pdf://${ref}:1`;
      const fieldId = getPrimaryTextFieldId(activeTool);
      if (fieldId) insertTokenIntoField(fieldId, token);
      attachments.push({ id, kind: 'pdf', filename: file.name, token, page: 1, targetFieldId: fieldId });
    }
    renderAttachments();
  } catch (err) {
    alert(`Upload failed: ${err.message}`);
  } finally {
    pgAttachBtn.disabled = false;
    pgFileInput.value = '';
  }
}

pgAttachBtn?.addEventListener('click', () => pgFileInput.click());
pgFileInput?.addEventListener('change', () => handleFileSelected(pgFileInput.files[0]));

// ─── Session ID resolution (server-side, so all instances agree) ──
async function resolveSessionId(ws) {
  if (!ws) return '__no_ws__';
  try {
    const r = await fetch('/api/chat-log/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: ws })
    });
    if (!r.ok) return '__no_ws__';
    const { sessionId } = await r.json();
    return sessionId || '__no_ws__';
  } catch { return '__no_ws__'; }
}

// ─── Load history from server ─────────────────────────────────────
async function loadChatHistory(sid) {
  try {
    const r = await fetch(`/api/chat-log/${encodeURIComponent(sid)}`);
    if (!r.ok) return [];
    const { log, workspace } = await r.json();
    
    if (workspace && workspace !== 'unknown') {
      pgWorkspace.value = workspace;
      localStorage.setItem('mcp-workspace', workspace);
    } else {
      pgWorkspace.value = '';
      localStorage.setItem('mcp-workspace', '');
    }
    updateWorkspaceUI();
    
    return Array.isArray(log) ? log : [];
  } catch { return []; }
}

// ─── Append one turn to server (fire-and-forget, non-blocking) ───
function saveTurn(sid, turn) {
  fetch(`/api/chat-log/${encodeURIComponent(sid)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(turn)
  }).catch(() => {}); // silent — dashboard still works if server is briefly unavailable
}

// ─── Clear server log + rebuild UI ────────────────────────────────
async function clearServerLog(sid) {
  try {
    await fetch(`/api/chat-log/${encodeURIComponent(sid)}`, { method: 'DELETE' });
  } catch {}
}

// ─── Rebuild DOM from history array ───────────────────────────────
function rebuildChatLog() {
  chatLog.innerHTML = '';
  if (!chatHistory.length) {
    chatLog.appendChild(chatEmpty);
    chatEmpty.style.display = 'flex';
    return;
  }
  chatEmpty.style.display = 'none';
  chatHistory.forEach(msg => appendBubbleFromRecord(msg));
  scrollChatBottom();
}

function scrollChatBottom() {
  requestAnimationFrame(() => { chatLog.scrollTop = chatLog.scrollHeight; });
}

function appendBubbleFromRecord(msg) {
  if (msg.role === 'user') {
    addUserBubbleEl(msg.content, msg.tool, msg.ts);
  } else if (msg.role === 'assistant') {
    const el = addSpinnerBubble(msg.tool);
    renderMarkdown(msg.content).then(html => {
      if (!el.isConnected) return;
      replaceSpinnerWithResponse(el, html, msg.latencyMs, msg.tool, msg.ts, false, msg.model, msg.provider);
    });
  } else if (msg.role === 'error') {
    addErrorBubbleEl(msg.content, msg.tool, msg.ts);
  } else if (msg.role === 'subtask_start') {
    addSubtaskStartBubble(msg.content, msg.ts);
  } else if (msg.role === 'subtask_response') {
    addSubtaskResponseBubble(msg.content, msg.output, msg.ts, msg.contextInjected, msg.model, msg.provider);
  } else if (msg.role === 'tool_call') {
    addToolCallBubble(msg.tool, msg.args, msg.result, msg.ts, msg.latencyMs, msg.isError);
  }
}

function addSubtaskStartBubble(taskText, ts) {
  chatEmpty.style.display = 'none';
  const div = document.createElement('div');
  div.className = 'chat-spinner-bubble subtask-active-spinner';
  div.innerHTML = `
    <div class="spin-header">
      <div class="spin-dots">
        <span class="spin-dot"></span><span class="spin-dot"></span><span class="spin-dot"></span>
      </div>
      <span>Subagent Executing:</span>
      <span class="spin-tool-tag">${esc(taskText)}</span>
    </div>
    <span class="chat-meta-timestamp">${new Date(ts || Date.now()).toLocaleTimeString()}</span>`;
  chatLog.appendChild(div);
  scrollChatBottom();
  return div;
}

function addSubtaskResponseBubble(taskText, outputText, ts, contextInjected, model, provider) {
  chatEmpty.style.display = 'none';
  
  // Remove any active spinner for this subtask to keep the flow clean
  const activeSpinners = chatLog.querySelectorAll('.subtask-active-spinner');
  activeSpinners.forEach(s => {
    const tag = s.querySelector('.spin-tool-tag');
    if (tag && tag.textContent === taskText) {
      s.remove();
    }
  });

  const div = document.createElement('div');
  div.className = 'chat-msg assistant subtask-collapse-card';
  div.style.margin = '8px 0 8px 16px';
  div.style.opacity = '0.85';
  
  const uniqueId = 'subtask-' + Math.random().toString(36).substring(2, 9);
  
  const contextHtml = Array.isArray(contextInjected) && contextInjected.length > 0
    ? `<details style="margin-top:8px; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.04);">
        <summary style="cursor:pointer; font-size:.7rem; color:var(--accent-cyan); display:flex; align-items:center; gap:4px; outline:none; list-style:none;">
          <span>📂</span> <span>View Injected Context (${contextInjected.length})</span>
        </summary>
        <ul style="margin-top:6px; padding-left:16px; font-size:.7rem; color:var(--text-muted); display:flex; flex-direction:column; gap:4px; list-style-type:circle;">
          ${contextInjected.map(c => `<li>${esc(c)}</li>`).join('')}
        </ul>
       </details>`
    : '';

  div.innerHTML = `
    <div class="chat-bubble" style="padding:10px 14px; background:rgba(255,255,255,0.02); border-left: 3px solid var(--accent-purple);">
      <details id="${uniqueId}">
        <summary style="cursor:pointer; font-size:.78rem; font-weight:600; color:var(--text-secondary); display:flex; justify-content:space-between; align-items:center; outline:none; list-style:none;">
          <span style="display:flex; align-items:center; gap:6px;">
            <span style="color:var(--accent-green)">✓</span> 
            <span>Subtask: ${esc(taskText.replace('Completed: ', ''))}</span>
          </span>
          <span style="font-size:.7rem; color:var(--text-muted);">click to view output</span>
        </summary>
        <div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.05); font-size:.75rem; font-family:'JetBrains Mono', monospace; overflow-x:auto; max-height:200px; white-space:pre-wrap; color:var(--text-muted);">
          ${esc(outputText || 'No output details recorded.')}
        </div>
      </details>
      ${contextHtml}
    </div>
    <div class="chat-meta" style="margin-left: 16px;">
      ${modelBadge(model, provider)}<span>Subagent Execution</span>
      <span>${new Date(ts || Date.now()).toLocaleTimeString()}</span>
    </div>`;
  
  chatLog.appendChild(div);
  scrollChatBottom();
  return div;
}

/**
 * Renders a collapsed tool-call bubble for retrospect rendering.
 * Follows the same <details>/<summary> pattern as addSubtaskResponseBubble.
 * Called from appendBubbleFromRecord when role === 'tool_call'.
 */
function addToolCallBubble(tool, args, result, ts, latencyMs, isError) {
  chatEmpty.style.display = 'none';
  const div = document.createElement('div');
  div.className = 'chat-msg assistant subtask-collapse-card';
  div.style.margin = '4px 0 4px 16px';
  div.style.opacity = '0.80';

  let parsedArgs = args;
  let parsedResult = result;
  try { if (typeof args === 'string') parsedArgs = JSON.parse(args); } catch {}
  try { if (typeof result === 'string') parsedResult = JSON.parse(result); } catch {}

  const resultPreview = (() => {
    const s = typeof result === 'string' ? result : JSON.stringify(result ?? '');
    return s.slice(0, 80) + (s.length > 80 ? '…' : '');
  })();

  const borderColor = isError ? 'var(--accent-red, #ef4444)' : 'var(--accent-cyan)';
  const icon = isError ? '⚠️' : '🔧';

  div.innerHTML = `
    <div class="chat-bubble" style="padding:8px 12px; background:rgba(255,255,255,0.02); border-left:3px solid ${borderColor};">
      <details>
        <summary style="cursor:pointer; font-size:.76rem; font-weight:600; color:var(--text-secondary); display:flex; justify-content:space-between; align-items:center; outline:none; list-style:none;">
          <span style="display:flex; align-items:center; gap:6px;">
            <span>${icon}</span>
            <span style="color:var(--accent-cyan); font-family:'JetBrains Mono',monospace;">${esc(tool || '?')}</span>
            <span style="color:var(--text-muted); font-size:.7rem;">${esc(resultPreview)}</span>
          </span>
          <span style="font-size:.68rem; color:var(--text-muted); white-space:nowrap; margin-left:8px;">${latencyMs != null ? latencyMs + 'ms' : ''} · ${new Date(ts || Date.now()).toLocaleTimeString()}</span>
        </summary>
        <div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.05); font-size:.73rem;">
          <div style="margin-bottom:6px; color:var(--text-muted);"><strong>Args:</strong><br>
            <pre style="font-family:'JetBrains Mono',monospace; white-space:pre-wrap; overflow-x:auto; max-height:120px;">${esc(JSON.stringify(parsedArgs, null, 2))}</pre>
          </div>
          <div style="color:var(--text-muted);"><strong>Result:</strong><br>
            <pre style="font-family:'JetBrains Mono',monospace; white-space:pre-wrap; overflow-x:auto; max-height:120px;">${esc(JSON.stringify(parsedResult, null, 2))}</pre>
          </div>
        </div>
      </details>
    </div>
    <div class="chat-meta" style="margin-left:16px;">
      <span>Tool Call</span>
      <span>${new Date(ts || Date.now()).toLocaleTimeString()}</span>
    </div>`;

  chatLog.appendChild(div);
  scrollChatBottom();
  return div;
}

function addUserBubbleEl(text, tool, ts) {
  chatEmpty.style.display = 'none';
  const div = document.createElement('div');
  div.className = 'chat-msg user';
  div.innerHTML = `
    <div class="chat-bubble">${esc(text)}</div>
    <div class="chat-meta">
      <span>${esc(tool || activeTool.id)}</span>
      <span>${new Date(ts || Date.now()).toLocaleTimeString()}</span>
    </div>`;
  chatLog.appendChild(div);
  return div;
}

function addErrorBubbleEl(text, tool, ts) {
  const div = document.createElement('div');
  div.className = 'chat-msg error';
  div.innerHTML = `
    <div class="chat-bubble">✗ ${esc(text)}</div>
    <div class="chat-meta"><span>${esc(tool || '')}</span><span>${new Date(ts || Date.now()).toLocaleTimeString()}</span></div>`;
  chatLog.appendChild(div);
  return div;
}

function addSpinnerBubble(tool) {
  chatEmpty.style.display = 'none';
  const isAgentic = !!pgWorkspace.value.trim();
  const div = document.createElement('div');
  div.className = 'chat-spinner-bubble';
  div.innerHTML = `
    <div class="spin-header">
      <div class="spin-dots">
        <span class="spin-dot"></span><span class="spin-dot"></span><span class="spin-dot"></span>
      </div>
      <span>${isAgentic ? 'Running agentic subtasks…' : 'Executing…'}</span>
      <span class="spin-tool-tag">${esc(tool)}</span>
    </div>
    ${isAgentic ? '<span class="chat-meta-timestamp">Decomposing into subtasks — this may take a moment</span>' : ''}`;
  chatLog.appendChild(div);
  scrollChatBottom();
  return div;
}

function replaceSpinnerWithResponse(spinnerEl, html, latencyMs, tool, ts, save = true, model, provider) {
  const div = document.createElement('div');
  div.className = 'chat-msg assistant';
  const latBadge = latencyMs != null
    ? `<span class="latency-badge${latencyMs > 3000 ? ' slow' : ''}" style="display:inline-flex;">${latencyMs}ms</span>`
    : '';
  div.innerHTML = `
    <div class="chat-bubble">${html}</div>
    <div class="chat-meta">${latBadge}${modelBadge(model, provider)}<span>${esc(tool)}</span><span>${new Date(ts || Date.now()).toLocaleTimeString()}</span>
      <button class="chat-copy-btn">Copy</button>
    </div>`;
  spinnerEl.replaceWith(div);
  if (save) scrollChatBottom();
}

// ─── Update workspace header badges ──────────────────────────────
function updateWorkspaceUI() {
  const ws = pgWorkspace.value.trim();
  const agentic = !!pgAgenticToggle?.checked;
  if (ws) {
    chatLabel.textContent = ws.split(/[\\\/]/).pop() || ws;
    if (agentic) {
      chatBadge.textContent = '🧠 Agentic';
      chatBadge.className = 'badge badge-purple';
    } else {
      chatBadge.textContent = '📂 Grounded';
      chatBadge.className = 'badge badge-cyan';
    }
  } else {
    chatLabel.textContent = 'No workspace — one-shot mode';
    chatBadge.textContent = '⚡ One-shot';
    chatBadge.className = 'badge badge-amber';
  }
}
pgAgenticToggle?.addEventListener('change', updateWorkspaceUI);

// ─── Conversation list panel ──────────────────────────────────────
let _convSearchTimer = null;

async function refreshConvList(filter = '') {
  if (!convList) return;
  try {
    const r = await fetch('/api/sessions');
    if (!r.ok) return;
    const { sessions } = await r.json();
    const list = Array.isArray(sessions) ? sessions : [];
    const q = filter.toLowerCase().trim();
    const filtered = q ? list.filter(s => s.id.toLowerCase().includes(q)) : list;
    renderConvList(filtered);
  } catch {}
}

function renderConvList(sessions) {
  if (!convList) return;
  if (!sessions.length) {
    convList.innerHTML = '<div class="conv-empty">No conversations yet</div>';
    return;
  }
  convList.innerHTML = sessions.map(s => {
    const isActive = s.id === activeSessionId;
    const label = s.id === '__no_ws__' ? '⚡ One-shot' : s.id;
    const sub = s.msgCount ? `${s.msgCount} msgs` : 'empty';
    const ago = s.lastTs ? timeAgo(s.lastTs) : '';
    return `<div class="conv-item${isActive ? ' active' : ''}" data-sid="${esc(s.id)}" title="${esc(s.id)}">
      <div class="conv-item-label">${esc(label)}</div>
      <div class="conv-item-meta"><span>${sub}</span><span>${ago}</span></div>
    </div>`;
  }).join('');

  convList.querySelectorAll('.conv-item').forEach(el => {
    el.addEventListener('click', async () => {
      const sid = el.dataset.sid;
      if (sid === activeSessionId) return;
      
      activeSessionId = sid;
      if (sid === '__no_ws__') {
        pgWorkspace.value = '';
        localStorage.setItem('mcp-workspace', '');
        updateWorkspaceUI();
      }
      
      chatHistory = await loadChatHistory(sid);
      rebuildChatLog();
      refreshConvList(convSearch?.value || '');
    });
  });
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  return `${Math.floor(diff/86400000)}d ago`;
}

if (convSearch) {
  convSearch.addEventListener('input', () => {
    clearTimeout(_convSearchTimer);
    _convSearchTimer = setTimeout(() => refreshConvList(convSearch.value), 200);
  });
}

// ─── Workspace persistence + session switch ───────────────────────
pgWorkspace.value = localStorage.getItem('mcp-workspace') || '';
updateWorkspaceUI();

// Switch session when workspace changes
pgWorkspace.addEventListener('change', async () => {
  const ws = pgWorkspace.value.trim();
  localStorage.setItem('mcp-workspace', ws);
  updateWorkspaceUI();
  activeSessionId = await resolveSessionId(ws);
  chatHistory = await loadChatHistory(activeSessionId);
  rebuildChatLog();
  refreshConvList();
});

// Initial load
(async () => {
  activeSessionId = await resolveSessionId(pgWorkspace.value.trim());
  chatHistory = await loadChatHistory(activeSessionId);
  rebuildChatLog();
  refreshConvList();
})();

// ─── Folder picker ────────────────────────────────────────────────
document.getElementById('pg-folder-btn').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    alert('Your browser does not support the Folder Picker API. Please type the path manually.');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    const current = pgWorkspace.value.trim();
    if (!current) {
      pgWorkspace.value = handle.name;
    } else {
      const sep = current.includes('\\') ? '\\' : '/';
      const parts = current.split(sep);
      parts[parts.length - 1] = handle.name;
      pgWorkspace.value = parts.join(sep);
    }
    pgWorkspace.dispatchEvent(new Event('change'));
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('[FolderPicker]', e);
  }
});

// ─── Params panel collapse ────────────────────────────────────────
const pgParamsToggle  = document.getElementById('pg-params-toggle');
const pgParamsBody    = document.getElementById('pg-params-body');
const pgParamsChevron = document.getElementById('pg-params-chevron');
let paramsOpen = true;

pgParamsToggle.addEventListener('click', () => {
  paramsOpen = !paramsOpen;
  pgParamsBody.style.display = paramsOpen ? '' : 'none';
  pgParamsChevron.style.transform = paramsOpen ? '' : 'rotate(-90deg)';
});

// ─── Run / Send ───────────────────────────────────────────────────
pgRunBtn.addEventListener('click', async () => {
  await ensureModels();
  const params = collectParams(activeTool);

  const ws = pgWorkspace.value.trim();
  if (ws) {
    params.workspace_root = ws;
    params.sessionId = activeSessionId;
    // Agentic is an explicit opt-in (see the checkbox next to the workspace input) —
    // it used to be auto-enabled just because a workspace was set, which forced every
    // grounded request (including simple pdf://file:// reference lookups, which already
    // work via workspace memory/context alone) through subtask decomposition. That
    // decomposition has no way to distinguish injected reference content from
    // user-authored task lists, so it could shred a resolved PDF-context block into
    // bogus one-line "subtasks".
    if (activeTool.id === 'use_free_llm' && pgAgenticToggle?.checked) {
      params.agentic = true;
    }
  }

  const userText = params.prompt || params.query || params.input
    || `[${activeTool.label}] ${JSON.stringify(params).slice(0, 120)}`;
  const ts = Date.now();
  const userTurn = { role: 'user', tool: activeTool.id, content: userText, ts };

  chatHistory.push(userTurn);
  saveTurn(activeSessionId, userTurn);
  addUserBubbleEl(userText, activeTool.id, ts);

  let spinnerEl = addSpinnerBubble(activeTool.id);
  let requestDone = false;

  pgRunBtn.disabled = true;
  pgRunBtn.innerHTML = '<span class="spinner"></span>';
  pgStatus.textContent = '';
  pgLatency.style.display = 'none';

  let pollInterval = setInterval(async () => {
    try {
      const log = await loadChatHistory(activeSessionId);
      // Only rebuild if there's new content to avoid layout jumps
      if (log.length !== chatHistory.length) {
        chatHistory = log;
        rebuildChatLog();
        // rebuildChatLog() wipes chatLog.innerHTML, which destroys the spinner
        // bubble appended below — without re-adding it, the spinner silently
        // disappears (and the later spinnerEl.replaceWith() below becomes a
        // no-op on a detached node) as soon as any mid-flight server-side turn
        // (a tool call, an agentic subtask) lands before the final response.
        if (!requestDone) {
          spinnerEl = addSpinnerBubble(activeTool.id);
        }
      }
    } catch {}
  }, 800);

  try {
    const r    = await fetch('/api/tool', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tool: activeTool.id, params }) });
    const data = await r.json();
    const latencyMs = data.latencyMs ?? null;
    const replyTs   = Date.now();

    if (data.ok === false || !r.ok) {
      const errMsg = data.error || 'Unknown error';
      const errTurn = { role: 'error', tool: activeTool.id, content: errMsg, ts: replyTs };
      chatHistory.push(errTurn);
      saveTurn(activeSessionId, errTurn);
      spinnerEl.replaceWith(addErrorBubbleEl(errMsg, activeTool.id, replyTs));
      pgStatus.textContent = '✗ Failed'; pgStatus.style.color = 'var(--accent-red)';
    } else {
      const html    = await renderResponse(data);
      const rawText = (data.result ?? data);
      const nestedText = rawText?.content ?? rawText?.response;
      const content = typeof rawText === 'string' ? rawText
        : (typeof nestedText === 'string' ? nestedText : JSON.stringify(rawText, null, 2));
      const respModel = data.result?.model;
      const respProvider = data.result?.provider;
      const assistantTurn = { role: 'assistant', tool: activeTool.id, content, latencyMs, ts: replyTs, model: respModel, provider: respProvider };
      chatHistory.push(assistantTurn);
      saveTurn(activeSessionId, assistantTurn);
      replaceSpinnerWithResponse(spinnerEl, html, latencyMs, activeTool.id, replyTs, true, respModel, respProvider);
      if (latencyMs != null) {
        pgLatency.textContent = `${latencyMs}ms`;
        pgLatency.className = `latency-badge${latencyMs > 3000 ? ' slow' : ''}`;
        pgLatency.style.display = 'inline-flex';
      }
      pgStatus.textContent = '✓ Success'; pgStatus.style.color = 'var(--accent-green)';
    }
  } catch (err) {
    const errMsg = `Network error: ${err.message}`;
    const errTurn = { role: 'error', tool: activeTool.id, content: errMsg, ts: Date.now() };
    chatHistory.push(errTurn);
    saveTurn(activeSessionId, errTurn);
    spinnerEl.replaceWith(addErrorBubbleEl(errMsg, activeTool.id, Date.now()));
    pgStatus.textContent = '✗ Error'; pgStatus.style.color = 'var(--accent-red)';
  } finally {
    requestDone = true;
    clearInterval(pollInterval);
    // Do one final sync to ensure everything is matched up
    try {
      chatHistory = await loadChatHistory(activeSessionId);
      rebuildChatLog();
    } catch {}
    pgRunBtn.disabled = false;
    pgRunBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send`;
    refreshConvList(); // update message count in sidebar
    attachments = [];
    renderAttachments();
  }
});

// Clear conversation
pgClearBtn.addEventListener('click', async () => {
  await clearServerLog(activeSessionId);
  chatHistory = [];
  chatLog.innerHTML = '';
  chatLog.appendChild(chatEmpty);
  chatEmpty.style.display = 'flex';
  pgStatus.textContent = '';
  pgLatency.style.display = 'none';
  attachments = [];
  renderAttachments();
  refreshConvList();
});

// Render initial form
renderToolForm(activeTool);

// ─── MEMORY TAB ──────────────────────────────────────────────────
const memSessionInput  = document.getElementById('mem-session-input');
const memSessionSelect = document.getElementById('mem-session-select');
const memLoadBtn       = document.getElementById('mem-load-btn');
const memRefreshBtn    = document.getElementById('mem-refresh-btn');
const memKnowledge     = document.getElementById('mem-knowledge');
const memUpdated       = document.getElementById('mem-updated');
const memSessionLabel  = document.getElementById('mem-session-label');

let activeMemSid     = '';
let memPollInterval  = null;

async function fetchSessions() {
  try {
    const r = await fetch('/api/sessions');
    if (!r.ok) return;
    const d = await r.json();
    const sessions = d.sessions || [];
    while (memSessionSelect.options.length > 1) memSessionSelect.remove(1);
    sessions.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.id === '__no_ws__' ? '⚡ One-shot' : s.id;
      memSessionSelect.appendChild(o);
    });
  } catch {}
}

async function fetchMemory(sid) {
  if (!sid) return;
  try {
    const r = await fetch(`/api/memory/${encodeURIComponent(sid)}`);
    if (!r.ok) { memKnowledge.value = `Error ${r.status}: ${r.statusText}`; return; }
    const d = await r.json();
    memKnowledge.value = d.knowledge || '';
    memSessionLabel.textContent = ` — ${sid}`;
    const resolvedContext = d.queues?.resolvedContext || {};
    renderQueue('queue-now',     d.queues?.nowQueue,     resolvedContext);
    renderQueue('queue-next',    d.queues?.nextQueue,    resolvedContext);
    renderQueue('queue-blocked', d.queues?.blockedQueue, resolvedContext);
    renderQueue('queue-improve', d.queues?.improveQueue, resolvedContext);
    renderHistory(d.queues?.history);
    renderPausedBanner(d.queues?.paused, d.queues?.promptId);
    memUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    memKnowledge.value = `Fetch error: ${err.message}`;
  }
}

function renderQueue(id, items, resolvedContext) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!items?.length) {
    el.innerHTML = '<div class="queue-empty">—</div>';
    return;
  }
  el.innerHTML = items.map(item => {
    // Queue entries are {id, task} objects; the `typeof` check keeps this working against
    // state.json files persisted before this shape existed.
    let text = typeof item === 'string' ? item : (item?.task ?? String(item));
    // Task text may still contain unresolved protected_ref_N placeholders
    // (lazy-resolution design) — swap in the actual content from
    // resolvedContext at display time so raw placeholder tokens aren't shown.
    if (resolvedContext) {
      text = text.replace(/protected_ref_[A-Za-z0-9_]+/g, m => resolvedContext[m] ?? m);
    }
    return `
    <div class="queue-item">
      <span class="queue-chevron">›</span>
      <span>${esc(text)}</span>
    </div>`;
  }).join('');
}

function renderPausedBanner(paused, promptId) {
  const banner = document.getElementById('mem-paused-banner');
  if (!banner) return;
  if (paused) {
    const idEl = document.getElementById('mem-paused-promptid');
    if (idEl) idEl.textContent = `continue ${promptId || ''}`;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

let _historyData = [];
let _historyExpanded = false; // drives the "Expand All / Collapse All" button label
let _expandedIndices = new Set(); // per-entry state, since the Memory tab polls every 3s and
                                   // used to fully rebuild the list from a single shared flag —
                                   // discarding whatever the user had just manually expanded on
                                   // the very next poll tick, making the dropdown look broken.

function renderHistory(history) {
  const el = document.getElementById('queue-history');
  if (!el) return;
  _historyData = history || [];
  _applyHistoryFilter(document.getElementById('history-filter')?.value || '');
}

function _applyHistoryFilter(q) {
  const el = document.getElementById('queue-history');
  if (!el) return;
  if (!_historyData.length) {
    el.innerHTML = '<div class="queue-empty">No subtask history recorded yet.</div>';
    return;
  }
  const filtered = q
    ? _historyData.filter(h => h.task?.toLowerCase().includes(q.toLowerCase()))
    : _historyData;
  if (!filtered.length) {
    el.innerHTML = `<div class="queue-empty">No history entries match "${esc(q)}".</div>`;
    return;
  }

  // Render timeline entries (synchronously, then async-patch mermaid)
  el.innerHTML = filtered.map((h, idx) => {
    const globalIdx = _historyData.indexOf(h);
    const dateStr = h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : '';
    const isError = /error|failed|exception/i.test(h.output || '');
    const borderColor = isError ? 'var(--accent-red)' : 'var(--accent-green)';
    const filesStr = h.filesModified?.length
      ? `<div style="font-size:.7rem;color:var(--accent-cyan);margin-top:4px;">Files: ${h.filesModified.map(f => `<code style="font-size:.7rem;">${esc(f)}</code>`).join(', ')}</div>`
      : '';
    const expanded = _expandedIndices.has(globalIdx);
    return `
      <div class="queue-item hist-entry" data-idx="${globalIdx}" style="flex-direction:column;align-items:stretch;gap:0;border-left:3px solid ${borderColor};padding-left:10px;border-radius:0 var(--radius-sm) var(--radius-sm) 0;">
        <div class="hist-entry-toggle" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:6px 0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${isError ? 'var(--accent-red)' : 'var(--accent-purple)'};color:#fff;font-size:.65rem;font-weight:700;flex-shrink:0;">${globalIdx + 1}</span>
            <span style="font-weight:600;color:var(--text-primary);font-size:.82rem;">${esc(h.task || 'Untitled step')}</span>
            ${h.taskId ? `<code style="font-size:.65rem;color:var(--text-muted);">${esc(h.taskId)}</code>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            ${h.provider ? `<span style="font-size:.68rem;padding:1px 6px;border-radius:8px;background:rgba(255,255,255,.06);color:var(--accent-cyan);">${esc(h.provider)}</span>` : ''}
            ${h.model ? `<span style="font-size:.68rem;padding:1px 6px;border-radius:8px;background:rgba(255,255,255,.06);color:var(--text-muted);">${esc(h.model)}</span>` : ''}
            ${dateStr ? `<span style="font-size:.68rem;color:var(--text-muted);">${dateStr}</span>` : ''}
            <span id="hist-chevron-${globalIdx}" style="color:var(--text-muted);transition:transform .2s;transform:${expanded ? 'rotate(90deg)' : 'rotate(0deg)'};">&rsaquo;</span>
          </div>
        </div>
        ${filesStr}
        <div id="hist-out-${globalIdx}" class="hist-body" style="display:${expanded ? 'block' : 'none'};margin-top:6px;padding:10px;font-size:.78rem;background:rgba(0,0,0,.3);border-radius:var(--radius-sm);border:1px solid var(--glass-border);">
          <span style="color:var(--text-muted);font-style:italic;">Rendering…</span>
        </div>
      </div>
    `;
  }).join('');

  // Async render markdown/mermaid for each visible body
  filtered.forEach((h, idx) => {
    const globalIdx = _historyData.indexOf(h);
    const bodyEl = document.getElementById(`hist-out-${globalIdx}`);
    if (!bodyEl) return;
    renderMarkdown(h.output || '').then(html => { bodyEl.innerHTML = html || '<em style="color:var(--text-muted);">No output</em>'; });
  });
}

function toggleHistEntry(idx) {
  const body = document.getElementById(`hist-out-${idx}`);
  const chevron = document.getElementById(`hist-chevron-${idx}`);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (chevron) chevron.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
  // Persist so the next 3s poll's full re-render doesn't silently collapse this again.
  if (open) _expandedIndices.delete(idx);
  else _expandedIndices.add(idx);
}

// Delegated click for individual subtask rows — the CSP's `script-src-attr: 'none'`
// (Helmet default) silently blocks inline onclick="..." attributes, so this can't be
// bound inline; delegate from the container instead (same fix as the copy buttons above).
document.getElementById('queue-history')?.addEventListener('click', (e) => {
  const row = e.target.closest('.hist-entry-toggle');
  if (!row) return;
  const entry = row.closest('.hist-entry');
  if (!entry) return;
  toggleHistEntry(parseInt(entry.dataset.idx, 10));
});

// History filter input
document.getElementById('history-filter')?.addEventListener('input', e => {
  _applyHistoryFilter(e.target.value);
});

// Expand / Collapse All
document.getElementById('history-toggle-all')?.addEventListener('click', function() {
  _historyExpanded = !_historyExpanded;
  this.textContent = _historyExpanded ? 'Collapse All' : 'Expand All';
  if (_historyExpanded) {
    _historyData.forEach((_, i) => _expandedIndices.add(i));
  } else {
    _expandedIndices.clear();
  }
  _applyHistoryFilter(document.getElementById('history-filter')?.value || '');
});


function startMemPoll(sid) {
  stopMemPoll();
  activeMemSid = sid;
  fetchMemory(sid);
  memPollInterval = setInterval(() => fetchMemory(sid), 3000);
}

function stopMemPoll() {
  if (memPollInterval) { clearInterval(memPollInterval); memPollInterval = null; }
}

memLoadBtn.addEventListener('click', () => {
  const sid = memSessionInput.value.trim();
  if (sid) startMemPoll(sid);
});

memSessionSelect.addEventListener('change', () => {
  const sid = memSessionSelect.value;
  if (sid) { memSessionInput.value = sid; startMemPoll(sid); }
});

memRefreshBtn.addEventListener('click', () => {
  if (activeMemSid) fetchMemory(activeMemSid);
});

// ─── PROFILE & LEADERBOARD TAB ────────────────────────────────────
let currentUserId = '';

async function fetchUserConfig() {
  try {
    const r = await fetch('/api/user-config');
    if (!r.ok) return;
    const d = await r.json();
    currentUserId = d.userId;
    document.getElementById('profile-username').value = d.username || '';
    document.getElementById('profile-telemetry').checked = !d.optOutTelemetry;
  } catch (err) {
    console.error('[Dashboard] Failed to fetch user config:', err);
  }
}

async function fetchLeaderboard() {
  try {
    const r = await fetch('/api/leaderboard');
    if (!r.ok) return;
    const list = await r.json();
    const el = document.getElementById('leaderboard-list');
    if (!list.length) {
      el.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--text-muted);">No users on the leaderboard yet.</div>';
      return;
    }

    el.innerHTML = list.map((u, idx) => {
      const isCurrent = u.isCurrentUser;
      const rankBadge = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx + 1}`));
      const highlightCls = isCurrent ? 'style="border-color:var(--accent-purple);background:rgba(124,58,237,.08);"' : '';
      return `
        <div class="feature-row" ${highlightCls} style="padding:10px 12px;border-radius:var(--radius-sm);margin-bottom:4px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-weight:700;font-family:\'JetBrains Mono\',monospace;width:24px;">${rankBadge}</span>
            <div>
              <span style="font-weight:600;color:${isCurrent ? 'var(--accent-purple)' : 'var(--text-primary)'};">${esc(u.username)}</span>
              ${isCurrent ? '<span class="badge badge-purple" style="margin-left:6px;font-size:.65rem;">You</span>' : ''}
              <div class="stat-sub" style="margin:0;font-size:.7rem;">Active ${new Date(u.lastSyncTime).toLocaleDateString()}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700;color:var(--accent-cyan);font-size:.85rem;">${fmt(u.lifetimeTokens)} tokens</div>
            <div class="stat-sub" style="margin:0;font-size:.7rem;">${fmt(u.lifetimeRequests)} requests</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('[Dashboard] Failed to fetch leaderboard:', err);
  }
}

document.getElementById('profile-save-btn').addEventListener('click', async () => {
  const username = document.getElementById('profile-username').value.trim();
  const optOutTelemetry = !document.getElementById('profile-telemetry').checked;
  const statusEl = document.getElementById('profile-status');

  statusEl.textContent = 'Saving…';
  statusEl.className = 'c-cyan';

  try {
    const r = await fetch('/api/user-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, optOutTelemetry })
    });
    const d = await r.json();

    if (d.error) {
      statusEl.textContent = `Error: ${d.error}`;
      statusEl.className = 'c-red';
    } else {
      statusEl.textContent = '✓ Settings saved successfully!';
      statusEl.className = 'c-green';
      fetchLeaderboard();
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    statusEl.className = 'c-red';
  }
});

// Stop polling when memory tab is hidden
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tab !== 'memory') stopMemPoll();
  });
});

// ─── Quick Start Copy Buttons ────────────────────────────────────
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    navigator.clipboard.writeText(target.innerText).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  });
});

// ─── Initialise ──────────────────────────────────────────────────
fetchStats();
setInterval(fetchStats, 5000);

// Auto-refresh session list periodically when memory tab is active
setInterval(() => {
  const memActive = document.getElementById('panel-memory')?.classList.contains('active');
  if (memActive) fetchSessions();
}, 10000);

// ─── WIKI TAB ───────────────────────────────────────────────────
const wikiWorkspaceInput = document.getElementById('wiki-workspace-input');
const wikiLoadBtn        = document.getElementById('wiki-load-btn');
const wikiPageList       = document.getElementById('wiki-page-list');
const wikiPageTitle      = document.getElementById('wiki-page-title');
const wikiPageBody       = document.getElementById('wiki-page-body');
const wikiRelated        = document.getElementById('wiki-related');

let wikiInitialized = false;
let wikiActiveTitle = null;

function initWikiTab() {
  if (!wikiInitialized) {
    wikiInitialized = true;
    const savedWs = localStorage.getItem('mcp-workspace');
    if (savedWs) {
      wikiWorkspaceInput.value = savedWs;
      loadWikiList();
    }
  }
}

async function callManageMemory(params) {
  const r = await fetch('/api/tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: 'manage_memory', params: { ...params, workspace_root: wikiWorkspaceInput.value.trim() } })
  });
  const d = await r.json();
  if (!r.ok || d.ok === false) throw new Error(d.error || 'Request failed');
  return d.result;
}

async function loadWikiList() {
  wikiPageList.innerHTML = '<div class="conv-empty">Loading…</div>';
  try {
    const result = await callManageMemory({ action: 'wiki_list' });
    const pages = result.pages || [];
    if (!pages.length) {
      wikiPageList.innerHTML = '<div class="conv-empty">No wiki pages yet for this workspace.</div>';
      return;
    }
    wikiPageList.innerHTML = pages.map(p => `
      <div class="wiki-page-item${p.title === wikiActiveTitle ? ' active' : ''}" data-title="${esc(p.title)}">
        <span>${esc(p.title)}</span>
        <span class="badge ${p.tier === 'semantic' ? 'badge-green' : 'badge-amber'}" style="width:fit-content;font-size:.62rem;">${esc(p.tier)} · ${Math.round((p.confidence||0)*100)}%</span>
      </div>
    `).join('');
    wikiPageList.querySelectorAll('.wiki-page-item').forEach(el => {
      el.addEventListener('click', () => loadWikiPage(el.dataset.title));
    });
  } catch (err) {
    wikiPageList.innerHTML = `<div class="conv-empty">Failed to load: ${esc(err.message)}</div>`;
  }
}

async function loadWikiPage(title) {
  wikiActiveTitle = title;
  wikiPageTitle.textContent = title;
  wikiPageBody.innerHTML = '<div class="conv-empty">Loading…</div>';
  wikiRelated.innerHTML = '';
  wikiPageList.querySelectorAll('.wiki-page-item').forEach(el => {
    el.classList.toggle('active', el.dataset.title === title);
  });
  try {
    const result = await callManageMemory({ action: 'wiki_read', title });
    const page = result.page;
    if (!page) {
      wikiPageBody.innerHTML = '<div class="conv-empty">Page not found.</div>';
      return;
    }
    wikiPageBody.innerHTML = await renderMarkdown(page.content);
    if (page.links && page.links.length) {
      wikiRelated.innerHTML = page.links.map(l => `<span class="wiki-link-chip" data-title="${esc(l)}">${esc(l)}</span>`).join('');
      wikiRelated.querySelectorAll('.wiki-link-chip').forEach(el => {
        el.addEventListener('click', () => loadWikiPage(el.dataset.title));
      });
    }
  } catch (err) {
    wikiPageBody.innerHTML = `<div class="conv-empty">Failed to load page: ${esc(err.message)}</div>`;
  }
}

// Delegated click handler for [[wiki links]] rendered inline by renderMarkdown()
wikiPageBody?.addEventListener('click', (e) => {
  const a = e.target.closest('.wiki-link');
  if (a) {
    e.preventDefault();
    loadWikiPage(a.dataset.title);
  }
});

wikiLoadBtn?.addEventListener('click', loadWikiList);
wikiWorkspaceInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadWikiList();
});
