(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const { fmt, plural } = Wrapped;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DURATION = 7000;
  const MONTH_SHORT = ["я", "ф", "м", "а", "м", "и", "и", "а", "с", "о", "н", "д"];

  let slides = [], index = 0, timer = null, startedAt = 0, remaining = DURATION, result = null;

  // Число, которое «набегает» от нуля.
  const count = (n, suffix = "") => `<span class="num" data-count="${Math.round(n)}" data-suffix="${esc(suffix)}">${fmt(n)}${suffix}</span>`;

  function buildSlides(r) {
    const s = [];
    s.push({ g: "g4", html: `
      <span class="slide__eyebrow pop">Итоги ${r.year}</span>
      <h2 class="slide__title pop pop-2">Готовы узнать, куда ушли ваши деньги?</h2>
      <p class="slide__text pop pop-3">Нажимайте справа, чтобы листать дальше, слева — чтобы вернуться.</p>` });

    s.push({ g: "g1", html: `
      <span class="slide__eyebrow pop">За ${r.year} год вы потратили</span>
      <div class="slide__big pop pop-2">${count(r.totalSpent, " ₽")}</div>
      <p class="slide__text pop pop-3">${fmt(r.purchases)} ${plural(r.purchases, "покупка", "покупки", "покупок")} — в среднем ${fmt(r.perDay)} ₽ в день.</p>
      ${r.totalIncome ? `<p class="slide__note pop pop-4">${r.saved >= 0 ? `А пришло на ${fmt(r.saved)} ₽ больше. Неплохо!` : `Это на ${fmt(-r.saved)} ₽ больше, чем пришло. Ой.`}</p>` : ""}` });

    const top = r.categories.slice(0, 5);
    const max = top[0].sum;
    s.push({ g: "g2", html: `
      <span class="slide__eyebrow pop">Больше всего ушло на</span>
      <ol class="list">${top.map((c, i) => `
        <li class="pop pop-${Math.min(i + 1, 4)}"><span class="rank">${i + 1}</span><span>${c.emoji} ${esc(c.name)}</span><span class="val num">${fmt(c.sum)} ₽</span>
          <span class="bar"><i style="width:${Math.round(c.sum / max * 100)}%;animation-delay:${0.2 + i * 0.12}s"></i></span></li>`).join("")}
      </ol>` });

    if (r.favPlace) {
      s.push({ g: "g3", html: `
        <span class="slide__eyebrow pop">Ваше любимое место</span>
        <div class="slide__emoji pop pop-2">${r.favPlace.emoji}</div>
        <h2 class="slide__title pop pop-2">${esc(r.favPlace.name)}</h2>
        <div class="slide__big pop pop-3">${count(r.favPlace.count)} ${plural(r.favPlace.count, "раз", "раза", "раз")}</div>
        <p class="slide__text pop pop-4">и ${fmt(r.favPlace.sum)} ₽. Там вас уже точно узнают.</p>
        ${r.topPlaces.length > 1 ? `<p class="slide__note pop pop-4">Дальше: ${r.topPlaces.slice(1, 4).map((p) => `${esc(p.name)} (${p.count})`).join(", ")}</p>` : ""}` });
    }

    if (r.delivery.shawarmas > 0) {
      s.push({ g: "g6", html: `
        <span class="slide__eyebrow pop">Доставка еды</span>
        <div class="slide__big pop pop-2">${count(r.delivery.sum, " ₽")}</div>
        <p class="slide__text pop pop-3">Это <b>${fmt(r.delivery.shawarmas)} ${plural(r.delivery.shawarmas, "шаверма", "шавермы", "шаверм")}</b> 🌯 по ${Wrapped.SHAWARMA} ₽.</p>
        <p class="slide__note pop pop-4">Курьеры передают привет.</p>` });
    }
    if (r.coffee.count > 0) {
      s.push({ g: "g2", html: `
        <span class="slide__eyebrow pop">Кофе</span>
        <div class="slide__emoji pop pop-2">☕</div>
        <div class="slide__big pop pop-2">${count(r.coffee.count)}</div>
        <p class="slide__text pop pop-3">${plural(r.coffee.count, "чашка", "чашки", "чашек")} за год на ${fmt(r.coffee.sum)} ₽.</p>
        <p class="slide__note pop pop-4">${r.coffee.count > 150 ? "Это почти каждый второй день. Вы и кофе — пара года." : "Умеренно и со вкусом."}</p>` });
    }

    s.push({ g: "g1", html: `
      <span class="slide__eyebrow pop">Самый дорогой день</span>
      <h2 class="slide__title pop pop-2">${r.topDay.label}</h2>
      <div class="slide__big pop pop-3">${count(r.topDay.sum, " ₽")}</div>
      <p class="slide__text pop pop-4">Самая крупная покупка года — ${esc(r.biggest.merchant)} за ${fmt(r.biggest.sum)} ₽ (${r.biggest.label}).</p>` });

    const mmax = Math.max(...r.monthly, 1);
    s.push({ g: "g3", html: `
      <span class="slide__eyebrow pop">Самый транжирный месяц</span>
      <h2 class="slide__title pop pop-2">${r.topMonth.name[0].toUpperCase() + r.topMonth.name.slice(1)} — ${fmt(r.topMonth.sum)} ₽</h2>
      <div class="months pop pop-3">${r.monthly.map((m, i) => `<div class="${i === r.topMonth.index ? "is-top" : ""}" style="height:${Math.max(2, Math.round(m / mmax * 100))}%;animation-delay:${0.2 + i * 0.05}s"></div>`).join("")}</div>
      <div class="months-labels">${MONTH_SHORT.map((m) => `<span>${m}</span>`).join("")}</div>
      <p class="slide__text pop pop-4">А больше всего тратите в ${r.topWeekday}.</p>` });

    if (r.subscriptions.list.length) {
      s.push({ g: "g4", html: `
        <span class="slide__eyebrow pop">Подписки</span>
        <div class="slide__big pop pop-2">${count(r.subscriptions.perYear, " ₽")}</div>
        <p class="slide__text pop pop-3">в год уходит на ${r.subscriptions.list.length} ${plural(r.subscriptions.list.length, "подписку", "подписки", "подписок")}:</p>
        <ul class="list pop pop-4">${r.subscriptions.list.slice(0, 5).map((x) => `<li><span>📺</span><span>${esc(x.name)}</span><span class="val num">${fmt(x.monthly)} ₽/мес</span></li>`).join("")}</ul>
        <p class="slide__note pop pop-4">Найти забытые поможет <a href="https://codebywater.github.io/subscription-hunter/" rel="noopener" style="color:inherit;position:relative;z-index:3">Охотник за подписками</a>.</p>` });
    }

    if (r.night && r.night.count > 0) {
      s.push({ g: "g4", html: `
        <span class="slide__eyebrow pop">Ночная жизнь</span>
        <div class="slide__emoji pop pop-2">🌙</div>
        <div class="slide__big pop pop-2">${count(r.night.count)}</div>
        <p class="slide__text pop pop-3">${plural(r.night.count, "покупка", "покупки", "покупок")} после 23:00 на ${fmt(r.night.sum)} ₽.</p>
        <p class="slide__note pop pop-4">И ещё ${r.noSpendDays} ${plural(r.noSpendDays, "день", "дня", "дней")} без единой траты. Баланс!</p>` });
    }

    s.push({ g: "g5", html: `
      <span class="slide__eyebrow pop">Ваш финансовый тип</span>
      <div class="slide__emoji pop pop-2">${r.persona.emoji}</div>
      <h2 class="slide__title pop pop-3">${esc(r.persona.title)}</h2>
      <p class="slide__text pop pop-4">${esc(r.persona.text)}</p>
      <p class="slide__note pop pop-4">Главная статья «по желанию»: ${esc(r.persona.category)}.</p>` });

    s.push({ g: "g4", final: true, html: `
      <span class="slide__eyebrow pop">Ваш ${r.year} на одной картинке</span>
      <img class="share pop pop-2" id="share-img" alt="Итоги года: потрачено ${fmt(r.totalSpent)} ₽, тип — ${esc(r.persona.title)}">
      <div class="slide__actions pop pop-3">
        <button type="button" class="btn btn--primary" id="save">Сохранить картинку</button>
        <button type="button" class="btn" id="again">Смотреть снова</button>
      </div>
      <p class="slide__note pop pop-4">Картинка создаётся на вашем устройстве. Делитесь, если хотите.</p>` });
    return s;
  }

  function animateCounts(root) {
    root.querySelectorAll("[data-count]").forEach((el) => {
      const target = Number(el.dataset.count), suffix = el.dataset.suffix;
      if (reduced || target < 10) return;
      const t0 = performance.now(), dur = 1100;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = fmt(target * (1 - Math.pow(1 - k, 3))) + suffix;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      // Если вкладка в фоне и кадры не рисуются, всё равно показываем итог.
      setTimeout(() => { el.textContent = fmt(target) + suffix; }, dur + 100);
    });
  }

  function show(i) {
    index = Math.max(0, Math.min(slides.length - 1, i));
    const s = slides[index];
    $("slide").innerHTML = `<section class="slide slide--${s.g}">${s.html}</section>`;
    [...$("bars").children].forEach((b, k) => {
      b.className = "story__bar" + (k < index ? " is-done" : k === index ? " is-active" : "");
      // Перезапуск анимации полоски.
      const bar = b.firstElementChild;
      bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "";
    });
    animateCounts($("slide"));
    if (s.final) setupFinal();
    clearTimeout(timer);
    remaining = DURATION;
    if (!s.final) schedule();
  }

  function schedule() {
    startedAt = Date.now();
    timer = setTimeout(() => show(index + 1), remaining);
  }

  function pause() {
    if (slides[index]?.final) return;
    clearTimeout(timer);
    remaining -= Date.now() - startedAt;
    $("story").classList.add("is-paused");
  }

  function resume() {
    if (!$("story").classList.contains("is-paused")) return;
    $("story").classList.remove("is-paused");
    schedule();
  }

  // Картинка рисуется один раз на выписку: листать туда-обратно можно сколько угодно.
  let card = null;
  function shareCard() {
    if (!card) {
      card = new Promise((resolve) => ShareCard.draw(result, document.createElement("canvas")).toBlob((blob) =>
        resolve({ blob, url: URL.createObjectURL(blob) }), "image/png"));
    }
    return card;
  }

  async function saveCard() {
    const { blob, url } = await shareCard();
    const file = new File([blob], `moi-${result.year}-v-dengah.png`, { type: "image/png" });
    // На телефоне — системное «Поделиться», на компьютере — скачивание.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `Мой ${result.year} в деньгах` }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
  }

  function setupFinal() {
    $("save").onclick = saveCard;
    $("again").onclick = () => show(0);
    shareCard().then(({ url }) => {
      const img = $("share-img");
      if (img) img.src = url;   // пользователь мог уже уйти с последнего слайда
    });
  }

  function open(text) {
    $("error").hidden = true;
    card = null;
    try { result = Wrapped.analyze(text); } catch (e) {
      $("error").textContent = e.message;
      $("error").hidden = false;
      return;
    }
    slides = buildSlides(result);
    $("bars").innerHTML = slides.map(() => '<div class="story__bar"><i></i></div>').join("");
    $("bars").style.setProperty("--dur", `${DURATION / 1000}s`);
    $("landing").hidden = true;
    $("stories").hidden = false;
    document.body.style.overflow = "hidden";
    show(0);
    $("next").focus();
  }

  function close() {
    clearTimeout(timer);
    $("stories").hidden = true;
    $("landing").hidden = false;
    document.body.style.overflow = "";
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      // Банки часто отдают CSV в Windows-1251: если UTF-8 не прочитался, пробуем её.
      if (reader.result.includes("�")) {
        const r2 = new FileReader();
        r2.onload = () => open(r2.result);
        r2.readAsText(file, "windows-1251");
        return;
      }
      open(reader.result);
    };
    reader.readAsText(file, "utf-8");
  }

  $("pick").addEventListener("click", (e) => { e.preventDefault(); $("file").click(); });
  $("demo").addEventListener("click", (e) => { e.preventDefault(); open(window.WRAPPED_DEMO); });
  $("file").addEventListener("change", (e) => e.target.files[0] && readFile(e.target.files[0]));
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("drop--over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("drop--over"); }));
  drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && readFile(e.dataTransfer.files[0]));

  // Короткое нажатие листает, долгое — ставит на паузу, как в обычных сторис.
  let pressedAt = 0;
  const tap = (step) => () => { if (Date.now() - pressedAt < 300) show(index + step); };
  $("prev").addEventListener("click", tap(-1));
  $("next").addEventListener("click", tap(1));
  $("close").addEventListener("click", close);
  $("story").addEventListener("pointerdown", (e) => {
    if (e.target.closest(".story__close, .slide__actions, a")) return;
    pressedAt = Date.now();
    pause();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((t) => $("story").addEventListener(t, resume));
  document.addEventListener("keydown", (e) => {
    if ($("stories").hidden) return;
    if (e.key === "ArrowRight") show(index + 1);
    else if (e.key === "ArrowLeft") show(index - 1);
    else if (e.key === "Escape") close();
  });
})();
