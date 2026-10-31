// album.js — お客さん用ページ：夜空（誰でも）と、4桁の番号で開くアルバム。
"use strict";

const CODE_KEY = "moonlight-album-code";
const $ = (id) => document.getElementById(id);
let pub = null;      // cake_public の結果
let album = null;    // cake_album の結果
let code = "";
let pollTimer = null;

const TITLES = [
  [18, "満月の住人"],
  [12, "十三夜の常連"],
  [7, "月見の常連"],
  [3, "宵の客"],
  [1, "はじめての夜"]
];

// ---------- 小物 ----------
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add("hidden"), 2600);
}

function rand(seed) {
  let x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// 欠けた月（frac: 0=新月, 1=満月。右から満ちる）
function moonSvg(frac, size = 76, glow = true) {
  const r = 40, cx = 50, cy = 50;
  const f = Math.max(0, Math.min(1, frac));
  let lit = "";
  if (f >= 0.995) {
    lit = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#mg)"/>`;
  } else if (f > 0.005) {
    const rx = Math.abs(1 - 2 * f) * r;
    const sweep = f < 0.5 ? 0 : 1;
    lit = `<path d="M${cx},${cy - r} A${r},${r} 0 0 1 ${cx},${cy + r} A${rx},${r} 0 0 ${sweep} ${cx},${cy - r}Z" fill="url(#mg)"/>`;
  }
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    <defs><radialGradient id="mg" cx="40%" cy="38%"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e9d9a8"/></radialGradient>
    <filter id="mglow"><feGaussianBlur stdDeviation="${glow ? 4 : 0}"/></filter></defs>
    ${glow && f > 0.3 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f6e7b6" opacity="${0.18 * f}" filter="url(#mglow)"/>` : ""}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#1a2440" stroke="rgba(244,236,210,.18)"/>
    ${lit}
  </svg>`;
}

function stageFrac(stars, thresholds) {
  const last = thresholds[thresholds.length - 1] || 1;
  return Math.max(0.04, Math.min(1, stars / last));
}

// ---------- 背景の星 ----------
function paintBgStars() {
  const box = $("bgStars");
  let html = "";
  for (let i = 0; i < 60; i++) {
    html += `<i style="left:${(rand(i) * 100).toFixed(2)}%;top:${(rand(i + 99) * 100).toFixed(2)}%;animation-delay:${(rand(i + 7) * 4).toFixed(2)}s;opacity:${(0.2 + rand(i + 3) * 0.5).toFixed(2)}"></i>`;
  }
  box.innerHTML = html;
}

// ---------- 夜空（みんなの星） ----------
function renderSky() {
  if (!pub) return;
  const { stars, thresholds, stage, night, total_nights: total, start_date: start, tonight_stars: tonight } = pub;
  document.body.className = `stage-${stage}`;

  // バッジ
  let badge;
  if (night < 1) badge = `🌑 ${cakeNightDate(start, 1)} 開幕`;
  else if (night > total) badge = "🌕 18夜、ありがとうございました";
  else if (night === total) badge = `🌕 最終夜 ${cakeNightDate(start, night)}`;
  else badge = `🌙 第${night}夜 ${cakeNightDate(start, night)}　/ ${total}`;
  $("nightBadge").textContent = badge;

  // 星（表示は最大320個）
  const shown = Math.min(stars, 320);
  let dots = "";
  for (let i = 0; i < shown; i++) {
    const x = 4 + rand(i + 1) * 92;
    const y = 6 + rand(i + 501) * 76;
    if (x > 60 && y < 46) continue; // 月のまわりは空ける
    const s = 0.35 + rand(i + 901) * 0.75;
    const isNew = i >= stars - tonight;
    dots += `<circle class="star-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${s.toFixed(2)}" fill="${isNew ? "#ffe9a8" : "#ffffff"}" opacity="${(0.55 + rand(i + 33) * 0.45).toFixed(2)}" style="animation-delay:${(rand(i + 77) * 5).toFixed(2)}s"/>`;
  }
  const moon = moonSvg(stageFrac(stars, thresholds), 100, true).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  $("sky").innerHTML = `<svg viewBox="0 0 100 69" preserveAspectRatio="xMidYMid slice">
      ${dots}
      <g transform="translate(68,4) scale(.3)">${moon}</g>
    </svg>
    <div class="sky-label">
      <div><div class="sky-count">${stars}<small>の星</small></div>みんなで灯した星${night >= 1 && night <= total ? `（今夜 +${tonight}）` : ""}</div>
      <div style="text-align:right">${CAKE_STAGES[stage].icon} いまは${CAKE_STAGES[stage].name}</div>
    </div>`;

  // 次の段階
  const next = thresholds.find((t) => stars < t);
  const prev = [...thresholds].reverse().find((t) => stars >= t) || 0;
  if (next) {
    $("skyNext").textContent = `${CAKE_STAGES[stage + 1].icon} ${CAKE_STAGES[stage + 1].name}まで、あと${next - stars}個の星`;
    $("skyBar").style.width = `${((stars - prev) / (next - prev)) * 100}%`;
  } else {
    $("skyNext").textContent = "🌕 満月がのぼりました。みんな、ありがとう。";
    $("skyBar").style.width = "100%";
  }
  $("stages").innerHTML = thresholds.map((t, i) =>
    `<div class="${stars >= t ? "done" : ""}"><b>${CAKE_STAGES[i + 1].icon}</b>${CAKE_STAGES[i + 1].name}<br>${t}</div>`).join("");

  // 今夜
  if (night < 1) {
    $("tonightTitle").textContent = `${cakeNightDate(start, 1)}の夜から始まります`;
    $("tonightText").textContent = "毎晩ちがうケーキセットが登場します。中身はMoonlightで頼んだ人だけのひみつ。";
  } else if (night > total) {
    $("tonightTitle").textContent = "18夜のケーキセットは終わりました";
    $("tonightText").textContent = "来てくれたみなさん、本当にありがとうございました。アルバムはこれからも開けます。";
  } else {
    $("tonightTitle").textContent = night === total ? "最終夜のケーキは、お店で" : "今夜のケーキは、お店でのお楽しみ";
    $("tonightText").textContent = "中身はMoonlightでケーキセットを頼んだ人だけのひみつです。";
  }

  // 最終夜の名前と寄せ書き
  if (Array.isArray(pub.names)) {
    $("finalCard").classList.remove("hidden");
    $("finalNames").innerHTML = pub.names.map((n) => `<span>${cakeEsc(n)}</span>`).join("") || '<span class="muted">まだいません</span>';
    $("finalMessages").innerHTML = (pub.messages || []).map((m) => `<div><b>${cakeEsc(m.name)}</b>${cakeEsc(m.message)}</div>`).join("");
  } else {
    $("finalCard").classList.add("hidden");
  }
}

async function loadPublic() {
  try {
    pub = await cakeRpc("cake_public");
    renderSky();
  } catch (e) {
    $("nightBadge").textContent = "⚠ " + e.message;
  }
}

// ---------- アルバム ----------
function seenKey() { return `moonlight-album-seen-${code}`; }
function getSeen() {
  try { return new Set(JSON.parse(cakeStore(seenKey()) || "[]")); } catch { return new Set(); }
}
function markSeen(night) {
  const s = getSeen();
  s.add(night);
  cakeStore(seenKey(), JSON.stringify([...s]));
}

function titleFor(count) {
  const hit = TITLES.find(([n]) => count >= n);
  return hit ? hit[1] : "";
}

function renderAlbum() {
  if (!album) return;
  const a = album;
  const total = a.total_nights;
  const count = a.visits.length;
  const byNight = new Map(a.visits.map((v) => [v.night, v]));
  const seen = getSeen();

  $("albumName").textContent = a.name;
  $("albumTitle").textContent = `${titleFor(count)}　・　${count} / ${total}夜`;
  $("myMoon").innerHTML = moonSvg(count / total, 76, true);
  $("gridCard").classList.toggle("complete", count >= total);

  let html = "";
  for (let n = 1; n <= total; n++) {
    const v = byNight.get(n);
    const date = cakeNightDate(a.start_date, n);
    const finalCls = n === total ? " final" : "";
    if (v && !seen.has(n)) {
      html += `<button class="tile sealed${finalCls}" data-open="${n}" type="button"><span class="n">第${n}夜</span><b>✉</b>開けてみる</button>`;
    } else if (v) {
      html += `<button class="tile got${v.together.length ? " pair" : ""}${finalCls}" data-show="${n}" type="button"><span class="n">${date}</span>
        <img src="${cakeEsc(v.image)}" alt="" loading="lazy"><span class="t">${cakeEsc(v.cake)}</span></button>`;
    } else if (n === a.night) {
      html += `<div class="tile today${finalCls}"><span class="n">${date}</span>今夜<br>？</div>`;
    } else if (n < a.night) {
      html += `<div class="tile passed${finalCls}"><span class="n">${date}</span>🌫<br>夜空の向こう</div>`;
    } else {
      html += `<div class="tile${finalCls}"><span class="n">${date}</span>？</div>`;
    }
  }
  $("grid").innerHTML = html;

  // 一緒に来た夜
  const pairs = a.visits.filter((v) => v.together.length && seen.has(v.night));
  $("pairCard").classList.toggle("hidden", !pairs.length);
  $("pairs").innerHTML = pairs.map((v) => `<div class="pair-card"><img src="${cakeEsc(v.image)}" alt="">
      <div><div class="small muted">第${v.night}夜 ${cakeNightDate(a.start_date, v.night)}</div>
      <div class="names">${cakeEsc(a.name)} と ${v.together.map(cakeEsc).join("、")}</div>
      <div class="small">${cakeEsc(v.cake)}</div></div></div>`).join("");

  // 明日の予告
  const t = a.teaser;
  if (t) {
    $("teaser").innerHTML = `<img src="${cakeEsc(t.silhouette)}" alt="明日のケーキのシルエット">
      <div><div class="small muted">第${t.night}夜 ${cakeNightDate(a.start_date, t.night)}</div>
      <div class="hint">${cakeEsc(t.hint)}</div>
      <div class="small muted" style="margin-top:6px">正体は、明日の夜Moonlightで。</div></div>`;
    $("teaserCard").classList.remove("hidden");
  } else if (a.night >= 1 && a.night < total) {
    $("teaser").innerHTML = `<div class="small muted">今夜ケーキセットを頼むと、明日のケーキのヒントがここに届きます。</div>`;
    $("teaserCard").classList.remove("hidden");
  } else {
    $("teaserCard").classList.add("hidden");
  }

  if (document.activeElement !== $("messageInput")) {
    $("messageInput").value = a.message || "";
    updateCount();
  }
}

function showCard(n, reveal) {
  const v = album?.visits.find((x) => x.night === n);
  if (!v) return;
  const isFinal = n === album.total_nights;
  $("modalCard").className = "modal-card" + (reveal ? " reveal" : "");
  $("modalCard").innerHTML = `
    <div class="kicker">第${n}夜 ・ ${cakeNightDate(album.start_date, n)}${isFinal ? " ・ 満月の夜" : ""}</div>
    <img src="${cakeEsc(v.image)}" alt="${cakeEsc(v.cake)}">
    <h3>${cakeEsc(v.cake)}</h3>
    <p class="drink">＋ ${cakeEsc(v.drink)}</p>
    <p class="pr">${cakeEsc(v.pr)}</p>
    ${v.together.length ? `<div class="with">🫖 ${v.together.map(cakeEsc).join("、")} と一緒に</div>` : ""}
    ${isFinal ? `<p class="small" style="color:var(--gold2)">満月の夜に来てくれて、ありがとう。</p>` : ""}
    <div><button class="btn" type="button" id="modalClose">${reveal ? "アルバムにしまう" : "閉じる"}</button></div>`;
  $("modal").classList.remove("hidden");
  $("modalClose").focus();
  if (reveal) markSeen(n);
}

function closeModal() {
  $("modal").classList.add("hidden");
  renderAlbum();
}

async function openAlbum(c, { quiet = false } = {}) {
  code = c;
  try {
    album = await cakeRpc("cake_album", { p_code: c });
    cakeStore(CODE_KEY, c);
    $("openCard").classList.add("hidden");
    $("aboutCard").classList.add("hidden");
    $("albumView").classList.remove("hidden");
    $("codeError").textContent = "";
    // 夜空の数字もアルバムの結果で更新
    if (pub) { pub.stars = album.stars; pub.stage = album.stage; renderSky(); }
    renderAlbum();
    return true;
  } catch (e) {
    if (!quiet) $("codeError").textContent = e.message;
    if (/見つかりません/.test(e.message)) cakeStore(CODE_KEY, null);
    return false;
  }
}

function closeAlbum() {
  album = null;
  code = "";
  cakeStore(CODE_KEY, null);
  $("albumView").classList.add("hidden");
  $("openCard").classList.remove("hidden");
  $("aboutCard").classList.remove("hidden");
  $("codeInput").value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateCount() {
  $("messageCount").textContent = `${$("messageInput").value.length} / 80`;
}

async function saveMessage() {
  const btn = $("messageBtn");
  btn.disabled = true;
  try {
    const r = await cakeRpc("cake_set_message", { p_code: code, p_message: $("messageInput").value });
    if (album) album.message = r.message;
    toast(r.message ? "ひとことを残しました" : "ひとことを消しました");
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
  }
}

async function refresh() {
  await loadPublic();
  if (code) await openAlbum(code, { quiet: true });
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (!document.hidden) refresh(); }, 45000);
}

// ---------- 起動 ----------
function start() {
  paintBgStars();
  $("codeInput").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
    $("codeError").textContent = "";
  });
  $("codeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = $("codeInput").value;
    if (!/^\d{4}$/.test(c)) { $("codeError").textContent = "4桁の数字を入れてください"; return; }
    openAlbum(c);
  });
  $("grid").addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    const show = e.target.closest("[data-show]");
    if (open) showCard(Number(open.dataset.open), true);
    else if (show) showCard(Number(show.dataset.show), false);
  });
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.id === "modalClose") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modal").classList.contains("hidden")) closeModal(); });
  $("closeBtn").addEventListener("click", closeAlbum);
  $("reloadBtn").addEventListener("click", async () => { await refresh(); toast("最新の状態にしました"); });
  $("messageInput").addEventListener("input", updateCount);
  $("messageBtn").addEventListener("click", saveMessage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

  loadPublic().then(() => {
    const saved = cakeStore(CODE_KEY);
    if (saved && /^\d{4}$/.test(saved)) openAlbum(saved, { quiet: true });
  });
  startPolling();
}

start();
