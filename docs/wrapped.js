/*
 * money-wrapped — ядро: разбор выписки и итоги года.
 * Работает в браузере и в Node (для тестов). Ничего никуда не отправляет.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Wrapped = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- разбор CSV ----------

  const HEADERS = {
    date: ["дата операции", "дата транзакции", "дата проводки", "дата", "date"],
    amount: ["сумма операции", "сумма в валюте счета", "сумма в валюте счёта", "сумма", "amount"],
    credit: ["приход", "зачисление", "поступление", "credit"],
    debit: ["расход", "списание", "debit"],
    description: ["описание", "назначение платежа", "назначение", "наименование", "merchant", "контрагент", "получатель", "description"],
    category: ["категория", "category"],
    status: ["статус", "status"],
  };
  const ORDER = ["date", "credit", "debit", "amount", "description", "category", "status"];
  const FAILED = /отклон|failed|declined|отмен|cancel/i;

  function splitCsvLine(line, delim) {
    const out = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delim) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }

  function findColumns(header) {
    const lower = header.map((h) => h.toLowerCase());
    const cols = {}, used = new Set();
    for (const key of ORDER) {
      for (const kw of HEADERS[key]) {
        const idx = lower.findIndex((h, i) => !used.has(i) && h.includes(kw));
        if (idx !== -1) { cols[key] = idx; used.add(idx); break; }
      }
    }
    return cols;
  }

  function parseAmount(s) {
    if (s == null) return null;
    const clean = String(s).replace(/[\s ₽]|руб\.?|RUB/gi, "").replace(",", ".");
    if (clean === "" || clean === "-") return null;
    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
  }

  function parseDate(s) {
    let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
    if (m) return { y: +m[3], m: +m[2], d: +m[1], h: m[4] != null ? +m[4] : null };
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
    if (m) return { y: +m[1], m: +m[2], d: +m[3], h: m[4] != null ? +m[4] : null };
    return null;
  }

  function parseStatement(text) {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error("В файле нет строк с операциями.");
    const first = lines[0];
    const delim = [";", ",", "\t"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    let headerIdx = -1, cols = {};
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      cols = findColumns(splitCsvLine(lines[i], delim));
      if (cols.date !== undefined && (cols.amount !== undefined || cols.debit !== undefined)) { headerIdx = i; break; }
    }
    if (headerIdx === -1) throw new Error("Не нашёл колонки с датой и суммой. Нужна шапка вида «Дата операции;Сумма операции;Описание».");

    const ops = [];
    for (const line of lines.slice(headerIdx + 1)) {
      const row = splitCsvLine(line, delim);
      const date = parseDate(row[cols.date] || "");
      if (!date) continue;
      if (cols.status !== undefined && FAILED.test(row[cols.status] || "")) continue;
      let amount = null;
      if (cols.debit !== undefined || cols.credit !== undefined) {
        const debit = cols.debit !== undefined ? parseAmount(row[cols.debit]) : null;
        const credit = cols.credit !== undefined ? parseAmount(row[cols.credit]) : null;
        if (debit) amount = -Math.abs(debit);
        else if (credit) amount = Math.abs(credit);
      }
      if (amount === null && cols.amount !== undefined) amount = parseAmount(row[cols.amount]);
      if (!amount) continue;
      ops.push({
        date, amount,
        description: cols.description !== undefined ? row[cols.description] : "",
        bankCategory: cols.category !== undefined ? row[cols.category] : "",
      });
    }
    if (!ops.length) throw new Error("Не нашёл ни одной операции с датой и суммой.");
    return ops;
  }

  // ---------- категории и места ----------

  // Порядок важен: первая подходящая категория побеждает.
  const CATEGORIES = [
    { id: "transfers", name: "Переводы себе", emoji: "🔁", re: /между (своими|собственными) счетами|на свой счет|на свою карту|пополнение вклада|на накопительный/i, skip: true },
    { id: "delivery", name: "Доставка еды", emoji: "🛵", re: /яндекс[ .]?еда|yandex[ .]?eda|delivery club|самокат|samokat|кухня на районе|vkusvill.*достав|сбермаркет|kuper|купер|eda\.yandex/i },
    { id: "coffee", name: "Кофе", emoji: "☕", re: /кофе|coffee|cofix|шоколадниц|shokoladnits|starbucks|surf|даблби|double ?b|skuratov|кофемания|one price/i },
    { id: "cafe", name: "Кафе и рестораны", emoji: "🍝", re: /кафе|ресторан|restoran|cafe| бар |bar\b|пицц|pizza|додо|dodo|kfc|rostic|ростикс|бургер|burger|вкусно.{0,3}точка|теремок|шаурм|шаверм|суши|sushi/i },
    { id: "groceries", name: "Продукты", emoji: "🛒", re: /пят[её]рочк|pyaterochka|перекр[её]ст|perekrestok|магнит|magnit|вкусвилл|vkusvill|ашан|auchan|лента|lenta|дикси|dixy|азбука вкуса|metro cash|окей|o'key|spar|супермаркет|продукт/i },
    { id: "marketplaces", name: "Маркетплейсы", emoji: "📦", re: /ozon|озон|wildberries|вайлдберриз|\bwb\b|яндекс[ .]?маркет|market\.yandex|aliexpress|алиэкспресс|lamoda|ламода|мегамаркет/i },
    { id: "tech", name: "Техника", emoji: "📱", re: /re:? ?store|apple store|м\.?видео|mvideo|эльдорадо|eldorado|\bdns\b|днс|ситилинк|citilink|samsung|xiaomi/i },
    { id: "taxi", name: "Такси", emoji: "🚕", re: /такси|taxi|uber|yandex.?go|ситимобил|maxim|максим|везет/i },
    { id: "transport", name: "Транспорт", emoji: "🚇", re: /метро|metro\b|тройка|troika|мцд|ржд|rzd|аэрофлот|aeroflot|s7|победа|pobeda|автобус|транспорт|азс|лукойл|газпромнефть|роснефть|самокат.*аренд|whoosh|юрент/i },
    { id: "subscriptions", name: "Подписки", emoji: "📺", re: /кинопоиск|kinopoisk|яндекс[ .]?плюс|yandex[ .]?plus|ivi|okko|окко|start\.ru|more\.tv|apple\.com|itunes|google[ .]?play|spotify|youtube|netflix|vk музыка|boom|звук|zvuk|литрес|bookmate|chatgpt|openai|claude|anthropic|telegram premium/i },
    { id: "health", name: "Здоровье", emoji: "💊", re: /аптек|apteka|здравсити|горздрав|ригла|клиник|стоматолог|медси|инвитро|invitro|гемотест|doctor/i },
    { id: "fun", name: "Развлечения", emoji: "🎬", re: /кино|kino|cinema|театр|teatr|концерт|билет|ticket|steam|playstation|xbox|nintendo|боулинг|квест|музей|афиша|afisha/i },
    { id: "clothes", name: "Одежда", emoji: "👟", re: /zara|uniqlo|h&m|befree|gloria jeans|глория|спортмастер|sportmaster|nike|adidas|love republic|gate31|zolla|ostin|остин|обувь/i },
    { id: "beauty", name: "Красота", emoji: "💅", re: /золотое яблоко|zolotoe yabloko|летуаль|l'etoile|letual|рив гош|барбер|barber|салон|маникюр|beauty/i },
    { id: "bills", name: "Связь и ЖКХ", emoji: "🏠", re: /мтс|mts|билайн|beeline|мегафон|megafon|теле2|tele2|t2|ростелеком|жку|жкх|квартплат|мосэнерго|интернет|домру|dom\.ru/i },
    { id: "people", name: "Переводы людям", emoji: "💸", re: /перевод|сбп|sbp|по номеру телефона/i },
  ];
  const OTHER = { id: "other", name: "Другое", emoji: "🧾" };
  const BY_ID = Object.fromEntries([...CATEGORIES, OTHER].map((c) => [c.id, c]));

  function categorize(op) {
    const text = `${op.description} ${op.bankCategory}`;
    for (const c of CATEGORIES) if (c.re.test(text)) return c.id;
    return OTHER.id;
  }

  // \b в JavaScript не понимает кириллицу, поэтому граница слова задаётся явно.
  const NOISE = /(?<!\p{L})(оплата|покупка|списание|платеж|платёж|регулярный|retail|purchase|payment|pos|card|карта|карты|rus|ru|msk|moscow|москва|moskva|spb|g|г|ооо|ип|llc)(?!\p{L})/giu;

  // «PYATEROCHKA 1234 MOSCOW RUS» → «Pyaterochka».
  function merchantName(description) {
    let s = description.replace(/\*+/g, " ").replace(/\d+/g, " ").replace(/[^\p{L}\s.&'-]/gu, " ");
    s = s.replace(NOISE, " ");
    const words = s.split(/\s+/).filter((w) => w.length > 1).slice(0, 2);
    if (!words.length) return "";
    return words.map((w) => (w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w)).join(" ");
  }

  // ---------- итоги ----------

  const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"];
  const SHAWARMA = 350;   // цена шавермы для пересчётов, ₽
  const COFFEE = 250;     // цена капучино, ₽

  const PERSONAS = {
    delivery: { title: "Король доставки", text: "Курьеры знают вас по имени, а холодильник — только по слухам." },
    coffee: { title: "Кофейный эксперт", text: "Вы не пьёте кофе. Вы им живёте." },
    cafe: { title: "Гастротурист", text: "Город для вас — это меню, и вы его почти дочитали." },
    groceries: { title: "Хозяин холодильника", text: "Готовите дома и знаете цену гречке. Уважаем." },
    marketplaces: { title: "Повелитель пунктов выдачи", text: "Сотрудники ПВЗ здороваются с вами первыми." },
    taxi: { title: "Пассажир бизнес-класса", text: "Метро? Не слышали. Такси уже подано." },
    transport: { title: "Вечный путешественник", text: "Вы всегда где-то между пунктом А и пунктом Б." },
    subscriptions: { title: "Коллекционер подписок", text: "У вас есть подписка на всё. Даже на то, о чём вы забыли." },
    health: { title: "Заботливый о себе", text: "Здоровье — лучшая инвестиция, и вы это знаете." },
    fun: { title: "Душа компании", text: "Кино, концерты, квесты — скучать вам некогда." },
    tech: { title: "Гаджетоман", text: "Новый девайс — лучший способ отметить вторник." },
    clothes: { title: "Икона стиля", text: "Гардероб полон, а надеть всё ещё нечего." },
    beauty: { title: "Сияющий", text: "Красота требует жертв. И бюджета." },
    bills: { title: "Ответственный взрослый", text: "Больше всего вы платите за свет, связь и крышу над головой." },
    people: { title: "Щедрая душа", text: "Друзья, родные, «скинемся на подарок» — вы всегда в деле." },
    other: { title: "Человек-загадка", text: "Ваши траты не поддаются классификации. Как и вы." },
  };

  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  const round = (n) => Math.round(n);

  function weekday(d) { return new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay(); }

  function topBy(map, fn) {
    let best = null;
    for (const [k, v] of map) if (!best || fn(v) > fn(best[1])) best = [k, v];
    return best;
  }

  // Подписка: одно и то же место, 3+ разных месяца, суммы отличаются не больше чем на 15%.
  function findSubscriptions(spends) {
    const byMerchant = new Map();
    for (const o of spends) {
      if (!o.merchant) continue;
      if (!byMerchant.has(o.merchant)) byMerchant.set(o.merchant, []);
      byMerchant.get(o.merchant).push(o);
    }
    const subs = [];
    for (const [name, list] of byMerchant) {
      const months = new Set(list.map((o) => `${o.date.y}-${o.date.m}`));
      if (months.size < 3 || list.length > months.size * 1.5) continue;
      const amounts = list.map((o) => o.spent).sort((a, b) => a - b);
      const median = amounts[Math.floor(amounts.length / 2)];
      if (amounts.every((a) => Math.abs(a - median) <= median * 0.15)) {
        subs.push({ name, monthly: round(median), total: round(amounts.reduce((a, b) => a + b, 0)), months: months.size });
      }
    }
    return subs.sort((a, b) => b.total - a.total);
  }

  function analyze(text, { year } = {}) {
    const all = parseStatement(text);
    if (!year) {
      const counts = {};
      all.forEach((o) => { counts[o.date.y] = (counts[o.date.y] || 0) + 1; });
      year = +Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    }
    const ops = all.filter((o) => o.date.y === year).map((o) => ({ ...o, category: categorize(o) }));
    const spends = ops.filter((o) => o.amount < 0 && !BY_ID[o.category].skip)
      .map((o) => ({ ...o, spent: -o.amount, merchant: merchantName(o.description) }));
    const income = ops.filter((o) => o.amount > 0 && !BY_ID[o.category].skip);
    if (!spends.length) throw new Error(`За ${year} год в выписке нет трат.`);

    const totalSpent = round(spends.reduce((a, o) => a + o.spent, 0));
    const totalIncome = round(income.reduce((a, o) => a + o.amount, 0));

    // Категории.
    const cats = new Map();
    for (const o of spends) {
      const c = cats.get(o.category) || { sum: 0, count: 0 };
      c.sum += o.spent; c.count += 1;
      cats.set(o.category, c);
    }
    const categories = [...cats].map(([id, v]) => ({ id, name: BY_ID[id].name, emoji: BY_ID[id].emoji, sum: round(v.sum), count: v.count,
      share: v.sum / totalSpent })).sort((a, b) => b.sum - a.sum);

    // Места.
    const places = new Map();
    for (const o of spends) {
      if (!o.merchant || o.category === "people") continue;
      const p = places.get(o.merchant) || { sum: 0, count: 0, category: o.category };
      p.sum += o.spent; p.count += 1;
      places.set(o.merchant, p);
    }
    const favPlace = topBy(places, (p) => p.count);
    const topPlaces = [...places].map(([name, p]) => ({ name, sum: round(p.sum), count: p.count, emoji: BY_ID[p.category].emoji }))
      .sort((a, b) => b.count - a.count || b.sum - a.sum).slice(0, 5);

    // Дни и месяцы.
    const days = new Map();
    for (const o of spends) days.set(keyOf(o.date), { date: o.date, sum: (days.get(keyOf(o.date))?.sum || 0) + o.spent });
    const [, topDay] = topBy(days, (d) => d.sum);
    const monthly = Array(12).fill(0);
    spends.forEach((o) => { monthly[o.date.m - 1] += o.spent; });
    const topMonth = monthly.indexOf(Math.max(...monthly));
    const weekdays = Array(7).fill(0);
    spends.forEach((o) => { weekdays[weekday(o.date)] += o.spent; });
    const topWeekday = weekdays.indexOf(Math.max(...weekdays));
    const biggest = spends.reduce((a, o) => (o.spent > a.spent ? o : a));
    // Период — с 1 января до последней траты: выписка может быть за неполный год.
    const lastDay = Math.max(...spends.map((o) => Date.UTC(o.date.y, o.date.m - 1, o.date.d)));
    const daysInPeriod = Math.round((lastDay - Date.UTC(year, 0, 1)) / 86400000) + 1;
    const noSpendDays = Math.max(0, daysInPeriod - days.size);

    // Ночные покупки, если в выписке есть время.
    const withTime = spends.filter((o) => o.date.h != null);
    const night = withTime.filter((o) => o.date.h >= 23 || o.date.h < 5);

    const delivery = cats.get("delivery")?.sum || 0;
    const coffee = cats.get("coffee") || { sum: 0, count: 0 };
    // Коммуналка и связь регулярны, но это не подписки.
    const subscriptions = findSubscriptions(spends.filter((o) => !["groceries", "people", "bills", "transport"].includes(o.category)));

    // Продукты и коммуналка есть у всех, поэтому «тип» ищем среди остального.
    const top = categories.find((c) => !["groceries", "people", "bills", "other"].includes(c.id)) || categories[0];
    const persona = { ...PERSONAS[top.id], category: top.name, emoji: top.emoji };

    return {
      year, totalSpent, totalIncome, saved: totalIncome - totalSpent,
      purchases: spends.length, perDay: round(totalSpent / daysInPeriod),
      categories, topPlaces,
      favPlace: favPlace ? { name: favPlace[0], count: favPlace[1].count, sum: round(favPlace[1].sum), emoji: BY_ID[favPlace[1].category].emoji } : null,
      topDay: { date: topDay.date, label: `${topDay.date.d} ${MONTHS_GEN[topDay.date.m - 1]}`, sum: round(topDay.sum) },
      biggest: { merchant: biggest.merchant || biggest.description, sum: round(biggest.spent), label: `${biggest.date.d} ${MONTHS_GEN[biggest.date.m - 1]}` },
      monthly: monthly.map(round), topMonth: { index: topMonth, name: MONTHS[topMonth], sum: round(monthly[topMonth]) },
      topWeekday: WEEKDAYS[topWeekday], noSpendDays,
      night: withTime.length ? { count: night.length, sum: round(night.reduce((a, o) => a + o.spent, 0)) } : null,
      delivery: { sum: round(delivery), shawarmas: Math.floor(delivery / SHAWARMA) },
      coffee: { sum: round(coffee.sum), count: coffee.count, cups: Math.round(coffee.sum / COFFEE) },
      subscriptions: { list: subscriptions, perYear: subscriptions.reduce((a, s) => a + s.monthly * 12, 0) },
      persona,
    };
  }

  function fmt(n) { return Math.round(n).toLocaleString("ru-RU").replace(/ /g, " "); }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  return { parseStatement, categorize, merchantName, findSubscriptions, analyze, fmt, plural, CATEGORIES, SHAWARMA, COFFEE };
});
