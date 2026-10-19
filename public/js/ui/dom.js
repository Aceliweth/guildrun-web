// Tiny DOM helpers: element factory, toasts, modals, error panels.

function fixUrl(u) {
  if (typeof u !== 'string') return u;
  if (typeof window !== 'undefined' && typeof window.__resolveGuildrunAssetUrl === 'function') {
    return window.__resolveGuildrunAssetUrl(u);
  }
  if (/^\/(assets|data|css|js|manifest\.json)(\/|$)/.test(u)) {
    return '.' + u;
  }
  return u;
}

function fixCss(s) {
  if (typeof s !== 'string') return s;
  if (typeof window !== 'undefined' && typeof window.__resolveGuildrunCssText === 'function') {
    return window.__resolveGuildrunCssText(s);
  }
  return s.replace(/url\(\s*(['"]?)\/(assets|data)\//g, 'url($1./$2/');
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv == null) continue;
          el.style[sk] = typeof sv === 'string' ? fixCss(sv) : sv;
        }
      }
      else if (k === 'style' && typeof v === 'string') el.setAttribute('style', fixCss(v));
      else if (k === 'html') el.innerHTML = typeof v === 'string' ? v.replace(/(src|href)=(['"])\/(assets|data)\//g, '$1=$2./$3/') : v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else if (k === 'src' || k === 'href') el.setAttribute(k, fixUrl(String(v)));
      else el.setAttribute(k, v);
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** <img> that hides itself (or swaps to fallback) when the sprite is missing. */
export function img(src, attrs = {}, fallback) {
  const el = h('img', { draggable: 'false', alt: '', ...attrs });
  let triedFallback = false;
  el.addEventListener('error', () => {
    if (fallback && !triedFallback) { triedFallback = true; el.src = fixUrl(fallback); return; }
    el.style.visibility = 'hidden';
  });
  if (src) el.src = fixUrl(src); else if (fallback) { triedFallback = true; el.src = fixUrl(fallback); } else el.style.visibility = 'hidden';
  return el;
}

let toastHost = null;
export function toast(msg, kind = 'info', ms = 2600) {
  if (!toastHost) { toastHost = h('div', { class: 'toast-host' }); document.body.appendChild(toastHost); }
  const el = h('div', { class: `toast toast-${kind}` }, msg);
  toastHost.appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

export function modal({ title, body, content, onClose, actions = [], cls = '', dismissable = true }) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const close = () => {
    backdrop.remove();
    try { onClose?.(); } catch {}
  };
  const box = h('div', { class: `modal panel ${cls}` },
    title ? h('h2', { class: 'modal-title' }, title) : null,
    h('div', { class: 'modal-body' }, body ?? content),
    actions.length ? h('div', { class: 'modal-actions' }, actions.map((a) => h('button', {
      class: `btn ${a.primary ? 'btn-primary' : 'btn-secondary'}`,
      onclick: () => { if (a.onClick?.() !== false) close(); },
    }, a.label))) : null);
  backdrop.appendChild(box);
  if (dismissable) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.appendChild(backdrop);
  return { close, el: box };
}

export function errorPanel(title, message, details) {
  return h('div', { class: 'error-panel panel' },
    h('div', { class: 'error-icon' }, '⚠'),
    h('h3', null, title),
    h('p', null, message),
    details ? h('pre', { class: 'error-details' }, String(details)) : null);
}
