const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Контраст текста на слайдах по WCAG 2.x: 4.5:1 для обычного текста, 3:1 для крупного
// (от 24px или от 18.66px жирным). Цвета, градиенты и прозрачность берём прямо из index.html.
const css = fs.readFileSync(path.join(__dirname, "../docs/index.html"), "utf8");

const hex = (h) => {
  if (h.length === 4) h = "#" + [...h.slice(1)].map((c) => c + c).join("");
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function gradient(n) {
  const m = new RegExp(`--g-${n}: linear-gradient\\(\\d+deg, (#[0-9a-f]{6}) 0%, (#[0-9a-f]{6}) 100%\\)`, "i").exec(css);
  assert.ok(m, `нет градиента --g-${n}`);
  return [hex(m[1]), hex(m[2])];
}
function slideColor(n) {
  const m = new RegExp(`\\.slide--g${n} \\{[^}]*?color: (#[0-9a-f]{3}(?:[0-9a-f]{3})?)\\b`, "i").exec(css);
  return hex(m ? m[1] : /\.slide \{[^}]*?color: (#[0-9a-f]{3}(?:[0-9a-f]{3})?)\b/i.exec(css)[1]);
}
function opacity(selector) {
  const m = new RegExp(`${selector.replace(/[.]/g, "\\.")} \\{[^}]*?opacity: ([.\\d]+)`).exec(css);
  return m ? Number(m[1]) : 1;
}

// Роль текста → минимальный контраст.
const ROLES = [
  { name: "заголовок/цифра", sel: ".slide__big", min: 3 },
  { name: "подпись сверху", sel: ".slide__eyebrow", min: 4.5 },
  { name: "текст", sel: ".slide__text", min: 4.5 },
  { name: "примечание", sel: ".slide__note", min: 4.5 },
  { name: "место в списке", sel: ".list .rank", min: 4.5 },
  { name: "месяцы", sel: ".months-labels", min: 4.5 },
];

// Худший контраст по всей высоте градиента: текст может оказаться где угодно.
function worst(n, role) {
  const [a, b] = gradient(n), fg = slideColor(n), alpha = opacity(role.sel);
  let min = Infinity;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const bg = mix(a, b, t);
    min = Math.min(min, ratio(mix(bg, fg, alpha), bg));
  }
  return min;
}

for (const n of [1, 2, 3, 4, 5, 6]) {
  test(`контраст текста на слайдах g${n} — не ниже WCAG AA`, () => {
    for (const role of ROLES) {
      const r = worst(n, role);
      assert.ok(r >= role.min, `g${n}, ${role.name}: ${r.toFixed(2)}:1 < ${role.min}:1`);
    }
  });
}

module.exports = { worst, ROLES };
