/*
 * Картинка-итог 1080×1920 для сторис. Рисуется на canvas прямо в браузере.
 */
(function (root) {
  "use strict";
  const W = 1080, H = 1920;
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

  function fitText(ctx, text, maxWidth, size, weight) {
    let s = size;
    do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 2; } while (ctx.measureText(text).width > maxWidth && s > 20);
    return text;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(r, canvas) {
    const fmt = Wrapped.fmt;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const g = ctx.createLinearGradient(0, 0, W, H);
    // Те же тёмные тона, что у слайдов: белый текст читается на всей картинке (контраст ≥ 4.5:1).
    g.addColorStop(0, "#623dff");
    g.addColorStop(0.55, "#a3127a");
    g.addColorStop(1, "#c20051");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Декоративные круги.
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#fff";
    [[900, 260, 260], [120, 1500, 340], [980, 1700, 180]].forEach(([x, y, rad]) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;

    const X = 90;
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "alphabetic";
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(`МОЙ ${r.year} В ДЕНЬГАХ`, X, 190);

    ctx.font = `600 40px ${FONT}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText("Потрачено за год", X, 330);
    ctx.globalAlpha = 1;
    fitText(ctx, `${fmt(r.totalSpent)} ₽`, W - X * 2, 150, 900);
    ctx.fillText(`${fmt(r.totalSpent)} ₽`, X, 480);

    // Карточка с топ-3 категориями.
    const cardY = 560;
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    roundRect(ctx, X - 20, cardY, W - (X - 20) * 2, 470, 44);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `700 36px ${FONT}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText("Больше всего ушло на", X + 30, cardY + 80);
    ctx.globalAlpha = 1;
    r.categories.slice(0, 3).forEach((c, i) => {
      const y = cardY + 170 + i * 110;
      ctx.font = `800 52px ${FONT}`;
      ctx.fillText(`${c.emoji} ${c.name}`, X + 30, y);
      ctx.textAlign = "right";
      ctx.font = `800 48px ${FONT}`;
      ctx.fillText(`${fmt(c.sum)} ₽`, W - X - 30, y);
      ctx.textAlign = "left";
    });

    // Факты.
    const facts = [];
    if (r.favPlace) facts.push([r.favPlace.emoji, `${r.favPlace.name} — ${r.favPlace.count} ${Wrapped.plural(r.favPlace.count, "раз", "раза", "раз")}`]);
    facts.push(["📅", `Самый дорогой день: ${r.topDay.label}`]);
    if (r.delivery.shawarmas > 0) facts.push(["🌯", `Доставка = ${fmt(r.delivery.shawarmas)} ${Wrapped.plural(r.delivery.shawarmas, "шаверма", "шавермы", "шаверм")}`]);
    else if (r.coffee.count > 0) facts.push(["☕", `${fmt(r.coffee.count)} ${Wrapped.plural(r.coffee.count, "чашка", "чашки", "чашек")} кофе`]);
    let y = 1150;
    facts.slice(0, 3).forEach(([e, text]) => {
      ctx.font = `700 46px ${FONT}`;
      fitText(ctx, `${e}  ${text}`, W - X * 2, 46, 700);
      ctx.fillText(`${e}  ${text}`, X, y);
      y += 90;
    });

    // Тип.
    ctx.fillStyle = "#0b0a10";
    roundRect(ctx, X - 20, 1440, W - (X - 20) * 2, 250, 44);
    ctx.fill();
    ctx.fillStyle = "#c4f04d";
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText("МОЙ ФИНАНСОВЫЙ ТИП", X + 30, 1510);
    ctx.fillStyle = "#fff";
    fitText(ctx, `${r.persona.emoji} ${r.persona.title}`, W - X * 2 - 60, 66, 900);
    ctx.fillText(`${r.persona.emoji} ${r.persona.title}`, X + 30, 1610);

    ctx.font = `600 34px ${FONT}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText("codebywater.github.io/money-wrapped", X, 1820);
    ctx.globalAlpha = 1;
    return canvas;
  }

  root.ShareCard = { draw, W, H };
})(typeof self !== "undefined" ? self : this);
