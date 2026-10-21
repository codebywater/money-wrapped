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
  assert.throws(() => W.parseStatement("a;b\n1;2\n"), /Не нашёл колонку/);
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

// ---------- выписки разных банков ----------

const VTB = "Начало периода;2026-01-01\nКонец периода;2026-03-31\n\n" +
  "Номер карты/счета/договора;Дата операции;Дата обработки;Сумма операции;Валюта операции;Сумма пересчитанная в валюту счета;Валюта счета;Основание;Статус\n" +
  "'220024******1234;2026-02-06 00:00:00;2026-02-08;-45,00;EUR;-4515,00;RUR;Карта *1234 BOOKING.COM AMSTERDAM;Исполнено\n" +
  "'220024******1234;2026-02-08 00:00:00;2026-02-09;-1600,00;RUR;-1600,00;RUR;Карта *1234 PYATEROCHKA 4512 MOSCOW;Исполнено\n";

test("сумма в рублях, а не в валюте покупки: Т-Банк и ВТБ; описание ВТБ из «Основание»", () => {
  const tb = '"Дата операции";"Дата платежа";"Статус";"Сумма операции";"Валюта операции";"Сумма платежа";"Валюта платежа";"Категория";"Описание";"Округление на инвесткопилку";"Сумма операции с округлением"\n' +
    '"21.03.2026 19:45:31";"22.03.2026";"OK";"-12,99";"USD";"-1250,30";"RUB";"Сервис";"ANTHROPIC";"0,00";"12,99"\n';
  assert.deepEqual(W.parseStatement(tb).map((o) => [o.amount, o.description]), [[-1250.3, "ANTHROPIC"]]);
  const ops = W.parseStatement(VTB);
  assert.deepEqual(ops.map((o) => o.amount), [-4515, -1600]);
  assert.equal(ops[1].description, "Карта *1234 PYATEROCHKA 4512 MOSCOW");
  const r = W.analyze(VTB);
  assert.equal(r.totalSpent, 6115);
  assert.ok(r.categories.some((c) => c.id === "groceries"));
  assert.ok(r.favPlace);
});

test("время 00:00 — это «без времени», а не ночная покупка", () => {
  assert.equal(W.analyze(VTB).night, null);
  const r = W.analyze("Дата операции;Сумма;Описание\n01.02.2026 00:00:00;-100;COFIX\n02.02.2026 00:30;-200;COFIX\n03.02.2026 12:00;-300;COFIX\n");
  assert.deepEqual(r.night, { count: 1, sum: 200 });
});

test("Альфа-Банк: дата с двузначным годом и описание без RUR/MCC", () => {
  const alfa = "Тип счёта;Номер счета;Валюта;Дата операции;Референс проводки;Описание операции;Приход;Расход;\n" +
    "Текущий счёт;40817810000000000001;RUR;15.01.26;C011501260001;Зарплата;180000;0;\n" +
    "Текущий счёт;40817810000000000001;RUR;20.01.26;CRD_1Z3D2L;644300++++++1234    1234\\RUS\\MOSCOW\\YANDEX.TAXI   20.01.26 19.01.26 450.00  RUR MCC4121;0;450;\n";
  const ops = W.parseStatement(alfa);
  assert.deepEqual(ops.map((o) => [o.date.y, o.date.m, o.date.d, o.amount]), [[2026, 1, 15, 180000], [2026, 1, 20, -450]]);
  assert.equal(W.merchantName(ops[1].description), "Yandex.taxi");
  assert.equal(W.categorize(ops[1]), "taxi");
});

test("колонки Дебет/Кредит: списание — минус, зачисление — плюс, номера счетов не суммы", () => {
  const expected = [[5000, "Зарплата"], [-4500, "PYATEROCHKA"]];
  const pick = (csv) => W.parseStatement(csv).map((o) => [o.amount, o.description]);
  assert.deepEqual(pick("Дата проводки;Сумма по дебету;Сумма по кредиту;Назначение платежа\n20.01.2026;;5000,00;Зарплата\n25.01.2026;4500,00;;PYATEROCHKA\n"), expected);
  assert.deepEqual(pick("Дата;Дебет;Кредит;Назначение платежа\n20.01.2026;;5000,00;Зарплата\n25.01.2026;4500,00;;PYATEROCHKA\n"), expected);
  assert.deepEqual(pick("Дата проводки;Счет Дебет;Счет Кредит;Сумма по дебету;Сумма по кредиту;Назначение платежа\n" +
    "20.01.2026;40702810400000012345;40817810938000000001;;5000,00;Зарплата\n25.01.2026;40817810938000000001;40702810100000099999;4500,00;;PYATEROCHKA\n"), expected);
});

test("ячейка в кавычках с переносом строки (Excel, Alt+Enter) не рвёт строку", () => {
  const pick = (csv) => W.parseStatement(csv).map((o) => [o.amount, o.description]);
  const expected = [[-500, "Оплата PYATEROCHKA"], [-700, "VKUSVILL"]];
  assert.deepEqual(pick('Дата операции;Описание;Сумма операции\n15.01.2026;"Оплата\nPYATEROCHKA";-500,00\n16.01.2026;VKUSVILL;-700,00\n'), expected);
  assert.deepEqual(pick('Дата операции;Сумма операции;Описание\r\n15.01.2026;-500,00;"Оплата\r\nPYATEROCHKA"\r\n16.01.2026;-700,00;VKUSVILL\r\n'), expected);
  // Непарная кавычка посреди ячейки не склеивает остаток файла.
  assert.deepEqual(pick('Дата;Сумма;Описание\n15.01.2026;-500;ООО "Ромашка\n16.01.2026;-700;VKUSVILL\n').map((o) => o[0]), [-500, -700]);
  // Над шапкой — строка без разделителей: разделитель определяется по шапке.
  assert.deepEqual(pick("Выписка по счету 40817810000000000001, Иванов И.И.\nДата операции;Сумма операции;Описание\n15.01.2026;-500,00;PYATEROCHKA\n"), [[-500, "PYATEROCHKA"]]);
});

