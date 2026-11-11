/* 老电视 WebView 兼容层（必须保持 ES5 语法，本身不能需要转译）。
   Android 5/6 电视自带 WebView 大约是 Chromium 47~55，缺下面这些 API。
   这个文件必须第一个加载，否则 esbuild 的 __spreadValues 辅助函数
   一执行 Object.getOwnPropertyDescriptors 就会抛错，页面直接白屏。 */
(function () {
  'use strict';
  // 严格模式下普通函数里 this 是 undefined，不能用 this 取全局对象！
  // 必须显式取 window，否则整个 polyfill 文件会静默退出（老电视上表现为连环报错）。
  var g = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (!g) return;
  if (!g.globalThis) { try { g.globalThis = g; } catch (e) {} }

  function def(obj, key, value) {
    if (!obj[key]) {
      try {
        Object.defineProperty(obj, key, { value: value, writable: true, configurable: true });
      } catch (e) { obj[key] = value; }
    }
  }
  function isCallable(fn) { return typeof fn === 'function'; }

  /* ---- Object ---- */
  def(Object, 'assign', function (target) {
    if (target == null) throw new TypeError('Cannot convert undefined or null to object');
    var to = Object(target);
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (src == null) continue;
      for (var key in src) if (Object.prototype.hasOwnProperty.call(src, key)) to[key] = src[key];
    }
    return to;
  });
  def(Object, 'values', function (o) {
    var out = [], k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out.push(o[k]);
    return out;
  });
  def(Object, 'entries', function (o) {
    var out = [], k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out.push([k, o[k]]);
    return out;
  });
  def(Object, 'fromEntries', function (list) {
    var out = {};
    for (var i = 0; i < list.length; i++) out[list[i][0]] = list[i][1];
    return out;
  });
  def(Object, 'hasOwn', function (o, k) {
    return Object.prototype.hasOwnProperty.call(Object(o), k);
  });
  def(Object, 'getOwnPropertyDescriptors', function (o) {
    var obj = Object(o), out = {}, i, key, names, syms;
    names = Object.getOwnPropertyNames(obj);
    for (i = 0; i < names.length; i++) {
      key = names[i];
      out[key] = Object.getOwnPropertyDescriptor(obj, key);
    }
    if (Object.getOwnPropertySymbols) {
      syms = Object.getOwnPropertySymbols(obj);
      for (i = 0; i < syms.length; i++) {
        key = syms[i];
        out[key] = Object.getOwnPropertyDescriptor(obj, key);
      }
    }
    return out;
  });

  /* ---- Array ---- */
  def(Array, 'from', function (items) {
    var mapFn = arguments[1], thisArg = arguments[2], out = [], i, o = Object(items);
    var len = Math.min(Math.max(parseInt(o.length, 10) || 0, 0), 9007199254740991);
    for (i = 0; i < len; i++) out.push(mapFn ? mapFn.call(thisArg, o[i], i) : o[i]);
    return out;
  });
  def(Array.prototype, 'includes', function (item) {
    var len = this.length >>> 0, from = Number(arguments[1]) || 0, i;
    if (from < 0) from = Math.max(len + from, 0);
    for (i = from; i < len; i++) {
      if (this[i] === item || (this[i] !== this[i] && item !== item)) return true;
    }
    return false;
  });
  def(Array.prototype, 'at', function (n) {
    var len = this.length >>> 0, i = Number(n) || 0;
    i = i < 0 ? len + Math.ceil(i) : Math.floor(i);
    return (i >= 0 && i < len) ? this[i] : undefined;
  });
  def(Array.prototype, 'flat', function () {
    var depth = arguments[0] == null ? 1 : Number(arguments[0]) || 0;
    function step(list, d) {
      var out = [], i, v;
      for (i = 0; i < list.length; i++) {
        v = list[i];
        if (Array.isArray(v) && d > 0) out = out.concat(step(v, d - 1));
        else out.push(v);
      }
      return out;
    }
    return step(this, depth);
  });
  def(Array.prototype, 'flatMap', function (fn) {
    var out = [], i, v;
    for (i = 0; i < this.length; i++) {
      v = fn.call(arguments[1], this[i], i, this);
      if (Array.isArray(v)) out = out.concat(v); else out.push(v);
    }
    return out;
  });
  def(Array.prototype, 'find', function (fn) {
    for (var i = 0; i < this.length; i++) if (fn.call(arguments[1], this[i], i, this)) return this[i];
    return undefined;
  });
  def(Array.prototype, 'findIndex', function (fn) {
    for (var i = 0; i < this.length; i++) if (fn.call(arguments[1], this[i], i, this)) return i;
    return -1;
  });
  def(Array.prototype, 'findLast', function (fn) {
    for (var i = this.length - 1; i >= 0; i--) if (fn.call(arguments[1], this[i], i, this)) return this[i];
    return undefined;
  });
  def(Array.prototype, 'findLastIndex', function (fn) {
    for (var i = this.length - 1; i >= 0; i--) if (fn.call(arguments[1], this[i], i, this)) return i;
    return -1;
  });
  def(Array.prototype, 'fill', function (v) {
    var len = this.length >>> 0, start = arguments[1] == null ? 0 : Number(arguments[1]) || 0,
        end = arguments[2] == null ? len : Number(arguments[2]) || 0, i;
    if (start < 0) start = Math.max(len + start, 0);
    if (end < 0) end = len + end;
    for (i = Math.min(start, len); i < Math.min(end, len); i++) this[i] = v;
    return this;
  });
  def(Array.prototype, 'copyWithin', function (target, start) {
    var len = this.length >>> 0, t = Number(target) || 0, s = Number(start) || 0,
        e = arguments[2] == null ? len : Number(arguments[2]) || 0, copy, i;
    if (t < 0) t = Math.max(len + t, 0);
    if (s < 0) s = Math.max(len + s, 0);
    if (e < 0) e = Math.max(len + e, 0);
    copy = Array.prototype.slice.call(this, s, Math.min(e, len));
    for (i = 0; i < copy.length && t + i < len; i++) this[t + i] = copy[i];
    return this;
  });

  /* ---- String：官网解析大量依赖 matchAll ---- */
  def(String.prototype, 'matchAll', function (re) {
    if (!re || !re.global) throw new TypeError('matchAll requires a global RegExp');
    var flags = re.flags || ((re.global ? 'g' : '') + (re.ignoreCase ? 'i' : '') +
      (re.multiline ? 'm' : '') + (re.unicode ? 'u' : '') + (re.sticky ? 'y' : ''));
    var rx = new RegExp(re.source, flags);
    var text = String(this), out = [], m, copy;
    while ((m = rx.exec(text)) !== null) {
      copy = Array.prototype.slice.call(m);
      copy.index = m.index;
      copy.input = text;
      copy.groups = m.groups || undefined;
      out.push(copy);
      if (m[0] === '') rx.lastIndex++;
    }
    return out;
  });
  def(String.prototype, 'replaceAll', function (search, replacement) {
    var s = String(this);
    if (search instanceof RegExp) return s.replace(new RegExp(search.source, search.flags + 'g'), replacement);
    return s.split(String(search)).join(String(replacement));
  });
  def(String.prototype, 'padStart', function (len, pad) {
    var s = String(this), p = String(pad === undefined ? ' ' : pad), need = len - s.length, out = '';
    while (out.length < need) out += p;
    return out.slice(0, need) + s;
  });
  def(String.prototype, 'padEnd', function (len, pad) {
    var s = String(this), p = String(pad === undefined ? ' ' : pad), need = len - s.length, out = '';
    while (out.length < need) out += p;
    return s + out.slice(0, need);
  });
  def(String.prototype, 'trimStart', function () { return String(this).replace(/^\s+/, ''); });
  def(String.prototype, 'trimEnd', function () { return String(this).replace(/\s+$/, ''); });
  def(String.prototype, 'startsWith', function (q, pos) {
    return String(this).slice(pos || 0, (pos || 0) + String(q).length) === String(q);
  });
  def(String.prototype, 'endsWith', function (q, pos) {
    var s = String(this), end = pos == null ? s.length : Math.min(Math.max(pos, 0), s.length);
    return s.slice(end - String(q).length, end) === String(q);
  });

  /* ---- Promise / 微任务 ---- */
  if (isCallable(g.Promise) && !g.Promise.prototype.finally) {
    def(g.Promise.prototype, 'finally', function (fn) {
      var P = this.constructor || g.Promise;
      return this.then(function (v) { return P.resolve(fn && fn()).then(function () { return v; }); },
        function (e) { return P.resolve(fn && fn()).then(function () { throw e; }); });
    });
  }
  if (!g.queueMicrotask) g.queueMicrotask = function (cb) { return g.Promise.resolve().then(cb); };
  if (!g.requestIdleCallback) {
    g.requestIdleCallback = function (cb) {
      var start = Date.now();
      return setTimeout(function () {
        cb({ didTimeout: false, timeRemaining: function () { return Math.max(0, 50 - (Date.now() - start)); } });
      }, 1);
    };
    g.cancelIdleCallback = function (id) { clearTimeout(id); };
  }

  /* ---- DOM：老 WebView 常见的观察器 / 选择器 API ---- */
  if (g.Element) {
    if (!g.Element.prototype.matches) {
      g.Element.prototype.matches = g.Element.prototype.msMatchesSelector ||
        g.Element.prototype.webkitMatchesSelector || function (sel) {
          var nodes = (this.parentNode || this.document).querySelectorAll(sel), i;
          for (i = 0; i < nodes.length; i++) if (nodes[i] === this) return true;
          return false;
        };
    }
    if (!g.Element.prototype.closest) {
      def(g.Element.prototype, 'closest', function (sel) {
        var el = this;
        while (el && el.nodeType === 1) {
          if (el.matches(sel)) return el;
          el = el.parentElement;
        }
        return null;
      });
    }
  }
  if (g.NodeList && !g.NodeList.prototype.forEach) {
    def(g.NodeList.prototype, 'forEach', Array.prototype.forEach);
  }
  // Chrome 44 的 NodeList / HTMLCollection 没有 Symbol.iterator，Babel 转出来的
  // for-of 辅助函数遍历它们会抛 "Invalid attempt to iterate non-iterable instance"。
  if (g.Symbol && g.Symbol.iterator) {
    var iteratorSymbol = g.Symbol.iterator;
    var collectionTypes = [g.NodeList, g.HTMLCollection, g.DOMTokenList, g.FileList];
    for (var ci = 0; ci < collectionTypes.length; ci++) {
      var ctor = collectionTypes[ci];
      if (ctor && ctor.prototype && !ctor.prototype[iteratorSymbol]) {
        try { ctor.prototype[iteratorSymbol] = Array.prototype[iteratorSymbol]; } catch (e) {}
      }
    }
  }
  function noopObserver() {
    this.observe = function () {};
    this.unobserve = function () {};
    this.disconnect = function () {};
    this.takeRecords = function () { return []; };
  }
  if (!g.IntersectionObserver) g.IntersectionObserver = noopObserver;
  if (!g.ResizeObserver) g.ResizeObserver = noopObserver;
  if (!g.MutationObserver) g.MutationObserver = noopObserver;
  if (!g.CSS) g.CSS = {};
  if (!g.CSS.supports) g.CSS.supports = function () { return false; };
  if (!g.AbortController) {
    g.AbortController = function () {
      var listeners = [];
      this.signal = {
        aborted: false,
        addEventListener: function (type, fn) { if (type === 'abort') listeners.push(fn); },
        removeEventListener: function (type, fn) {
          var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1);
        }
      };
      this.abort = function () {
        if (this.signal.aborted) return;
        this.signal.aborted = true;
        for (var i = 0; i < listeners.length; i++) listeners[i]();
      };
    };
  }
  // Chromium 44 没有 BigInt 全局。WebView 播放器里有一处 BigInt(...) 求 seek 时间，
  // TV 端播放走原生 PlayerActivity 不会执行，但给个数值兜底避免万一触发时 ReferenceError。
  if (typeof g.BigInt === 'undefined') g.BigInt = function (v) { return Number(v); };
  // 桌面版 avplayer 的懒加载 import() 在 Chrome 44 是语法错误；构建时会被换成
  // __xmNoopImport()，TV 端播放走原生 PlayerActivity，这里给一个安全的 reject。
  g.__xmNoopImport = function () { return g.Promise.reject(new Error('unsupported on TV')); };
  if (!Number.isFinite) Number.isFinite = function (v) { return typeof v === 'number' && isFinite(v); };
  if (!Number.isInteger) Number.isInteger = function (v) { return Number.isFinite(v) && Math.floor(v) === v; };
  if (!Number.isNaN) Number.isNaN = function (v) { return v !== v; };
})();
