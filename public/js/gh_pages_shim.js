// GitHub Pages & Subpath Compatibility Shim
// Automatically prefixes root-relative "/assets/...", "/data/...", "/css/...", "/js/..."
// URLs when the game is hosted under a subpath (e.g. https://<user>.github.io/<repo>/).

(function initGhPagesShim() {
  if (typeof window === 'undefined') return;

  // Determine the base directory path from this module's URL (<base>/js/gh_pages_shim.js)
  let basePath = '';
  try {
    const rootUrl = new URL('..', import.meta.url);
    basePath = rootUrl.pathname.replace(/\/+$/, '');
  } catch {
    const p = window.location.pathname || '/';
    basePath = p.replace(/\/[^/]*$/, '').replace(/\/+$/, '');
  }

  window.__GUILDRUN_BASE__ = basePath;

  const ROOT_PREFIX_RE = /^\/(assets|data|css|js|manifest\.json)(\/|$)/;
  const CSS_URL_RE = /url\(\s*(['"]?)\/(assets|data)\//g;

  function rewriteUrl(url) {
    if (typeof url !== 'string') return url;
    if (ROOT_PREFIX_RE.test(url)) {
      return (basePath || '.') + url;
    }
    return url;
  }

  function rewriteCssText(css) {
    if (typeof css !== 'string' || (!css.includes('/assets/') && !css.includes('/data/'))) return css;
    const prefix = basePath || '.';
    return css.replace(CSS_URL_RE, (_m, quote, dir) => `url(${quote}${prefix}/${dir}/`);
  }

  window.__resolveGuildrunAssetUrl = rewriteUrl;
  window.__resolveGuildrunCssText = rewriteCssText;

  if (!basePath || basePath === '') return; // Hosted at domain root '/'

  // 1. Patch window.fetch
  const origFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input, init) {
    if (typeof input === 'string') {
      input = rewriteUrl(input);
    } else if (input instanceof Request && typeof input.url === 'string') {
      try {
        const u = new URL(input.url);
        if (u.origin === window.location.origin && ROOT_PREFIX_RE.test(u.pathname)) {
          const nextUrl = `${u.origin}${basePath}${u.pathname}${u.search}${u.hash}`;
          input = new Request(nextUrl, input);
        }
      } catch {}
    }
    return origFetch(input, init);
  };

  // 2. Patch HTMLImageElement.prototype.src & HTMLAudioElement.prototype.src
  for (const Ctor of [window.HTMLImageElement, window.HTMLAudioElement, window.HTMLSourceElement]) {
    if (!Ctor || !Ctor.prototype) continue;
    const desc = Object.getOwnPropertyDescriptor(Ctor.prototype, 'src');
    if (desc && desc.set && desc.get) {
      Object.defineProperty(Ctor.prototype, 'src', {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set(val) {
          desc.set.call(this, rewriteUrl(val));
        },
      });
    }
  }

  // 3. Patch Element.prototype.setAttribute for src / href / style
  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function patchedSetAttribute(name, value) {
    if (typeof value === 'string') {
      const lower = String(name).toLowerCase();
      if (lower === 'src' || lower === 'href') {
        value = rewriteUrl(value);
      } else if (lower === 'style') {
        value = rewriteCssText(value);
      }
    }
    return origSetAttr.call(this, name, value);
  };

  // 4. Patch CSSStyleDeclaration properties (Works across Chrome/Blink, Safari/WebKit, Firefox/Gecko)
  if (window.CSSStyleDeclaration && window.CSSStyleDeclaration.prototype) {
    const proto = window.CSSStyleDeclaration.prototype;
    const origSetProp = proto.setProperty;
    if (origSetProp) {
      proto.setProperty = function patchedSetProperty(prop, val, priority) {
        if (typeof val === 'string') val = rewriteCssText(val);
        return origSetProp.call(this, prop, val, priority);
      };
    }
    for (const [jsProp, cssProp] of [['backgroundImage', 'background-image'], ['background', 'background']]) {
      const d = Object.getOwnPropertyDescriptor(proto, jsProp);
      if (d && d.set && d.get) {
        Object.defineProperty(proto, jsProp, {
          configurable: true,
          enumerable: d.enumerable,
          get: d.get,
          set(val) {
            d.set.call(this, rewriteCssText(val));
          },
        });
      } else if (origSetProp) {
        try {
          Object.defineProperty(proto, jsProp, {
            configurable: true,
            enumerable: true,
            get() {
              return this.getPropertyValue(cssProp);
            },
            set(val) {
              origSetProp.call(this, cssProp, rewriteCssText(val));
            },
          });
        } catch {}
      }
    }
  }

  // 5. Patch dynamically injected <style> elements
  const origAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function patchedAppendChild(child) {
    if (child && child.nodeName === 'STYLE' && typeof child.textContent === 'string' && child.textContent.includes('/assets/')) {
      child.textContent = rewriteCssText(child.textContent);
    }
    return origAppendChild.call(this, child);
  };
})();

