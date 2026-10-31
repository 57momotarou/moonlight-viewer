// staff.js — 従業員用ケーキ受付：合言葉 → 名前を選ぶ → 記録。新しい人には4桁の番号を発行。
"use strict";

const PASS_KEY = "moonlight-cake-staff-pass";
const STAFF_KEY = "moonlight-cake-staff-name";
const $ = (id) => document.getElementById(id);
let pass = "";
let staff = "";
let info = null;
let chips = [];        // { name, isNew, code }
let suggestions = [];
let searchTimer = null;
let searchSeq = 0;

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add("hidden"), 2600);
}

function nameKey(s) {
  return String(s || "").normalize("NFKC").replace(/[\s　・･]+/g, "")
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)).toLowerCase();
}

function cleanName(s) {
  return String(s || "").trim().replace(/[\s　]+/g, " ");
}

function timeText(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

function renderBadge() {
  if (!info) return;
  const { night, total_nights: total, start_date: start } = info;
  let text;
  if (night < 1) text = `🌑 開始前（${cakeNightDate(start, 1)}から）`;
  else if (night > total) text = "🌕 企画は終了しました";
  else text = `🌙 第${night}夜 ${cakeNightDate(start, night)}${night === total ? "（最終夜）" : ""}`;
  $("nightBadge").textContent = text;
}

// ---------- 合言葉 ----------
async function login(p, s, { quiet = false } = {}) {
  try {
    info = await cakeRpc("cake_staff_login", { p_pass: p });
    pass = p;
    staff = s;
    cakeStore(PASS_KEY, p);
    cakeStore(STAFF_KEY, s);
    $("loginCard").classList.add("hidden");
    $("deskView").classList.remove("hidden");
    renderBadge();
    loadTonight();
    $("nameInput").focus();
  } catch (e) {
    if (!quiet) $("loginError").textContent = e.message;
    cakeStore(PASS_KEY, null);
  }
}

function logout() {
  pass = "";
  cakeStore(PASS_KEY, null);
  chips = [];
  renderChips();
  $("deskView").classList.add("hidden");
  $("loginCard").classList.remove("hidden");
  $("passInput").value = "";
}

// ---------- 名前の候補 ----------
function renderSuggest() {
  const typed = cleanName($("nameInput").value);
  if (!typed) { $("suggest").innerHTML = ""; return; }
  const key = nameKey(typed);
  const exact = suggestions.some((s) => nameKey(s.name) === key);
  let html = suggestions.map((s, i) => {
    const inChips = chips.some((c) => nameKey(c.name) === nameKey(s.name));
    const meta = s.tonight ? "今夜は記録済み" : `${s.visits}夜 ・ No.${s.code}`;
    return `<button type="button" data-i="${i}" class="${s.tonight || inChips ? "done" : ""}">
      <span>${cakeEsc(s.name)}</span><span class="meta">${inChips ? "追加済み" : cakeEsc(meta)}</span></button>`;
  }).join("");
  if (!exact) {
    html += `<button type="button" data-new="1" class="new"><span>＋ 新しく登録：${cakeEsc(typed)}</span><span class="meta">初めての人</span></button>`;
  }
  $("suggest").innerHTML = html;
}

function search() {
  const q = cleanName($("nameInput").value);
  clearTimeout(searchTimer);
  if (!q) { suggestions = []; renderSuggest(); return; }
  renderSuggest();
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    try {
      const res = await cakeRpc("cake_staff_search", { p_pass: pass, p_query: q });
      if (seq !== searchSeq) return;
      suggestions = Array.isArray(res) ? res : [];
      renderSuggest();
    } catch (e) {
      toast(e.message);
    }
  }, 220);
}

function addChip(item) {
  if (chips.some((c) => nameKey(c.name) === nameKey(item.name))) return;
  chips.push(item);
  $("nameInput").value = "";
  suggestions = [];
  renderSuggest();
  renderChips();
  $("nameInput").focus();
}

function renderChips() {
  $("chips").innerHTML = chips.map((c, i) => `<span class="chip">${cakeEsc(c.name)}${c.isNew ? '<span class="tag">新規</span>' : ""}
    <button type="button" data-rm="${i}" aria-label="${cakeEsc(c.name)}を外す">×</button></span>`).join("");
  const n = chips.length;
  $("recordBtn").disabled = n === 0;
  $("recordBtn").textContent = n > 1 ? `ケーキセットを記録（${n}人・一緒に来た）` : "ケーキセットを記録";
  $("recordError").textContent = "";
}

