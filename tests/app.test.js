const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./fake-dom.js");

// Открыть демо так, как это делает пользователь: фокус на кнопке, клик.
function openDemo(app) {
  app.$("demo").focus();
  app.fire(app.$("demo"), "click", { detail: 1 });
}

test("сторис: Enter и пробел на «Дальше»/«Назад» листают (клик без pointerdown)", () => {
  const app = loadApp();
  openDemo(app);
  assert.ok(app.document.activeElement === app.$("next"), "фокус на «Дальше»");
  assert.equal(app.eyebrow(), "Итоги 2026");
  app.fire(app.$("next"), "click", { detail: 0 });
  assert.equal(app.eyebrow(), "За 2026 год вы потратили");
  app.fire(app.$("prev"), "click", { detail: 0 });
  assert.equal(app.eyebrow(), "Итоги 2026");
});

test("сторис: короткое нажатие листает, долгое — только пауза", () => {
  const app = loadApp();
  openDemo(app);
  const press = (ms) => {
    app.fire(app.$("next"), "pointerdown");
    app.tick(ms);
    app.fire(app.$("next"), "pointerup");
    app.fire(app.$("next"), "click", { detail: 1 });
  };
  press(100);
  assert.equal(app.eyebrow(), "За 2026 год вы потратили");
  press(800);
  assert.equal(app.eyebrow(), "За 2026 год вы потратили", "долгое нажатие не листает");
});

test("сторис: после закрытия фокус возвращается на кнопку, которая их открыла", () => {
  const app = loadApp();
  openDemo(app);
  app.document.dispatchEvent({ type: "keydown", key: "Escape" });
  assert.equal(app.$("stories").hidden, true);
  assert.ok(app.document.activeElement === app.$("demo"), `фокус на #${app.document.activeElement.id}, а не на #demo`);
});

test("сторис: закрыли во время паузы — после повторного открытия полоска не стоит", () => {
  const app = loadApp();
  openDemo(app);
  app.fire(app.$("next"), "pointerdown");             // держим палец/кнопку мыши
  app.document.dispatchEvent({ type: "keydown", key: "Escape" });
  openDemo(app);                                       // pointerup до #story так и не дошёл
  assert.equal(app.$("story").classList.contains("is-paused"), false);
  app.tick(7100);
  assert.equal(app.eyebrow(), "За 2026 год вы потратили");
});

test("сторис: второе касание во время паузы не съедает оставшееся время", () => {
  const app = loadApp();
  openDemo(app);
  app.tick(3000);
  app.fire(app.$("next"), "pointerdown");              // первый палец
  app.tick(2500);
  app.fire(app.$("next"), "pointerdown");              // второй палец
  app.tick(500);
  app.fire(app.$("next"), "pointerup");
  app.tick(3500);                                      // осталось ~4 с из 7
  assert.equal(app.eyebrow(), "Итоги 2026", "слайд не должен перелистнуться раньше времени");
  app.tick(600);
  assert.equal(app.eyebrow(), "За 2026 год вы потратили");
});

test("картинка-итог: ссылка на blob освобождается при новом открытии", async () => {
  const app = loadApp();
  for (let i = 0; i < 3; i++) {
    openDemo(app);
    while (!app.$("share-img")) app.document.dispatchEvent({ type: "keydown", key: "ArrowRight" });
    await app.flush();
    assert.ok(app.$("share-img").src.startsWith("blob:"));
    app.document.dispatchEvent({ type: "keydown", key: "Escape" });
  }
  openDemo(app);
  await app.flush();
  assert.equal(app.urls.created, 3);
  assert.equal(app.urls.live.size, 0, "старые картинки не должны висеть в памяти");
});

test("сторис: нажатие на ссылку или картинку не ставит на паузу", () => {
  const app = loadApp();
  openDemo(app);
  const link = app.document.createElement("a");
  link.parent = app.$("slide");
  app.fire(link, "pointerdown");
  assert.equal(app.$("story").classList.contains("is-paused"), false);
  const img = app.document.createElement("img");
  img.parent = app.$("slide");
  app.fire(img, "pointerdown");
  assert.equal(app.$("story").classList.contains("is-paused"), false);
});

// Сама раскладка проверяется в браузере (elementFromPoint), здесь — что правила на месте:
// слайд над кнопками листания, нажатия пропускает, а ссылки, кнопки и картинку — нет.
test("сторис: ссылки и картинка-итог лежат над кнопками листания", () => {
  const html = require("node:fs").readFileSync(require("node:path").join(__dirname, "../docs/index.html"), "utf8");
  const z = (sel) => Number(new RegExp(`${sel} \\{[^}]*z-index: (\\d+)`).exec(html)?.[1] || 0);
  assert.ok(z("#slide") > z("\\.story__nav"), "#slide должен быть выше .story__nav");
  assert.match(html, /#slide \{[^}]*pointer-events: none/);
  assert.match(html, /#slide a, #slide button, #slide \.share \{ pointer-events: auto; \}/);
  assert.ok(z("\\.story__bars") > z("#slide") && z("\\.story__close") > z("#slide"), "полоски и крестик видны поверх слайда");
  assert.doesNotMatch(require("node:fs").readFileSync(require("node:path").join(__dirname, "../docs/app.js"), "utf8"), /z-index:3/);
});
