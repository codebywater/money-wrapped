/*
 * Минимальный «браузер» для тестов app.js в Node: элементы по id, события,
 * классы, фокус и ручные часы вместо setTimeout. Без зависимостей.
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DOCS = path.join(__dirname, "../docs");

class El {
  constructor(doc, tag, attrs = {}) {
    this.doc = doc;
    this.tagName = tag.toUpperCase();
    this.id = attrs.id || "";
    this.classes = new Set((attrs.class || "").split(/\s+/).filter(Boolean));
    this.parent = null;
    this.children = [];
    this.listeners = {};
    this.style = { setProperty() {} };
    this.dataset = {};
    this.hidden = "hidden" in attrs;
    this.textContent = "";
    this.onclick = null;
    this._html = "";
    const el = this;
    this.classList = {
      add: (c) => el.classes.add(c),
      remove: (c) => el.classes.delete(c),
      contains: (c) => el.classes.has(c),
    };
  }
  get className() { return [...this.classes].join(" "); }
  set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get firstElementChild() { return this.children[0] || null; }
  get offsetWidth() { return 0; }
  get innerHTML() { return this._html; }
  set innerHTML(html) {
    this._html = html;
    for (const c of this.children) this.doc._forget(c);
    this.children = [];
    // Разбираем только открывающие теги: для app.js этого хватает.
    const stack = [this];
    const re = /<(\/?)([a-z0-9]+)([^>]*?)(\/?)>/gi;
    let m;
    while ((m = re.exec(html))) {
      const [, closing, tag, rawAttrs, selfClosing] = m;
      if (closing) { if (stack.length > 1) stack.pop(); continue; }
      const attrs = {};
      rawAttrs.replace(/([a-z-]+)(?:="([^"]*)")?/gi, (_, k, v) => { attrs[k] = v ?? ""; });
      const child = new El(this.doc, tag, attrs);
      child.parent = stack[stack.length - 1];
      child.parent.children.push(child);
      this.doc._register(child);
      if (!selfClosing && !/^(img|br|input|hr)$/i.test(tag)) stack.push(child);
    }
  }
  querySelectorAll() { return []; }
  matches(selector) {
    return selector.split(",").map((s) => s.trim()).some((s) => {
      if (s.startsWith(".")) return this.classes.has(s.slice(1));
      if (s.startsWith("#")) return this.id === s.slice(1);
      return this.tagName === s.toUpperCase();
    });
  }
  closest(selector) {
    for (let el = this; el; el = el.parent) if (el.matches(selector)) return el;
    return null;
  }
  contains(other) {
    for (let el = other; el; el = el.parent) if (el === this) return true;
    return false;
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(event) {
    event.target ||= this;
    for (let el = this; el; el = el.parent) {
      for (const fn of el.listeners[event.type] || []) fn.call(el, event);
      if (event.type === "click" && el.onclick) el.onclick(event);
      if (event.bubbles === false || event.type === "pointerleave") break;
    }
  }
  focus() { this.doc.activeElement = this; }
  click() { this.dispatchEvent({ type: "click", detail: 1, preventDefault() {} }); }
  append() {}
  remove() {}
}

// Строим документ из настоящего index.html: id, классы и вложенность — как на странице.
function createDocument() {
  const doc = {
    byId: new Map(),
    listeners: {},
    activeElement: null,
    _register(el) { if (el.id) doc.byId.set(el.id, el); },
    _forget(el) { if (el.id && doc.byId.get(el.id) === el) doc.byId.delete(el.id); el.children.forEach((c) => doc._forget(c)); },
    getElementById: (id) => doc.byId.get(id) || null,
    createElement: (tag) => new El(doc, tag),
    addEventListener(type, fn) { (doc.listeners[type] ||= []).push(fn); },
    dispatchEvent(event) { for (const fn of doc.listeners[event.type] || []) fn(event); },
    contains: (el) => !!el && doc.byId.get(el.id) === el,
  };
  doc.body = new El(doc, "body");
  const html = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
  doc.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("<script"));
  doc.activeElement = doc.body;
  return doc;
}

function loadApp() {
  const document = createDocument();
  let now = 1_000_000, nextId = 1;
  const timers = new Map();
  const urls = { created: 0, revoked: 0, live: new Set() };
  class FakeDate extends Date {}
  FakeDate.now = () => now;
  const sandbox = {
    document,
    Date: FakeDate,
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { at: now + (ms || 0), fn }); return id; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: () => 0,
    performance: { now: () => now },
    navigator: {},
    File: class { constructor(parts, name) { this.name = name; } },
    URL: {
      createObjectURL: () => { urls.created++; const u = `blob:${urls.created}`; urls.live.add(u); return u; },
      revokeObjectURL: (u) => { urls.revoked++; urls.live.delete(u); },
    },
    ShareCard: { draw: () => ({ toBlob: (cb) => cb({ size: 1 }) }) },
    console,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.window.matchMedia = () => ({ matches: false });
  vm.createContext(sandbox);
  for (const f of ["vypiska.js", "wrapped.js", "demo.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(DOCS, f), "utf8"), sandbox, { filename: f });
  }

  const $ = (id) => document.getElementById(id);
  // Ручные часы: срабатывают все таймеры, чей срок подошёл.
  const tick = (ms) => {
    const until = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = until;
  };
  const fire = (el, type, extra = {}) => el.dispatchEvent({ type, preventDefault() {}, ...extra });
  const eyebrow = () => /slide__eyebrow[^>]*>([^<]*)</.exec($("slide").innerHTML)?.[1];
  const flush = () => new Promise((r) => setImmediate(r));
  return { document, $, tick, fire, eyebrow, urls, flush, sandbox };
}

module.exports = { loadApp };
