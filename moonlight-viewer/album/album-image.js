// album-image.js — アルバムの画像保存：ケーキカード（名前は自分で選ぶ）・アルバム全体・満月証明書・夜空。フレームは集めた夜の数で増える。
"use strict";

const IMG_FONT = '"Shippori Mincho","Hiragino Mincho ProN","Yu Mincho",serif';
const IMG_SANS = '-apple-system,"Hiragino Kaku Gothic ProN","Yu Gothic UI","Noto Sans JP",sans-serif';
const imgCache = new Map();

function imgLoad(src) {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    }));
  }
  return imgCache.get(src);
}

async function imgFonts() {
  try {
    await Promise.all([
      document.fonts.load(`600 60px ${IMG_FONT}`, "月夜ケーキ"),
      document.fonts.load(`500 40px ${IMG_FONT}`, "月夜ケーキ")
    ]);
  } catch {}
}

function imgRand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function imgBackground(ctx, w, h, seed = 1, stars = 90) {
  const g = ctx.createRadialGradient(w * 0.5, -h * 0.1, 0, w * 0.5, -h * 0.1, h * 1.2);
  g.addColorStop(0, "#1d2a5c");
  g.addColorStop(0.55, "#0a1024");
  g.addColorStop(1, "#05070f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < stars; i++) {
    const x = imgRand(seed * 31 + i) * w;
    const y = imgRand(seed * 17 + i + 500) * h;
    const r = 0.6 + imgRand(i + seed + 900) * 1.8;
    ctx.globalAlpha = 0.25 + imgRand(i + 77) * 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// 欠けた月（frac 0〜1、右から満ちる）
function imgMoon(ctx, cx, cy, r, frac) {
  const f = Math.max(0, Math.min(1, frac));
  if (f > 0.3) {
    ctx.save();
    ctx.shadowColor = "rgba(246,231,182,.55)";
    ctx.shadowBlur = r * 0.6;
    ctx.fillStyle = "rgba(246,231,182,.12)";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#1a2440";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (f <= 0.005) return;
  const lg = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r);
  lg.addColorStop(0, "#fffaf0");
  lg.addColorStop(1, "#e9d9a8");
  ctx.fillStyle = lg;
  ctx.beginPath();
  if (f >= 0.995) {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else {
    const rx = Math.abs(1 - 2 * f) * r;
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);           // 右半分
    ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, f < 0.5); // 境目（三日月は右へ、十三夜は左へふくらむ）
  }
  ctx.fill();
}

function imgCenterText(ctx, text, x, y, maxW) {
  let size = Number((ctx.font.match(/(\d+)px/) || [0, 40])[1]);
  while (ctx.measureText(text).width > maxW && size > 18) {
    size -= 2;
    ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
  }
  ctx.fillText(text, x, y);
}

function imgWrapLines(ctx, text, maxW) {
  const lines = [];
  let line = "";
  for (const ch of String(text)) {
    if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

async function imgFooter(ctx, w, h) {
  const logo = await imgLoad("../icons/icon-192.png");
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(214,179,101,.85)";
  ctx.font = `500 26px ${IMG_SANS}`;
  if (logo) ctx.drawImage(logo, w / 2 - 150, h - 78, 44, 44);
  ctx.textAlign = "left";
  ctx.fillText("cafe＆bar Moonlight", w / 2 - 96, h - 47);
  ctx.textAlign = "center";
}

// 名前の途中で折り返さない（入りきらない長い名前だけ文字で折る）
function imgWrapNames(ctx, names, maxW) {
  const sep = "　・　";
  const lines = [];
  let line = "";
  for (const name of names) {
    const next = line ? line + sep + name : name;
    if (ctx.measureText(next).width <= maxW) { line = next; continue; }
    if (line) lines.push(line);
    if (ctx.measureText(name).width <= maxW) { line = name; continue; }
    const parts = imgWrapLines(ctx, name, maxW);
    line = parts.pop() || "";
    lines.push(...parts);
  }
  if (line) lines.push(line);
  return lines;
}

// ---------- フレーム（集めた夜の数で増える）と流れ星 ----------
const CAKE_FRAMES = [
  { id: "moon", name: "月あかり", need: 1 },
  { id: "stardust", name: "星くず", need: 3 },
  { id: "crescent", name: "三日月", need: 7 },
  { id: "thirteen", name: "十三夜", need: 12 },
  { id: "full", name: "満月", need: 18 }
];

function imgStar(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function imgCrescent(ctx, x, y, r, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI * 0.25, Math.PI * 1.75, false);
  ctx.arc(r * 0.45, 0, r * 0.82, Math.PI * 1.62, Math.PI * 0.38, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function imgGold(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, "#b8913f");
  g.addColorStop(0.45, "#f8e7b0");
  g.addColorStop(0.55, "#e6c77d");
  g.addColorStop(1, "#a9822f");
  return g;
}

function imgFrame(ctx, W, H, id) {
  const m = 36;
  ctx.save();
  if (id === "moon") {
    ctx.strokeStyle = "rgba(214,179,101,.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(m, m, W - m * 2, H - m * 2);
  } else if (id === "stardust") {
    ctx.strokeStyle = "rgba(214,179,101,.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(m, m, W - m * 2, H - m * 2);
    ctx.fillStyle = "#f3dfa8";
    const per = (W + H) / 46;
    for (let i = 0; i < 46; i++) {
      const t = i * per;
      let x, y;
      if (t < W) { x = t; y = i % 2 ? m : H - m; } else { x = i % 2 ? m : W - m; y = t - W; }
      ctx.globalAlpha = 0.5 + imgRand(i + 3) * 0.5;
      imgStar(ctx, x, Math.min(H - m, Math.max(m, y)), 5 + imgRand(i) * 7);
    }
  } else if (id === "crescent") {
    ctx.strokeStyle = "rgba(214,179,101,.65)";
    ctx.lineWidth = 2;
    ctx.strokeRect(m, m, W - m * 2, H - m * 2);
    ctx.strokeRect(m + 12, m + 12, W - (m + 12) * 2, H - (m + 12) * 2);
    ctx.fillStyle = "#f3dfa8";
    imgCrescent(ctx, m + 6, m + 6, 30, Math.PI * 0.25);
    imgCrescent(ctx, W - m - 6, m + 6, 30, Math.PI * 0.75);
    imgCrescent(ctx, W - m - 6, H - m - 6, 30, Math.PI * 1.25);
    imgCrescent(ctx, m + 6, H - m - 6, 30, Math.PI * 1.75);
  } else if (id === "thirteen") {
    ctx.strokeStyle = imgGold(ctx, 0, 0, W, H);
    ctx.lineWidth = 6;
    ctx.strokeRect(m, m, W - m * 2, H - m * 2);
    ctx.lineWidth = 2;
    ctx.strokeRect(m + 16, m + 16, W - (m + 16) * 2, H - (m + 16) * 2);
    ctx.fillStyle = imgGold(ctx, 0, 0, W, H);
    for (const [x, y] of [[m, m], [W - m, m], [W - m, H - m], [m, H - m]]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 26); ctx.lineTo(x + 26, y); ctx.lineTo(x, y + 26); ctx.lineTo(x - 26, y);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#f8e7b0";
    for (const x of [W / 2 - 60, W / 2, W / 2 + 60]) imgStar(ctx, x, m, x === W / 2 ? 14 : 8);
    for (const x of [W / 2 - 60, W / 2, W / 2 + 60]) imgStar(ctx, x, H - m, x === W / 2 ? 14 : 8);
  } else if (id === "full") {
    ctx.shadowColor = "rgba(248,231,176,.7)";
    ctx.shadowBlur = 30;
    ctx.strokeStyle = imgGold(ctx, 0, 0, W, H);
    ctx.lineWidth = 12;
    ctx.strokeRect(m, m, W - m * 2, H - m * 2);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeRect(m + 22, m + 22, W - (m + 22) * 2, H - (m + 22) * 2);
    // 上の満月と光
    const cx = W / 2, cy = m;
    ctx.fillStyle = "rgba(248,231,176,.18)";
    for (let i = 0; i < 16; i++) {
      const a = Math.PI + (i * Math.PI) / 15;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      ctx.fillRect(48, -2, 70, 4);
      ctx.restore();
    }
    const mg = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 40);
    mg.addColorStop(0, "#fffaf0"); mg.addColorStop(1, "#e9d9a8");
    ctx.shadowColor = "rgba(248,231,176,.9)"; ctx.shadowBlur = 40;
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f8e7b0";
    for (const [x, y] of [[m, m], [W - m, m], [W - m, H - m], [m, H - m]]) imgStar(ctx, x, y, 22);
  }
  ctx.restore();
}

function imgShootingStars(ctx, W, H, seed = 1, spots = null) {
  ctx.save();
  const stars = spots || [[0.18, 0.12, 1], [0.7, 0.07, 0.75], [0.86, 0.3, 0.6]];
  stars.forEach(([fx, fy, s], i) => {
    const x = W * (fx + (spots ? 0 : (imgRand(seed + i) - 0.5) * 0.06));
    const y = H * (fy + (spots ? 0 : (imgRand(seed + i + 9) - 0.5) * 0.04));
    const len = 220 * s;
    const g = ctx.createLinearGradient(x, y, x - len, y - len * 0.45);
    g.addColorStop(0, "rgba(255,245,210,.95)");
    g.addColorStop(1, "rgba(255,245,210,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 5 * s;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y - len * 0.45); ctx.stroke();
    ctx.shadowColor = "rgba(255,240,190,1)"; ctx.shadowBlur = 24;
    ctx.fillStyle = "#fffbe8";
    imgStar(ctx, x, y, 14 * s);
    ctx.shadowBlur = 0;
  });
  ctx.restore();
}

// ---------- ケーキカード ----------
// selfName：自分の名前（入れないときは空）／withNames：一緒の人（「with A ・ B」で入れる）
async function makeCardImage({ visit, selfName = "", withNames = [], startDate, total, frame = "moon", shooting = false }) {
  const hasNames = Boolean(selfName) || withNames.length > 0;
  await imgFonts();
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  imgBackground(ctx, W, H, visit.night, 110);

  imgFrame(ctx, W, H, frame);
  if (shooting) imgShootingStars(ctx, W, H, visit.night);

  ctx.textAlign = "center";
  ctx.fillStyle = "#d6b365";
  ctx.font = `600 30px ${IMG_SANS}`;
  ctx.fillText("18 NIGHTS OF THE MOON", W / 2, 108);
  ctx.fillStyle = "#f3dfa8";
  ctx.font = `600 44px ${IMG_FONT}`;
  ctx.fillText(`第${visit.night}夜　${cakeNightDate(startDate, visit.night)}${visit.night === total ? "　満月の夜" : ""}`, W / 2, frame === "full" ? 178 : 168);

  const im = await imgLoad(visit.image);
  if (im) {
    const size = hasNames ? 690 : 760;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 40;
    ctx.drawImage(im, (W - size) / 2, 200, size, size);
    ctx.restore();
  }
  let y = hasNames ? (selfName && withNames.length ? 950 : 980) : 1040;
  ctx.fillStyle = "#f3dfa8";
  ctx.font = `600 62px ${IMG_FONT}`;
  imgCenterText(ctx, visit.cake, W / 2, y, W - 160);
  y += 58;
  ctx.fillStyle = "#c9d3e8";
  ctx.font = `500 34px ${IMG_SANS}`;
  imgCenterText(ctx, `＋ ${visit.drink}`, W / 2, y, W - 160);

  if (selfName) {
    y += 72;
    ctx.fillStyle = "#f4ecd2";
    ctx.font = `600 44px ${IMG_FONT}`;
    imgCenterText(ctx, selfName, W / 2, y, W - 200);
  }
  if (withNames.length) {
    y += selfName ? 56 : 72;
    ctx.font = `500 38px ${IMG_FONT}`;
    const lines = imgWrapNames(ctx, withNames, W - 300).slice(0, 2);
    lines.forEach((line, i) => {
      const prefix = i === 0 ? "with  " : "";
      ctx.font = `italic 500 34px ${IMG_SANS}`;
      const pw = prefix ? ctx.measureText(prefix).width : 0;
      ctx.font = `500 38px ${IMG_FONT}`;
      const lw = ctx.measureText(line).width;
      const x0 = W / 2 - (pw + lw) / 2;
      ctx.textAlign = "left";
      if (prefix) {
        ctx.fillStyle = "#d6b365";
        ctx.font = `italic 500 34px ${IMG_SANS}`;
        ctx.fillText(prefix, x0, y);
      }
      ctx.fillStyle = "#f4ecd2";
      ctx.font = `500 38px ${IMG_FONT}`;
      ctx.fillText(line, x0 + pw, y);
      ctx.textAlign = "center";
      y += 50;
    });
  }
  await imgFooter(ctx, W, H);
  return cv;
}

// ---------- アルバム全体 ----------
async function makeAlbumImage(album, title, { showName = true, showTitle = true, frame = "moon", shooting = false } = {}) {
  await imgFonts();
  const total = album.total_nights;
  const cols = 3, rows = Math.ceil(total / cols);
  const W = 1080, tileW = 316, tileH = 236, gap = 18, top = 300;
  const H = top + rows * (tileH + gap) + 120;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  imgBackground(ctx, W, H, 7, 140);
  imgFrame(ctx, W, H, frame);
  if (shooting) imgShootingStars(ctx, W, H, 3, [[0.66, 0.028, 0.7], [0.97, 0.115, 0.55]]);

  const count = album.visits.length;
  const streaks = new Set(album.visits.filter((v) => v.streak).map((v) => v.night));
  ctx.textAlign = "left";
  ctx.fillStyle = "#d6b365";
  ctx.font = `600 28px ${IMG_SANS}`;
  ctx.fillText("cafe＆bar Moonlight ・ 18夜の月", 76, 104);
  ctx.fillStyle = "#f3dfa8";
  ctx.font = `600 64px ${IMG_FONT}`;
  ctx.fillText(showName ? album.name : "わたしの18夜", 76, 182, 720);
  ctx.fillStyle = "#c9d3e8";
  ctx.font = `500 34px ${IMG_SANS}`;
  ctx.fillText(`${showTitle && title ? title + "　" : ""}${count} / ${total}夜`, 76, 238);
  imgMoon(ctx, W - 150, 160, 76, count / total);

  const byNight = new Map(album.visits.map((v) => [v.night, v]));
  const x0 = (W - (cols * tileW + (cols - 1) * gap)) / 2;
  for (let n = 1; n <= total; n++) {
    const i = n - 1;
    const x = x0 + (i % cols) * (tileW + gap);
    const y = top + Math.floor(i / cols) * (tileH + gap);
    const v = byNight.get(n);
    ctx.fillStyle = v ? "rgba(28,41,80,.85)" : "rgba(12,20,38,.75)";
    ctx.strokeStyle = v ? "rgba(214,179,101,.6)" : "rgba(42,58,88,.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, tileW, tileH, 18) : ctx.rect(x, y, tileW, tileH);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = v ? "#d6b365" : "#5d6b86";
    ctx.font = `600 22px ${IMG_SANS}`;
    ctx.fillText(`第${n}夜 ${cakeNightDate(album.start_date, n)}`, x + 14, y + 32);
    if (v && streaks.has(n)) { ctx.fillStyle = "#fff3c4"; imgStar(ctx, x + tileW - 22, y + 24, 11); }
    if (v) {
      const im = await imgLoad(v.image);
      if (im) ctx.drawImage(im, x + (tileW - 170) / 2, y + 40, 170, 170);
      ctx.textAlign = "center";
      ctx.fillStyle = "#f4ecd2";
      ctx.font = `500 22px ${IMG_FONT}`;
      imgCenterText(ctx, v.cake, x + tileW / 2, y + tileH - 12, tileW - 20);
    } else {
      ctx.textAlign = "center";
      ctx.fillStyle = "#3d4a66";
      ctx.font = `600 64px ${IMG_FONT}`;
      ctx.fillText("？", x + tileW / 2, y + tileH / 2 + 30);
    }
  }
  await imgFooter(ctx, W, H);
  return cv;
}

// ---------- 月の証明書（来た夜の数で名前と月の形が変わる。18夜すべてで満月証明書） ----------
const CERT_SIGNATURE = "ここここし ここし";

function certPhase(count, total) {
  if (count >= total) return { name: "満月", en: "FULL MOON", frac: 1 };
  if (count >= 12) return { name: "十三夜", en: "THIRTEENTH-NIGHT MOON", frac: 0.82 };
  if (count >= 6) return { name: "半月", en: "HALF MOON", frac: 0.5 };
  return { name: "三日月", en: "CRESCENT MOON", frac: 0.22 };
}

async function makeCertificate(album, title, { frame = "full" } = {}) {
  await imgFonts();
  const W = 1080, H = 1350;
  const total = album.total_nights;
  const count = album.visits.length;
  const complete = count >= total;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  imgBackground(ctx, W, H, 18, 160);
  imgFrame(ctx, W, H, frame);

  ctx.textAlign = "center";
  ctx.fillStyle = "#d6b365";
  ctx.font = `600 28px ${IMG_SANS}`;
  const phase = certPhase(count, total);
  ctx.fillText(`CERTIFICATE OF THE ${phase.en}`, W / 2, frame === "full" ? 150 : 132);
  ctx.fillStyle = imgGold(ctx, 300, 0, 780, 0);
  ctx.font = `600 96px ${IMG_FONT}`;
  imgCenterText(ctx, `${phase.name}証明書`, W / 2, 252, W - 200);

  imgMoon(ctx, W / 2, 400, 90, phase.frac);

  ctx.fillStyle = "#f3dfa8";
  ctx.font = `600 62px ${IMG_FONT}`;
  imgCenterText(ctx, `${album.name} さま`, W / 2, 580, W - 220);
  ctx.strokeStyle = "rgba(214,179,101,.6)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(220, 606); ctx.lineTo(W - 220, 606); ctx.stroke();

  ctx.fillStyle = "#f4ecd2";
  ctx.font = `500 36px ${IMG_FONT}`;
  const body = complete
    ? ["cafe＆bar Moonlight の最後の18夜を、", "ひと夜も欠かさずともに過ごした", "「満月の住人」であることをここに証します。"]
    : [`cafe＆bar Moonlight の最後の18夜のうち、`, `${count}夜をともに過ごし、${phase.name}まで月を満たした`, "あなたの月あかりに、心からの感謝を。"];
  body.forEach((line, i) => imgCenterText(ctx, line, W / 2, 680 + i * 58, W - 200));

  // 集めたケーキ
  const icons = album.visits.slice(0, 18);
  const size = 82, gap = 8, perRow = 9;
  for (let i = 0; i < icons.length; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, icons.length - row * perRow);
    const x0 = (W - (inRow * size + (inRow - 1) * gap)) / 2;
    const x = x0 + (i % perRow) * (size + gap);
    const y = 880 + row * (size + gap);
    const im = await imgLoad(icons[i].image);
    if (im) ctx.drawImage(im, x, y, size, size);
  }

  ctx.fillStyle = "#c9d3e8";
  ctx.font = `500 32px ${IMG_SANS}`;
  ctx.fillText(`${title}　・　${count} / ${total}夜`, W / 2, 1100);
  ctx.fillStyle = "#d6b365";
  ctx.font = `500 30px ${IMG_FONT}`;
  ctx.fillText(`${cakeNightDate(album.start_date, total).replace("/", "月")}日　最後の夜に`, W / 2, 1150);
  ctx.font = `500 26px ${IMG_SANS}`;
  ctx.fillText("cafe＆bar Moonlight 店長", W / 2, 1196);
  ctx.fillStyle = "#f3dfa8";
  ctx.font = `600 40px ${IMG_FONT}`;
  ctx.fillText(CERT_SIGNATURE, W / 2, 1244);
  return cv;
}

// ---------- 夜空 ----------
async function makeSkyImage(pub) {
  await imgFonts();
  const W = 1080, H = 1080;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#050816"); g.addColorStop(1, "#0c1636");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const shown = Math.min(pub.stars, 600);
  for (let i = 0; i < shown; i++) {
    const x = 40 + imgRand(i + 1) * (W - 80);
    const y = 60 + imgRand(i + 501) * (H * 0.7);
    if (x > W * 0.6 && y < H * 0.42) continue;
    ctx.globalAlpha = 0.5 + imgRand(i + 33) * 0.5;
    ctx.fillStyle = i >= pub.stars - (pub.tonight_stars || 0) ? "#ffe9a8" : "#ffffff";
    ctx.beginPath(); ctx.arc(x, y, 1.6 + imgRand(i + 901) * 2.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const last = pub.thresholds[pub.thresholds.length - 1] || 1;
  imgMoon(ctx, W * 0.78, H * 0.2, 120, Math.max(0.04, Math.min(1, pub.stars / last)));

  ctx.textAlign = "left";
  ctx.fillStyle = "#f3dfa8";
  ctx.font = `600 120px ${IMG_FONT}`;
  ctx.fillText(String(pub.stars), 70, H - 190);
  const wNum = ctx.measureText(String(pub.stars)).width;
  ctx.font = `500 40px ${IMG_FONT}`;
  ctx.fillText("の星", 80 + wNum, H - 192);
  ctx.fillStyle = "#c9d3e8";
  ctx.font = `500 34px ${IMG_SANS}`;
  ctx.fillText(`みんなで灯したMoonlightの夜空　・　いまは${CAKE_STAGES[pub.stage].name}`, 72, H - 130);
  await imgFooter(ctx, W, H);
  return cv;
}

// ---------- 保存 ----------
// スマホ：画像を大きく表示して「長押し →『写真に追加』」で保存（共有画面は出さない）。パソコン：そのままダウンロード。
function isTouchDevice() {
  return window.matchMedia?.("(pointer: coarse)").matches || /iPhone|iPad|Android/i.test(navigator.userAgent);
}

function showSaveOverlay(dataUrl) {
  let ov = document.getElementById("saveOverlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "saveOverlay";
    ov.className = "save-overlay";
    ov.innerHTML = `<div class="save-overlay-inner">
        <p class="save-overlay-tip">画像を<b>長押し</b>して<br>「"写真"に追加」（Androidは「画像をダウンロード」）で保存できます</p>
        <img alt="保存する画像">
        <button class="btn" type="button">閉じる</button>
      </div>`;
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("button")) ov.classList.add("hidden"); });
    document.body.appendChild(ov);
  }
  ov.querySelector("img").src = dataUrl;
  ov.classList.remove("hidden");
}

async function saveCanvas(cv, filename) {
  if (isTouchDevice()) {
    showSaveOverlay(cv.toDataURL("image/png"));
    return "overlay";
  }
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  if (!blob) throw new Error("画像を作れませんでした");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
