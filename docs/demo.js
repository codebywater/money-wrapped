/*
 * Демо-выписка за 2026 год: вымышленный человек, детерминированный генератор.
 * Нужна для кнопки «Посмотреть на примере» и для тестов.
 */
(function (root) {
  "use strict";
  let seed = 20260101;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const between = (a, b) => Math.round(a + rand() * (b - a));
  const pad = (n) => String(n).padStart(2, "0");

  // [описание, мин, макс, вероятность в день]
  const DAILY = [
    ["PYATEROCHKA 4512 MOSCOW RUS", 300, 1800, 0.35],
    ["VKUSVILL 112 MOSCOW", 250, 1500, 0.2],
    ["COFIX 77 MOSCOW", 180, 320, 0.45],
    ["SHOKOLADNITSA MOSCOW", 350, 900, 0.06],
    ["YANDEX.EDA", 700, 2400, 0.17],
    ["SAMOKAT", 600, 2100, 0.1],
    ["YANDEX.GO TAXI", 350, 1400, 0.16],
    ["METRO MOSKVA TROIKA", 70, 70, 0.4],
    ["OZON.RU", 400, 6500, 0.09],
    ["WILDBERRIES", 500, 4500, 0.07],
    ["DODO PIZZA MOSCOW", 900, 2200, 0.03],
    ["APTEKA RIGLA", 300, 2500, 0.03],
    ["KINO KARO 11", 450, 1200, 0.02],
    ["ZOLOTOE YABLOKO", 1200, 5500, 0.01],
    ["Перевод по СБП Алексей К.", 500, 3000, 0.04],
  ];
  const MONTHLY = [
    [3, "KINOPOISK", 499], [5, "YANDEX PLUS", 399], [9, "MTS MOBILE", 650], [12, "SPOTIFY", 169],
    [15, "ЖКУ Москва квартплата", 7200], [20, "OPENAI CHATGPT", 2100],
  ];

  const rows = ["Дата операции;Сумма операции;Описание;Статус"];
  const add = (y, m, d, h, amount, desc) =>
    rows.push(`${pad(d)}.${pad(m)}.${y} ${pad(h)}:${pad(between(0, 59))};${amount.toFixed(2).replace(".", ",")};${desc};OK`);

  for (let m = 1; m <= 12; m++) {
    const days = new Date(Date.UTC(2026, m, 0)).getUTCDate();
    add(2026, m, 5, 10, 120000, "Зарплата ООО Ромашка");
    add(2026, m, 20, 10, 60000, "Аванс ООО Ромашка");
    for (const [d, desc, sum] of MONTHLY) add(2026, m, d, 9, -sum, desc);
    if (m % 2 === 0) add(2026, m, 6, 12, -30000, "Перевод между своими счетами");
    for (let d = 1; d <= days; d++) {
      for (const [desc, a, b, p] of DAILY) {
        // В выходные доставки и кафе чаще.
        const dow = new Date(Date.UTC(2026, m - 1, d)).getUTCDay();
        const k = (dow === 0 || dow === 6) && /EDA|SAMOKAT|DODO|KINO/.test(desc) ? 1.8 : 1;
        if (rand() < p * k) add(2026, m, d, desc.includes("EDA") && rand() < 0.3 ? 23 : between(8, 21), -between(a, b), desc);
      }
    }
  }
  // Один большой день: подарки к 14 февраля и новый телефон.
  add(2026, 2, 14, 19, -18500, "RESTORAN WHITE RABBIT");
  add(2026, 11, 28, 15, -89990, "RE:STORE APPLE");
  add(2026, 3, 2, 11, -2400, "Оплата отклонена OZON.RU");
  rows.push(rows.pop().replace(";OK", ";Отклонена"));

  const csv = rows.join("\n") + "\n";
  if (typeof module === "object" && module.exports) module.exports = csv;
  else root.WRAPPED_DEMO = csv;
})(typeof self !== "undefined" ? self : this);
