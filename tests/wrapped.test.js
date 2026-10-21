const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const W = require("../docs/wrapped.js");
const demo = require("../docs/demo.js");

test("пример в examples совпадает с демо на странице", () => {
  assert.equal(fs.readFileSync(path.join(__dirname, "../examples/vypiska-primer.csv"), "utf8"), demo);
});

test("разбор: время, отклонённые операции, колонки Приход/Расход", () => {
  const ops = W.parseStatement("Дата операции;Сумма;Описание;Статус\n01.02.2026 23:15;-500,50;COFIX;OK\n02.02.2026;-100;OZON;Отклонена\n");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].date.h, 23);
  assert.equal(ops[0].amount, -500.5);
  const ops2 = W.parseStatement("Дата,Расход,Приход,Описание\n2026-03-01,\"1 200,00\",,Пятёрочка\n2026-03-02,,5000,Зарплата\n");
  assert.deepEqual(ops2.map((o) => o.amount), [-1200, 5000]);
});

test("понятная ошибка, если колонок нет", () => {
  assert.throws(() => W.parseStatement("a;b\n1;2\n"), /Не нашёл колонки/);
});

test("категории: доставка, кофе, метро, маркетплейсы, переводы себе", () => {
  const cat = (description) => W.categorize({ description, bankCategory: "" });
  assert.equal(cat("YANDEX.EDA"), "delivery");
  assert.equal(cat("COFIX 77 MOSCOW"), "coffee");
  assert.equal(cat("METRO MOSKVA TROIKA"), "transport");
  assert.equal(cat("WILDBERRIES"), "marketplaces");
  assert.equal(cat("Перевод между своими счетами"), "transfers");
  assert.equal(cat("RE:STORE APPLE"), "tech");
  assert.equal(cat("Непонятный магазин"), "other");
});

test("название места без мусора", () => {
  assert.equal(W.merchantName("PYATEROCHKA 4512 MOSCOW RUS"), "Pyaterochka");
  assert.equal(W.merchantName("Оплата COFIX 77 MOSCOW"), "Cofix");
  assert.equal(W.merchantName("12345 ***"), "");
});

test("подписки: регулярно и одна сумма — да, разные суммы — нет", () => {
  const op = (m, merchant, spent) => ({ date: { y: 2026, m, d: 5 }, merchant, spent });
  const subs = W.findSubscriptions([
    ...[1, 2, 3, 4].map((m) => op(m, "Kinopoisk", 499)),
    ...[1, 2, 3, 4].map((m) => op(m, "Shop", m * 1000)),
  ]);
  assert.deepEqual(subs.map((s) => s.name), ["Kinopoisk"]);
  assert.equal(subs[0].monthly, 499);
});

test("итоги на демо-выписке", () => {
  const r = W.analyze(demo);
  assert.equal(r.year, 2026);
  assert.ok(r.totalSpent > 500000 && r.totalSpent < 2000000);
  assert.equal(r.totalIncome, 12 * 180000);
  assert.equal(r.favPlace.name, "Cofix");
  assert.equal(r.biggest.sum, 89990);
  assert.equal(r.topDay.label, "28 ноября");
  assert.equal(r.topMonth.name, "ноябрь");
  assert.ok(!r.categories.some((c) => c.id === "transfers"), "переводы себе не считаются тратами");
  assert.deepEqual(r.subscriptions.list.map((s) => s.name).sort(), ["Kinopoisk", "Openai Chatgpt", "Spotify", "Yandex Plus"]);
  assert.ok(r.night.count > 0);
  assert.equal(r.delivery.shawarmas, Math.floor(r.delivery.sum / W.SHAWARMA));
  assert.ok(r.persona.title);
});

test("выписка за неполный год и без доходов", () => {
  const r = W.analyze("Дата;Сумма;Описание\n01.01.2026;-300;COFIX\n10.01.2026;-700;YANDEX.EDA\n");
  assert.equal(r.totalSpent, 1000);
  assert.equal(r.totalIncome, 0);
  assert.equal(r.perDay, 100);
  assert.equal(r.night, null);
});

test("склонения", () => {
  assert.deepEqual([1, 3, 5, 21, 112].map((n) => W.plural(n, "раз", "раза", "раз")), ["раз", "раза", "раз", "раз", "раз"]);
  assert.deepEqual([1, 2, 5].map((n) => W.plural(n, "шаверма", "шавермы", "шаверм")), ["шаверма", "шавермы", "шаверм"]);
});