// ---------- 記録 ----------
async function record() {
  if (!chips.length) return;
  const news = chips.filter((c) => c.isNew).map((c) => c.name);
  if (news.length && !confirm(`初めてのお客さんとして登録します。\n\n${news.join("\n")}\n\n名前のまちがいはないですか？`)) return;
  const btn = $("recordBtn");
  btn.disabled = true;
  try {
    const res = await cakeRpc("cake_staff_record", { p_pass: pass, p_staff: staff, p_names: chips.map((c) => c.name) });
    $("result").innerHTML = res.records.map((r) => {
      if (r.already) return `<div class="r"><b>${cakeEsc(r.name)}</b><div class="small muted">今夜はもう記録済みです（スタンプは1晩1つ）。番号 ${cakeEsc(r.code)}</div></div>`;
      if (r.is_new) return `<div class="r new"><b>${cakeEsc(r.name)}</b>　はじめてのお客さん<div class="code">${cakeEsc(r.code)}</div>
        <div class="small">「アルバム番号は <b>${cakeEsc(r.code)}</b> です」と伝えてください</div></div>`;
      return `<div class="r"><b>${cakeEsc(r.name)}</b>　${r.visits}夜目<div class="small muted">アルバム番号 ${cakeEsc(r.code)}</div></div>`;
    }).join("") + (res.records.length > 1 ? `<div class="small muted">🫖 一緒に来た人としてまとめました</div>` : "");
    $("resultCard").classList.remove("hidden");
    chips = [];
    renderChips();
    loadTonight();
    toast("記録しました");
  } catch (e) {
    $("recordError").textContent = e.message;
    if (/合言葉/.test(e.message)) logout();
  } finally {
    btn.disabled = chips.length === 0;
  }
}

async function loadTonight() {
  try {
    const res = await cakeRpc("cake_staff_tonight", { p_pass: pass });
    if (info) { info.night = res.night; renderBadge(); }
    const groups = new Map();
    res.records.forEach((r) => { if (r.group_id) groups.set(r.group_id, (groups.get(r.group_id) || 0) + 1); });
    $("tonightCount").textContent = `${res.records.length}人`;
    $("tonightList").innerHTML = res.records.map((r) => `<div class="li">
        <div><b>${cakeEsc(r.name)}</b>${r.group_id && groups.get(r.group_id) > 1 ? " 🫖" : ""}
        <div class="meta">${timeText(r.recorded_at)} ・ No.${cakeEsc(r.code)} ・ ${cakeEsc(r.staff || "")}</div></div>
        <button class="btn ghost sm" type="button" data-undo="${cakeEsc(r.id)}" data-name="${cakeEsc(r.name)}">取消</button></div>`).join("")
      || '<div class="small muted">まだ記録はありません</div>';
  } catch (e) {
    toast(e.message);
  }
}

async function undo(id, name) {
  if (!confirm(`${name} さんの今夜の記録を取り消しますか？`)) return;
  try {
    await cakeRpc("cake_staff_undo", { p_pass: pass, p_visit_id: id });
    toast("取り消しました");
    loadTonight();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- 起動 ----------
function start() {
  $("staffInput").value = cakeStore(STAFF_KEY) || "";
  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = $("passInput").value;
    const s = cleanName($("staffInput").value);
    if (!p) { $("loginError").textContent = "合言葉を入れてください"; return; }
    if (!s) { $("loginError").textContent = "あなたの名前を入れてください"; return; }
    $("loginError").textContent = "";
    login(p, s);
  });
  $("logoutBtn").addEventListener("click", logout);
  $("nameInput").addEventListener("input", search);
  $("nameInput").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    const first = $("suggest").querySelector("button:not(.done)");
    if (first) first.click();
  });
  $("suggest").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.new) {
      addChip({ name: cleanName($("nameInput").value), isNew: true, code: "" });
    } else {
      const s = suggestions[Number(b.dataset.i)];
      if (s.tonight) { toast(`${s.name} さんは今夜もう記録済みです`); }
      addChip({ name: s.name, isNew: false, code: s.code });
    }
  });
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]");
    if (!b) return;
    chips.splice(Number(b.dataset.rm), 1);
    renderChips();
    renderSuggest();
  });
  $("recordBtn").addEventListener("click", record);
  $("tonightList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-undo]");
    if (b) undo(b.dataset.undo, b.dataset.name);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && pass) loadTonight(); });

  const saved = cakeStore(PASS_KEY);
  const savedStaff = cakeStore(STAFF_KEY);
  if (saved && savedStaff) login(saved, savedStaff, { quiet: true });
}

start();