test("кодировка: одна битая буква в UTF-8 не превращает файл в Windows-1251", () => {
  const good = Buffer.from(demo, "utf8");
  const bad = Buffer.concat([good, Buffer.from("01.03.2026 10:00;-100,00;Кафе \xc3;OK\n", "latin1")]);
  assert.equal(W.decode(good), demo);
  assert.ok(W.decode(bad).startsWith("Дата операции;"));
  assert.equal(W.analyze(W.decode(bad)).totalSpent, W.analyze(demo).totalSpent + 100);
  // Настоящая Windows-1251 по-прежнему читается.
  const cp1251 = Buffer.from([..."Дата;Сумма;Описание\n15.01.2026;-500;Пятёрочка\n"].map((c) => {
    const k = c.charCodeAt(0);
    return k < 128 ? k : k === 0x451 ? 0xb8 : k - 0x350;
  }));
  assert.equal(W.decode(cp1251), "Дата;Сумма;Описание\n15.01.2026;-500;Пятёрочка\n");
});

test("категории: короткие бренды — только целым словом, коды Яндекса, исключения", () => {
  const cat = (description, bankCategory = "") => W.categorize({ description, bankCategory });
  assert.equal(cat("BEGET HOSTING"), "other");
  assert.equal(cat("Оплата хостинга REG.RU"), "other");
  assert.equal(cat("OSTIN MEGA"), "clothes");
  assert.equal(cat("LUKOIL AZS MAGNITOGORSK"), "transport");
  assert.equal(cat("MAGNIT MM KOSTROMA"), "groceries");
  assert.equal(cat("Магнит Аптека", "Аптеки"), "health");
  assert.equal(cat("МТС Банк", "Переводы"), "people");
  assert.equal(cat("MTS MOBILE"), "bills");
  assert.equal(cat("Интернет-магазин Лэтуаль"), "beauty");
  assert.equal(cat("Домашний интернет"), "bills");
  assert.equal(cat("SURFSHARK VPN"), "other");
  assert.equal(cat("SURF COFFEE"), "coffee");
  assert.equal(cat("Кинотеатр Победа", "Кино"), "fun");
  assert.equal(cat("POBEDA AIRLINES"), "transport");
  assert.equal(cat("YANDEX*5815*PLUS"), "subscriptions");
  assert.equal(cat("YANDEX*5814*EDA"), "delivery");
  assert.equal(cat("Вкусно — и точка", "Фастфуд"), "cafe");
});

test("переводы между своими счетами и в копилку не считаются тратами", () => {
  const cat = (description) => W.categorize({ description, bankCategory: "Переводы" });
  assert.equal(cat("Перевод между счетами"), "transfers");
  assert.equal(cat("Пополнение копилки"), "transfers");
  assert.equal(cat("Перевод на накопительный счет"), "transfers");
  assert.equal(cat("Внутренний перевод на договор 0123456789"), "people", "может быть и чужой договор");
  const own = "Дата операции;Сумма операции;Описание;Категория\n" + ["01", "02", "03"].map((m) =>
    `05.${m}.2026 10:00:00;-50000,00;Перевод между счетами;Переводы\n06.${m}.2026 10:00:00;-1500,00;Пятёрочка;Супермаркеты`).join("\n") + "\n";
  assert.equal(W.analyze(own).totalSpent, 4500);
});

test("название места: банковские приставки не превращаются в «место»", () => {
  assert.equal(W.merchantName("Оплата товаров и услуг. COFIX 77 MOSCOW RUS"), "Cofix");
  assert.equal(W.merchantName("Операция по карте ****1234 YANDEX*5814*EDA"), "Yandex Eda");
  const r = W.analyze("Дата операции;Сумма операции;Описание\n" + [
    "01.03.2026;-600,00;Оплата товаров и услуг. PYATEROCHKA 4512 MOSCOW RUS",
    "02.03.2026;-300,00;Оплата товаров и услуг. COFIX 77 MOSCOW RUS",
    "03.03.2026;-2500,00;Оплата товаров и услуг. DODO PIZZA MOSCOW RUS",
  ].join("\n") + "\n");
  assert.deepEqual(r.topPlaces.map((p) => p.name).sort(), ["Cofix", "Dodo Pizza", "Pyaterochka"]);
});

test("регрессия: приставка «Оплата в» и «POS» не съедают начало названия, дефис — часть слова", () => {
  assert.equal(W.merchantName("Оплата ВкусВилл"), "ВкусВилл");
  assert.equal(W.merchantName("POSUDA CENTER"), "Posuda Center");
  assert.equal(W.merchantName("Пицца по-итальянски"), "Пицца по-итальянски");
});

test("регрессия: колонка остатка не принимается за сумму, незакрытая кавычка не ломает файл", () => {
  const bal = W.parseStatement("Дата операции;Остаток в валюте счета;Сумма в валюте счета;Описание\n01.03.2026;10 000,00;-500,00;Кофе\n");
  assert.deepEqual(bal.map((o) => o.amount), [-500]);
  const broken = W.parseStatement('Дата операции;Сумма;Описание\n01.03.2026;-100;"Кофе\n02.03.2026;-200;Чай\n03.03.2026;-300;Сок\n');
  assert.ok(broken.length >= 2);
});
