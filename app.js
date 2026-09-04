(() => {
  "use strict";

  const CONFIG_STORAGE = "moonlight-viewer-connection";
  const SESSION_STORAGE = "moonlight-viewer-session";
  const EMAIL_STORAGE = "moonlight-viewer-email";
  const ROLE_ORDER = ["店長", "副店長", "チーフ", "スタッフ", "黒市民スタッフ", "アルバイト"];
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const els = {
    startupSplash: $("#startupSplash"),
    startupText: $("#startupText"),
    startupProgressBar: $("#startupProgressBar"),
    loginScreen: $("#loginScreen"),
    viewerScreen: $("#viewerScreen"),
    connectionSetup: $("#connectionSetup"),
    setupUrl: $("#setupUrl"),
    setupKey: $("#setupKey"),
    saveConnectionBtn: $("#saveConnectionBtn"),
    toggleSetupBtn: $("#toggleSetupBtn"),
    loginForm: $("#loginForm"),
    emailInput: $("#emailInput"),
    passwordInput: $("#passwordInput"),
    loginStatus: $("#loginStatus"),
    refreshBtn: $("#refreshBtn"),
    logoutBtn: $("#logoutBtn"),
    loadingOverlay: $("#loadingOverlay"),
    toast: $("#toast"),
    cloudMeta: $("#cloudMeta"),
    overviewCards: $("#overviewCards"),
    overviewExtraDetails: $("#overviewExtraDetails"),
    overviewAchievements: $("#overviewAchievements"),
    overviewRetiredAchievements: $("#overviewRetiredAchievements"),
    overviewActiveCount: $("#overviewActiveCount"),
    overviewRetiredCount: $("#overviewRetiredCount"),
    salesList: $("#salesList"),
    salesSummaryPanel: $("#salesSummaryPanel"),
    salesSummaryMode: $("#salesSummaryMode"),
    salesSummaryTotals: $("#salesSummaryTotals"),
    salesSummaryList: $("#salesSummaryList"),
    deliveryList: $("#deliveryList"),
    buyersList: $("#buyersList"),
    productsList: $("#productsList"),
    inventoryLatest: $("#inventoryLatest"),
    inventoryHistory: $("#inventoryHistory"),
    bonusSummary: $("#bonusSummary"),
    bonusCurrent: $("#bonusCurrent"),
    payoutHistory: $("#payoutHistory"),
    coinHistorySummary: $("#coinHistorySummary"),
    coinHistoryList: $("#coinHistoryList"),
    employeeList: $("#employeeList"),
    moreSheet: $("#moreSheet"),
    closeMoreBtn: $("#closeMoreBtn"),
    salesDetailModal: $("#salesDetailModal"),
    salesDetailTitle: $("#salesDetailTitle"),
    salesDetailContent: $("#salesDetailContent"),
    closeSalesDetailBtn: $("#closeSalesDetailBtn"),
    buyerDetailModal: $("#buyerDetailModal"),
    buyerDetailTitle: $("#buyerDetailTitle"),
    buyerDetailContent: $("#buyerDetailContent"),
    closeBuyerDetailBtn: $("#closeBuyerDetailBtn"),
    employeeDetailModal: $("#employeeDetailModal"),
    employeeDetailTitle: $("#employeeDetailTitle"),
    employeeDetailContent: $("#employeeDetailContent"),
    closeEmployeeDetailBtn: $("#closeEmployeeDetailBtn")
  };

  let state = {};
  let cloud = { version: 0, updatedAt: "" };
  let refreshTimer = null;
  let swRegistration = null;
  let reloadedFromUpdate = false;

  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const money = (v) => `$${Math.round(num(v)).toLocaleString("en-US")}`;
  const qty = (v) => `${Math.round(num(v)).toLocaleString("ja-JP")}個`;
  const roundUpThousand = (v) => num(v) > 0 ? Math.ceil(num(v) / 1000) * 1000 : 0;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const categoryLabel = (v) => ({ food: "食べ物", drink: "飲み物", joint: "ジョイント" }[v] || v || "-");
  const statusLabel = (e) => (e?.status === "retired" ? "退職" : "在籍");
  const activeEmployee = (e) => e?.status !== "retired";

  function effectiveCoinUnitAmount(settings = {}) {
    const saved = Math.max(0, num(settings.coinUnitAmount));
    if (settings.bonusCoinDefaultV2 === true) return saved || 80000;
    return saved === 0 || saved === 30000 ? 80000 : saved;
  }

  function roleFixedBonus(employee, settings = {}) {
    if (!employee || employee.role === "店長") return 0;
    return Math.max(0, Math.round(num(settings.roleBonuses?.[employee.role] ?? 0)));
  }

  function setSplash(message, progress = 0) {
    if (els.startupText) els.startupText.textContent = message;
    if (els.startupProgressBar) els.startupProgressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }

  function hideSplash(delay = 220) {
    setTimeout(() => els.startupSplash?.classList.add("hidden"), delay);
  }

  function preventDoubleTapZoom() {
    let lastTouchEnd = 0;
    document.addEventListener(
      "touchend",
      (event) => {
        const now = Date.now();
        const isFormControl = event.target.closest("input, textarea, select, label");
        if (!isFormControl && now - lastTouchEnd < 280) {
          event.preventDefault();
        }
        lastTouchEnd = now;
      },
      { passive: false }
    );
  }

  function invoiceAt(v) {
    const s = String(v || "");
    if (!s) return "-";
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?/);
    if (!m) return esc(s);
    return `${m[1]}/${m[2]}/${m[3]} ${m[4] || "00"}:${m[5] || "00"}`;
  }

  function dateOnly(v) {
    const s = String(v || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replaceAll("-", "/") : "-";
  }

  function connection() {
    const bundled = window.MOONLIGHT_CONFIG || {};
    let local = {};
    try {
      local = JSON.parse(localStorage.getItem(CONFIG_STORAGE) || "{}");
    } catch {}
    return {
      url: String(local.url || bundled.supabaseUrl || "").trim().replace(/\/+$/, ""),
      key: String(local.key || bundled.publishableKey || "").trim()
    };
  }

  function session() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_STORAGE) || "null");
    } catch {
      return null;
    }
  }

  function saveSession(s) {
    localStorage.setItem(SESSION_STORAGE, JSON.stringify(s));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_STORAGE);
  }

  function showLoading(on) {
    els.loadingOverlay.classList.toggle("hidden", !on);
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove("hidden");
    setTimeout(() => els.toast.classList.add("hidden"), 2400);
  }

  function empty(text) {
    return `<div class="empty-state">${esc(text)}</div>`;
  }

  async function authFetch(path, options = {}, allowRefresh = true) {
    const c = connection();
    const s = session();
    if (!c.url || !c.key) throw new Error("Supabase接続設定がありません");
    if (!s?.access_token) throw new Error("ログインが必要です");
    const headers = new Headers(options.headers || {});
    headers.set("apikey", c.key);
    headers.set("Authorization", `Bearer ${s.access_token}`);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const res = await fetch(c.url + path, { ...options, headers, cache: "no-store" });
    if (res.status === 401 && allowRefresh && s.refresh_token) {
      await refreshSession();
      return authFetch(path, options, false);
    }
    return res;
  }

  async function refreshSession() {
    const c = connection();
    const s = session();
    if (!s?.refresh_token) throw new Error("再ログインが必要です");
    const res = await fetch(`${c.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: c.key, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
      cache: "no-store"
    });
    if (!res.ok) {
      clearSession();
      throw new Error("ログイン期限が切れました");
    }
    const next = await res.json();
    saveSession(next);
    return next;
  }

  async function login(email, password) {
    const c = connection();
    if (!c.url || !c.key) throw new Error("先にSupabase接続設定を保存してください");
    const res = await fetch(`${c.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: c.key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store"
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error_description || body?.msg || "ログインに失敗しました");
    saveSession(body);
    localStorage.setItem(EMAIL_STORAGE, email);
  }

  async function loadCloud() {
    const res = await authFetch("/rest/v1/moonlight_state?id=eq.1&select=data,version,updated_at");
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`クラウド読込に失敗しました (${res.status}) ${body}`.trim());
    }
    const rows = await res.json();
    if (!rows?.length) throw new Error("moonlight_state が見つかりません");
    state = rows[0].data || {};
    cloud = { version: num(rows[0].version), updatedAt: String(rows[0].updated_at || "") };
    renderAll();
  }

  function roleIndex(role) {
    const i = ROLE_ORDER.indexOf(role);
    return i < 0 ? ROLE_ORDER.length : i;
  }

  function sortedEmployees() {
    return [...(state.employees || [])].sort((a, b) => roleIndex(a.role) - roleIndex(b.role) || String(a.name || "").localeCompare(String(b.name || ""), "ja"));
  }

  function recordAmounts(r) {
    let food = num(r.foodQty) * num(r.foodUnitPrice ?? (num(r.foodQty) ? 30000 : 0));
    let drink = num(r.drinkQty) * num(r.drinkUnitPrice ?? (num(r.drinkQty) ? 30000 : 0));
    let joint = num(r.jointQty) * num(r.jointUnitPrice ?? (num(r.jointQty) ? 50000 : 0));
    for (const item of Array.isArray(r.customItems) ? r.customItems : []) {
      const amount = num(item.totalAmount) || num(item.count) * num(item.unitPrice);
      if (item.category === "food") food += amount;
      if (item.category === "drink") drink += amount;
      if (item.category === "joint") joint += amount;
    }
    const other = num(r.otherAmount);
    return { food, drink, joint, other, total: food + drink + joint + other };
  }

  function recordCategoryQty(r, category) {
    const custom = (Array.isArray(r.customItems) ? r.customItems : [])
      .filter((item) => item.category === category)
      .reduce((sum, item) => sum + num(item.count), 0);
    return num(r[`${category}Qty`]) + custom;
  }

  function bonusCoins(e) {
    return Math.max(0, num(e?.bonusCoins ?? e?.coins ?? 0));
  }

  function employeeForRecord(r) {
    return (state.employees || []).find((e) => String(e.id) === String(r.employeeId)) || (state.employees || []).find((e) => String(e.name || "") === String(r.employeeName || "")) || null;
  }

  function employeeSalesMap() {
    const map = new Map();
    for (const e of state.employees || []) map.set(String(e.id), { food: 0, drink: 0, joint: 0, other: 0, total: 0 });
    for (const r of state.dailySales || []) {
      const e = employeeForRecord(r);
      const id = e?.id || r.employeeId || r.employeeName;
      if (!id) continue;
      if (!map.has(String(id))) map.set(String(id), { food: 0, drink: 0, joint: 0, other: 0, total: 0 });
      const a = recordAmounts(r);
      const t = map.get(String(id));
      for (const k of ["food", "drink", "joint", "other", "total"]) t[k] += a[k];
    }
    return map;
  }

  function coinHistorySourceLabel(source) {
    return ({
      manual: "コイン登録",
      opening: "履歴導入前",
      initial: "初期登録",
      adjustment: "累計修正"
    })[source] || "コイン登録";
  }

  function coinHistoryRows() {
    const historyProvided = Array.isArray(state.coinHistory);
    const rows = (historyProvided ? state.coinHistory : []).map((raw, index) => {
      const employeeName = String(raw.employeeName || raw.employee_name || "").trim();
      const matchedEmployee = (state.employees || []).find(employee => String(employee.id) === String(raw.employeeId || raw.employee_id || ""))
        || (state.employees || []).find(employee => String(employee.name || "") === employeeName);
      const source = ["manual", "opening", "initial", "adjustment"].includes(raw.source) ? raw.source : "manual";
      return {
        id: String(raw.id || `coin-${index}`),
        employeeId: String(matchedEmployee?.id || raw.employeeId || raw.employee_id || ""),
        employeeName: matchedEmployee?.name || employeeName || "-",
        amount: Math.round(num(raw.amount ?? raw.coins ?? raw.quantity ?? 0)),
        recordedAt: String(raw.recordedAt || raw.registeredAt || ""),
        createdAt: String(raw.createdAt || ""),
        source,
        note: String(raw.note || "").trim(),
        _index: index
      };
    });

    const registeredTotals = new Map();
    for (const entry of rows) {
      if (!entry.employeeId) continue;
      registeredTotals.set(entry.employeeId, (registeredTotals.get(entry.employeeId) || 0) + entry.amount);
    }
    for (const employee of state.employees || []) {
      const employeeId = String(employee.id || "");
      const difference = Math.max(0, Math.round(num(employee.coins))) - (registeredTotals.get(employeeId) || 0);
      if (!employeeId || difference === 0) continue;
      rows.push({
        id: `coin-balance-${employeeId}`,
        employeeId,
        employeeName: employee.name || "-",
        amount: difference,
        recordedAt: "",
        createdAt: "",
        source: historyProvided ? "adjustment" : "opening",
        note: historyProvided ? "累計コインとの差額" : "履歴機能追加前の累計",
        _index: rows.length
      });
    }

    const balances = new Map();
    return rows
      .sort((a, b) => String(a.recordedAt || "").localeCompare(String(b.recordedAt || "")) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || a._index - b._index)
      .map(entry => {
        const balance = (balances.get(entry.employeeId) || 0) + entry.amount;
        balances.set(entry.employeeId, balance);
        return { ...entry, balance };
      })
      .sort((a, b) => String(b.recordedAt || "").localeCompare(String(a.recordedAt || "")) || b._index - a._index);
  }

  function buyerKey(v) {
    return String(v || "").normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/\s+/g, "").trim();
  }

  function buyerProfiles() {
    return (state.buyers || [])
      .map((b) => ({
        id: String(b.id || ""),
        name: String(b.name || b.displayName || "").trim(),
        aliases: Array.isArray(b.aliases) ? b.aliases.map(String).filter(Boolean) : []
      }))
      .filter((b) => b.name);
  }

  function findBuyer(name) {
    const k = buyerKey(name);
    if (!k) return null;
    return buyerProfiles().find((b) => [b.name, ...b.aliases].some((v) => buyerKey(v) === k)) || null;
  }

  function buyerSummary() {
    const map = new Map();
    const ensure = (name, at = "") => {
      if (!name) return null;
      const p = findBuyer(name);
      const key = p ? `p:${p.id}` : `n:${buyerKey(name)}`;
      if (!key) return null;
      if (!map.has(key)) map.set(key, { name: p?.name || name, aliases: p?.aliases || [], count: 0, store: 0, delivery: 0, last: "", food: 0, drink: 0, joint: 0, other: 0 });
      const row = map.get(key);
      if (at && (!row.last || at > row.last)) row.last = at;
      return row;
    };
    for (const p of buyerProfiles()) ensure(p.name);
    for (const r of state.dailySales || []) {
      const x = ensure(r.buyerName, r.invoiceAt || r.saleDate);
      if (!x) continue;
      x.count++;
      x.store++;
      x.food += recordCategoryQty(r, "food");
      x.drink += recordCategoryQty(r, "drink");
      x.joint += recordCategoryQty(r, "joint");
      x.other += num(r.otherAmount);
    }
    for (const d of state.deliveryOrders || []) {
      const x = ensure(d.buyerName, d.recordedAt);
      if (!x) continue;
      x.count++;
      x.delivery++;
      x.food += num(d.foodQty);
      x.drink += num(d.drinkQty);
      x.joint += num(d.jointQty);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || String(b.last).localeCompare(String(a.last)) || a.name.localeCompare(b.name, "ja"));
  }

  function employeeDetailButton(employeeId, employeeName) {
    return `<span class="employee-detail-label">${esc(employeeName || "-")}</span>`;
  }

  function closeEmployeeDetail() {
    if (!els.employeeDetailModal) return;
    els.employeeDetailModal.classList.add("hidden");
    els.employeeDetailModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("detail-open");
  }

  function employeeDetailData(employeeId) {
    const employee = (state.employees || []).find((item) => String(item.id) === String(employeeId));
    if (!employee) return null;
    const records = (state.dailySales || [])
      .filter((r) => String(employeeForRecord(r)?.id || r.employeeId || "") === String(employee.id))
      .sort((a, b) => String(b.invoiceAt || b.saleDate || "").localeCompare(String(a.invoiceAt || a.saleDate || "")));
    const totals = records.reduce((acc, r) => {
      const a = recordAmounts(r);
      acc.food += a.food;
      acc.drink += a.drink;
      acc.joint += a.joint;
      acc.other += a.other;
      acc.total += a.total;
      return acc;
    }, { food: 0, drink: 0, joint: 0, other: 0, total: 0 });
    const current = currentBonusEntries().find((entry) => String(entry.e.id) === String(employee.id)) || null;
    const payouts = [];
    for (const payout of state.payoutHistory || []) {
      const entry = (payout.entries || payout.payouts || []).find((x) => String(x.employeeId || "") === String(employee.id) || String(x.employeeName || x.name || "") === String(employee.name || ""));
      if (entry) payouts.push({ date: payout.payoutDate || "-", amount: num(entry.amount), start: payout.periodStart || payout.bonusStartDate || "-", end: payout.periodEnd || payout.bonusEndDate || "-" });
    }
    payouts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { employee, records, totals, current, payouts };
  }

  function openEmployeeDetail(employeeId) {
    const detail = employeeDetailData(employeeId);
    if (!detail || !els.employeeDetailModal || !els.employeeDetailContent) return;
    const { employee, records, totals, current, payouts } = detail;
    els.employeeDetailTitle.textContent = employee.name || "従業員詳細";
    const aliases = Array.isArray(employee.aliases) && employee.aliases.length ? employee.aliases.join(" / ") : "なし";
    const recent = records.slice(0, 8).map((r) => {
      const a = recordAmounts(r);
      const detailParts = [
        recordCategoryQty(r, "food") > 0 ? `食べ物 ${qty(recordCategoryQty(r, "food"))} = ${money(a.food)}` : "",
        recordCategoryQty(r, "drink") > 0 ? `飲み物 ${qty(recordCategoryQty(r, "drink"))} = ${money(a.drink)}` : "",
        recordCategoryQty(r, "joint") > 0 ? `ジョイント ${qty(recordCategoryQty(r, "joint"))} = ${money(a.joint)}` : "",
        a.other > 0 ? `その他 ${money(a.other)}` : ""
      ].filter(Boolean).map((line) => `<span>${line}</span>`).join("");
      return `<article class="detail-sale-row detail-sale-row-expanded"><div><strong>${invoiceAt(r.invoiceAt || r.saleDate)}</strong><span>${esc(r.buyerName || "-")}</span><div class="detail-sale-breakdown">${detailParts || '<span>内訳なし</span>'}</div></div><div class="money sm">${money(a.total)}</div></article>`;
    }).join("") || `<div class="empty-state">販売実績はありません</div>`;
    const payoutRows = payouts.slice(0, 5).map((p) => `<article class="detail-sale-row"><div><strong>${dateOnly(p.date)}</strong><span>${dateOnly(p.start)}〜${dateOnly(p.end)}</span></div><div class="money sm">${money(p.amount)}</div></article>`).join("") || `<div class="empty-state">支給履歴はありません</div>`;

    els.employeeDetailContent.innerHTML = `
      <div class="detail-profile-grid">
        <div><span>役職</span><strong>${esc(employee.role || "-")}</strong></div>
        <div><span>状態</span><strong>${esc(statusLabel(employee))}</strong></div>
        <div><span>コイン累計</span><strong>${Math.round(num(employee.coins)).toLocaleString("ja-JP")}枚</strong></div>
        <div><span>今回のボーナス対象</span><strong>${Math.round(bonusCoins(employee)).toLocaleString("ja-JP")}枚</strong></div>
        <div><span>販売記録</span><strong>${records.length.toLocaleString("ja-JP")}件</strong></div>
      </div>
      <div class="detail-alias"><span>請求名 / 別名</span><strong>${esc(aliases)}</strong></div>
      <div class="breakdown-grid detail-money-grid">
        ${amountCell("食べ物売上", money(totals.food))}
        ${amountCell("飲み物売上", money(totals.drink))}
        ${amountCell("ジョイント売上", money(totals.joint))}
        ${amountCell("その他売上", money(totals.other))}
        ${amountCell("売上合計", money(totals.total), "累計")}
        ${amountCell("今回の支給額", current ? money(current.amount) : "-", "ボーナス")}
      </div>
      <div class="detail-section"><h3>最近の販売実績</h3><div class="detail-list">${recent}</div></div>
      <div class="detail-section"><h3>支給履歴</h3><div class="detail-list">${payoutRows}</div></div>
    `;
    els.employeeDetailModal.classList.remove("hidden");
    els.employeeDetailModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("detail-open");
  }

  function renderOverview() {
    const activeEmployees = sortedEmployees().filter(activeEmployee);
    const retiredEmployees = sortedEmployees().filter((employee) => !activeEmployee(employee));
    const active = activeEmployees.length;
    const allRecords = state.dailySales || [];
    const allAmounts = allRecords.reduce((total, record) => total + recordAmounts(record).total, 0);
    const totalBreakdown = allRecords.reduce((totals, record) => {
      const amount = recordAmounts(record);
      totals.food += amount.food;
      totals.drink += amount.drink;
      totals.joint += amount.joint;
      totals.other += amount.other;
      return totals;
    }, { food: 0, drink: 0, joint: 0, other: 0 });
    const today = new Date();
    const y = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const todayRecords = allRecords.filter((record) => String(record.invoiceAt || record.saleDate || "").slice(0, 10) === y);
    const todayAmount = todayRecords.reduce((total, record) => total + recordAmounts(record).total, 0);
    const lastPayout = [...(state.payoutHistory || [])].sort((a, b) => String(b.payoutDate || "").localeCompare(String(a.payoutDate || "")))[0];
    const buyers = buyerSummary();
    const deliveryCount = (state.deliveryOrders || []).length;

    els.cloudMeta.textContent = "";
    els.overviewCards.innerHTML = `
      <span class="overview-summary-hint">タップで詳細</span>
      <div class="overview-summary-grid">
        <div><span>在籍人数</span><strong>${active}人</strong></div>
        <div><span>今日の売上</span><strong>${money(todayAmount)}</strong></div>
        <div><span>最終支給日</span><strong>${lastPayout?.payoutDate ? dateOnly(lastPayout.payoutDate) : "-"}</strong></div>
      </div>
    `;
    els.overviewExtraDetails.innerHTML = `
      <div class="overview-detail-grid">
        ${amountCell("食べ物売上", money(totalBreakdown.food))}
        ${amountCell("飲み物売上", money(totalBreakdown.drink))}
        ${amountCell("ジョイント売上", money(totalBreakdown.joint))}
        ${amountCell("その他売上", money(totalBreakdown.other))}
        ${amountCell("売上合計", money(allAmounts), `${allRecords.length.toLocaleString("ja-JP")}伝票`)}
        ${amountCell("今日の伝票", `${todayRecords.length.toLocaleString("ja-JP")}件`)}
        ${amountCell("購入者", `${buyers.length.toLocaleString("ja-JP")}人`)}
        ${amountCell("デリバリー", `${deliveryCount.toLocaleString("ja-JP")}件`)}
      </div>
      <p class="overview-cloud-note">クラウド version ${cloud.version} / ${cloud.updatedAt ? new Date(cloud.updatedAt).toLocaleString("ja-JP") : "-"}</p>
    `;

    const salesMap = employeeSalesMap();
    const employeeCards = (employees, retired = false) => employees.map((employee) => {
      const sales = salesMap.get(String(employee.id)) || { food: 0, drink: 0, joint: 0, other: 0, total: 0 };
      return `<article class="overview-employee-card employee-detail-area${retired ? " retired" : ""}" data-employee-area="${esc(employee.id)}">
        <div>
          <strong>${esc(employee.name)}</strong>
          <span>${esc(employee.role || "-")}${retired ? ' ・ <b class="retired-label">退職</b>' : ""}</span>
        </div>
        <div class="overview-employee-total"><span>売上合計</span><strong>${money(sales.total)}</strong></div>
        <span class="overview-chevron">›</span>
      </article>`;
    }).join("");
    els.overviewAchievements.innerHTML = employeeCards(activeEmployees) || empty("在籍者がいません");
    els.overviewRetiredAchievements.innerHTML = employeeCards(retiredEmployees, true) || empty("退職者がいません");
    els.overviewActiveCount.textContent = `${activeEmployees.length}人`;
    els.overviewRetiredCount.textContent = `${retiredEmployees.length}人`;
  }

  function amountCell(label, amount, note = "") {
    return `<div class="breakdown-cell${note && note.startsWith("+") ? " accent" : ""}"><span class="cell-label">${label}</span><strong>${amount}</strong>${note ? `<small>${note}</small>` : ""}</div>`;
  }

  function findSaleRecordByKey(key) {
    return (state.dailySales || []).find((record) => {
      const recordKey = String(record.id || `${record.invoiceAt || record.saleDate || ""}|${record.employeeId || ""}|${record.buyerName || ""}`);
      return recordKey === String(key || "");
    }) || null;
  }

  function deliveryRecordKey(record) {
    return String(record?.id || `${record?.orderNo || ""}|${record?.recordedAt || ""}|${record?.buyerName || ""}`);
  }

  function findDeliveryRecordByKey(key) {
    return (state.deliveryOrders || []).find((record) => deliveryRecordKey(record) === String(key || "")) || null;
  }

  function openSalesDetail(key) {
    const r = findSaleRecordByKey(key);
    if (!r || !els.salesDetailModal || !els.salesDetailContent) return;
    const a = recordAmounts(r);
    const emp = employeeForRecord(r);
    const customItems = Array.isArray(r.customItems) ? r.customItems : [];
    const customRows = customItems.map((item) => amountCell(item.name || "カスタム商品", qty(item.count), `${categoryLabel(item.category)} / ${money(item.totalAmount || num(item.count) * num(item.unitPrice))}`)).join("");
    els.salesDetailTitle.textContent = "伝票詳細";
    els.salesDetailContent.innerHTML = `
      <div class="detail-profile-grid">
        <article><span>従業員</span><strong>${esc(emp?.name || r.employeeName || "-")}</strong></article>
        <article><span>購入者</span><strong>${esc(r.buyerName || "-")}</strong></article>
        <article><span>請求日時</span><strong>${invoiceAt(r.invoiceAt || r.saleDate)}</strong></article>
      </div>
      <div class="detail-section"><h3>商品内訳</h3>
        <div class="breakdown-grid">
          ${amountCell("食べ物売上", money(a.food), `${qty(recordCategoryQty(r, "food"))}`)}
          ${amountCell("飲み物売上", money(a.drink), `${qty(recordCategoryQty(r, "drink"))}`)}
          ${amountCell("ジョイント売上", money(a.joint), `${qty(recordCategoryQty(r, "joint"))}`)}
          ${amountCell("その他売上", money(a.other), "その他として記録された金額")}
          ${amountCell("売上合計", money(a.total), "4項目の合計")}
        </div>
      </div>
      ${customRows ? `<div class="detail-section"><h3>カスタム請求の在庫商品</h3><div class="breakdown-grid">${customRows}</div></div>` : ""}`;
    els.salesDetailModal.classList.remove("hidden");
    els.salesDetailModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("detail-open");
  }

  function closeSalesDetail() {
    els.salesDetailModal?.classList.add("hidden");
    els.salesDetailModal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("detail-open");
  }

  function openDeliveryDetail(key) {
    const d = findDeliveryRecordByKey(key);
    if (!d || !els.salesDetailModal || !els.salesDetailContent) return;
    const itemRows = Array.isArray(d.items) && d.items.length
      ? d.items.map((item) => amountCell(item.name || categoryLabel(item.category), qty(item.count), `カテゴリ ${categoryLabel(item.category)}`)).join("")
      : [
          amountCell("食べ物", qty(d.foodQty)),
          amountCell("飲み物", qty(d.drinkQty)),
          amountCell("ジョイント", qty(d.jointQty))
        ].join("");
    els.salesDetailTitle.textContent = "デリバリー詳細";
    els.salesDetailContent.innerHTML = `
      <div class="detail-profile-grid">
        <article><span>注文番号</span><strong>${esc(d.orderNo || "デリバリー")}</strong></article>
        <article><span>注文者</span><strong>${esc(d.buyerName || "-")}</strong></article>
        <article><span>注文日時</span><strong>${invoiceAt(d.recordedAt)}</strong></article>
      </div>
      <div class="detail-section"><h3>商品内訳</h3>
        <div class="breakdown-grid">${itemRows}</div>
      </div>`;
    els.salesDetailModal.classList.remove("hidden");
    els.salesDetailModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("detail-open");
  }

  function buyerMatchesName(displayName, candidate) {
    const profile = findBuyer(displayName);
    const keys = [displayName, ...(profile?.aliases || [])].map(buyerKey).filter(Boolean);
    return keys.includes(buyerKey(candidate));
  }

  function openBuyerDetail(name) {
    if (!name || !els.buyerDetailModal || !els.buyerDetailContent) return;
    const summary = buyerSummary().find((row) => buyerKey(row.name) === buyerKey(name));
    if (!summary) return;
    const profile = findBuyer(summary.name);
    const storeRecords = (state.dailySales || []).filter((r) => buyerMatchesName(summary.name, r.buyerName)).sort((a, b) => String(b.invoiceAt || b.saleDate || "").localeCompare(String(a.invoiceAt || a.saleDate || "")));
    const deliveries = (state.deliveryOrders || []).filter((d) => buyerMatchesName(summary.name, d.buyerName)).sort((a, b) => String(b.recordedAt || "").localeCompare(String(a.recordedAt || "")));
    const storeTotal = storeRecords.reduce((sum, r) => sum + recordAmounts(r).total, 0);
    const aliases = profile?.aliases?.length ? profile.aliases.join(" / ") : "なし";
    const recentStore = storeRecords.slice(0, 6).map((r) => {
      const a = recordAmounts(r);
      return `<article class="detail-sale-row"><div><strong>${invoiceAt(r.invoiceAt || r.saleDate)}</strong><span>${esc(employeeForRecord(r)?.name || r.employeeName || "-")}</span></div><div class="money sm">${money(a.total)}</div></article>`;
    }).join("") || `<div class="empty-state">店頭購入履歴はありません</div>`;
    const recentDelivery = deliveries.slice(0, 6).map((d) => `<article class="detail-sale-row"><div><strong>${invoiceAt(d.recordedAt)}</strong><span>${esc(d.orderNo || "デリバリー")}</span></div><div class="pill">${qty(num(d.foodQty) + num(d.drinkQty) + num(d.jointQty))}</div></article>`).join("") || `<div class="empty-state">デリバリー履歴はありません</div>`;
    els.buyerDetailTitle.textContent = `${summary.name} の詳細`;
    els.buyerDetailContent.innerHTML = `
      <div class="detail-profile-grid">
        <article><span>購入回数</span><strong>${summary.count}回</strong></article>
        <article><span>店頭</span><strong>${summary.store}回</strong></article>
        <article><span>デリバリー</span><strong>${summary.delivery}回</strong></article>
        <article><span>店頭購入金額</span><strong>${money(storeTotal)}</strong></article>
      </div>
      <div class="detail-alias"><span>請求書名 / 別名</span><strong>${esc(aliases)}</strong></div>
      <div class="breakdown-grid detail-money-grid">
        ${amountCell("食べ物", qty(summary.food))}
        ${amountCell("飲み物", qty(summary.drink))}
        ${amountCell("ジョイント", qty(summary.joint))}
        ${amountCell("その他売上", money(summary.other))}
      </div>
      <div class="detail-section"><h3>最近の店頭購入</h3><div class="detail-list">${recentStore}</div></div>
      <div class="detail-section"><h3>最近のデリバリー</h3><div class="detail-list">${recentDelivery}</div></div>`;
    els.buyerDetailModal.classList.remove("hidden");
    els.buyerDetailModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("detail-open");
  }

  function closeBuyerDetail() {
    els.buyerDetailModal?.classList.add("hidden");
    els.buyerDetailModal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("detail-open");
  }

  function renderSales() {
    const rows = [...(state.dailySales || [])].sort((a, b) => String(b.invoiceAt || b.saleDate || "").localeCompare(String(a.invoiceAt || a.saleDate || "")));
    els.salesList.innerHTML =
      rows
        .map((r) => {
          const emp = employeeForRecord(r);
          const employeeId = emp?.id || r.employeeId || "";
          return `<article class="item-card tap-detail-card compact-detail-card" data-sale-area="${esc(r.id || `${r.invoiceAt || r.saleDate || ""}|${employeeId}|${r.buyerName || ""}`)}">
            <div class="item-top">
              <div>
                <div class="item-title">${esc(emp?.name || r.employeeName || "-")}</div>
                <div class="item-meta">${invoiceAt(r.invoiceAt || r.saleDate)} / 購入者 ${esc(r.buyerName || "-")}</div>
              </div>
            </div>
          </article>`;
        })
        .join("") || empty("販売実績がありません");

    const deliveries = [...(state.deliveryOrders || [])].sort((a, b) => String(b.recordedAt || "").localeCompare(String(a.recordedAt || "")));
    els.deliveryList.innerHTML =
      deliveries
        .map((d) => {
          return `<article class="item-card tap-detail-card compact-detail-card" data-delivery-area="${esc(deliveryRecordKey(d))}">
            <div class="item-top">
              <div>
                <div class="item-title">${esc(d.orderNo || "デリバリー")}</div>
                <div class="item-meta">${invoiceAt(d.recordedAt)} / 注文者 ${esc(d.buyerName || "-")}</div>
              </div>
            </div>
          </article>`;
        })
        .join("") || empty("デリバリー履歴がありません");
    renderSalesSummary();
  }

  function buildSalesSummaryGroups(mode = "day") {
    const groups = new Map();
    for (const record of state.dailySales || []) {
      const employee = employeeForRecord(record);
      const employeeId = String(employee?.id || record.employeeId || "");
      const employeeName = String(employee?.name || record.employeeName || "-");
      const saleDate = String(record.saleDate || record.invoiceAt || "").slice(0, 10) || "-";
      let key = `day:${saleDate}`;
      let label = dateOnly(saleDate);
      if (mode === "employee") {
        key = `employee:${employeeId || buyerKey(employeeName)}`;
        label = employeeName;
      } else if (mode === "dayEmployee") {
        key = `dayEmployee:${saleDate}:${employeeId || buyerKey(employeeName)}`;
        label = `${dateOnly(saleDate)} / ${employeeName}`;
      }
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          saleDate,
          employeeId: mode === "employee" || mode === "dayEmployee" ? employeeId : "",
          employeeName: mode === "employee" || mode === "dayEmployee" ? employeeName : "",
          transactions: 0,
          food: 0,
          drink: 0,
          joint: 0,
          other: 0,
          total: 0
        });
      }
      const group = groups.get(key);
      const amounts = recordAmounts(record);
      group.transactions += 1;
      for (const name of ["food", "drink", "joint", "other", "total"]) group[name] += amounts[name];
    }
    const result = [...groups.values()];
    if (mode === "employee") result.sort((a, b) => a.label.localeCompare(b.label, "ja"));
    else result.sort((a, b) => b.saleDate.localeCompare(a.saleDate) || a.label.localeCompare(b.label, "ja"));
    return result;
  }

  function renderSalesSummary() {
    if (!els.salesSummaryTotals || !els.salesSummaryList) return;
    const records = state.dailySales || [];
    const totals = records.reduce((sum, record) => {
      const amounts = recordAmounts(record);
      for (const name of ["food", "drink", "joint", "other", "total"]) sum[name] += amounts[name];
      return sum;
    }, { food: 0, drink: 0, joint: 0, other: 0, total: 0 });
    els.salesSummaryTotals.innerHTML = `
      <article class="stat"><span class="label">販売記録</span><strong>${records.length.toLocaleString("ja-JP")}件</strong></article>
      <article class="stat"><span class="label">その他売上</span><strong>${money(totals.other)}</strong></article>
      <article class="stat sales-summary-grand-total"><span class="label">売上合計</span><strong>${money(totals.total)}</strong></article>`;

    const groups = buildSalesSummaryGroups(els.salesSummaryMode?.value || "day");
    els.salesSummaryList.innerHTML = groups.map((group) => {
      const employeeAttribute = group.employeeId ? ` data-employee-area="${esc(group.employeeId)}"` : "";
      return `<article class="item-card sales-summary-card${group.employeeId ? " employee-detail-area" : ""}"${employeeAttribute}>
        <div class="item-top">
          <div><div class="item-title">${esc(group.label)}</div><div class="item-meta">取引 ${group.transactions.toLocaleString("ja-JP")}件</div></div>
          <div class="money sm">${money(group.total)}</div>
        </div>
        <div class="breakdown-grid sales-summary-breakdown">
          ${amountCell("食べ物売上", money(group.food))}
          ${amountCell("飲み物売上", money(group.drink))}
          ${amountCell("ジョイント売上", money(group.joint))}
          ${amountCell("その他売上", money(group.other))}
        </div>
        ${group.employeeId ? '<span class="sales-summary-detail-hint">タップで従業員詳細</span>' : ""}
      </article>`;
    }).join("") || empty("集計できる販売記録がありません");
  }

  function renderBuyers() {
    const rows = buyerSummary();
    els.buyersList.innerHTML =
      rows
        .map(
          (b) => `<article class="item-card tap-detail-card compact-detail-card" data-buyer-area="${esc(b.name)}">
        <div class="item-top"><div><div class="item-title">${esc(b.name)}</div><div class="item-meta">${b.aliases.length ? `請求書名: ${esc(b.aliases.join(" / "))}` : "請求書名なし"}</div></div><strong>${b.count}回</strong></div>
        <div class="pills"><span class="pill">店頭 ${b.store}回</span><span class="pill">デリバリー ${b.delivery}回</span><span class="pill">最終 ${invoiceAt(b.last)}</span></div>
      </article>`
        )
        .join("") || empty("購入者がいません");
  }

  function renderProducts() {
    const rows = (state.productCatalog || []).filter((p) => p.active !== false).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja"));
    els.productsList.innerHTML =
      rows
        .map(
          (p) => `<article class="product-card">
      <div class="product-image">${p.imageDataUrl ? `<img src="${esc(p.imageDataUrl)}" alt="${esc(p.name || "商品")}">` : `<span class="empty">画像なし</span>`}</div>
      <div class="product-body"><div class="product-name">${esc(p.name || "-")}</div><div class="product-stash">${esc(p.stashName || "-")}</div><div class="pills"><span class="pill">${esc(categoryLabel(p.category))}</span></div><div class="product-price">${money(p.salePrice)}</div></div>
    </article>`
        )
        .join("") || empty("商品が登録されていません");
  }

  function productNameKey(value) {
    return String(value || "").normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/[\s_\-・.()（）]+/g, "").trim();
  }

  function canonicalInventoryName(name, category = "") {
    const raw = String(name || "").trim();
    const key = productNameKey(raw);
    if (!key) return raw;
    const catalog = (state.productCatalog || []).filter((item) => item && item.name && item.active !== false && (!category || item.category === category));
    const exact = catalog.find((item) => [item.name, item.stashName, ...(Array.isArray(item.aliases) ? item.aliases : [])].some((value) => productNameKey(value) === key));
    return exact?.name || raw;
  }

  function normalizeSnapshot(s) {
    return {
      ...s,
      products: Array.isArray(s.products) ? s.products : [],
      materials: s.materials || {},
      spCoins: num(s.spCoins)
    };
  }

  function renderSnapshot(s, latest = false) {
    s = normalizeSnapshot(s);
    const products = s.products
      .map((p) => `<div class="inventory-product"><strong>${esc(canonicalInventoryName(p.name || "-", p.category))}</strong><br><span class="muted">${esc(categoryLabel(p.category))}</span> ${qty(p.count)}</div>`)
      .join("");
    return `<div class="inventory-block">
      <div class="item-top"><div><div class="item-title">${latest ? "最新在庫" : "在庫チェック"}${s.isBaseline ? ' <span class="pill role">比較基準</span>' : ""}</div><div class="item-meta">画像送信日時 ${invoiceAt(s.capturedAt)}</div></div><strong>SP ${Math.round(s.spCoins).toLocaleString("ja-JP")}枚</strong></div>
      <div class="key-values"><span>ご飯の素</span><strong>${qty(s.materials.food)}</strong><span>飲み物の素</span><strong>${qty(s.materials.drink)}</strong><span>リラックスの素</span><strong>${qty(s.materials.joint)}</strong><span>甘いものの素</span><strong>${qty(s.materials.sweet)}</strong></div>
      ${products ? `<div class="inventory-products">${products}</div>` : ""}
    </div>`;
  }

  function renderInventory() {
    const rows = [...(state.inventorySnapshots || [])].sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")));
    els.inventoryLatest.innerHTML = rows[0] ? renderSnapshot(rows[0], true) : empty("在庫チェックがありません");
    els.inventoryHistory.innerHTML = rows.slice(1, 21).map((s) => renderSnapshot(s, false)).join("") || empty("過去の在庫履歴はありません");
  }

  function periodIncludes(date, start, end) {
    const d = String(date || "").slice(0, 10);
    return !!d && (!start || d >= start) && (!end || d <= end);
  }

  function currentBonusEntries() {
    const settings = state.settings || {};
    const employees = sortedEmployees().filter(activeEmployee);
    const totals = new Map(employees.map((e) => [String(e.id), 0]));
    for (const r of state.dailySales || []) {
      if (!periodIncludes(r.invoiceAt || r.saleDate, settings.bonusStartDate, settings.bonusEndDate)) continue;
      const e = employeeForRecord(r);
      if (!e) continue;
      totals.set(String(e.id), (totals.get(String(e.id)) || 0) + recordAmounts(r).total);
    }
    const rate = Math.max(0, num(settings.bonusRatePercent ?? 40));
    const coinUnitAmount = effectiveCoinUnitAmount(settings);
    const targetAmount = Math.max(0, Math.round(num(settings.storeFunds)));
    const entries = employees.map((e) => {
      const sales = totals.get(String(e.id)) || 0;
      const roleBonus = roleFixedBonus(e, settings);
      const salesBonus = Math.round(sales * rate / 100);
      const coins = bonusCoins(e);
      const coinBonus = Math.round(coins * coinUnitAmount);
      const auto = roundUpThousand(roleBonus + salesBonus + coinBonus);
      const override = e.role !== "店長" && state.payoutOverrides && Object.prototype.hasOwnProperty.call(state.payoutOverrides, e.id) ? Math.max(0, Math.round(num(state.payoutOverrides[e.id]))) : null;
      return {
        e,
        sales,
        rate,
        coinUnitAmount,
        coins,
        roleBonus,
        salesBonus,
        coinBonus,
        auto,
        amount: override === null ? auto : override,
        manual: override !== null,
        managerRemainder: e.role === "店長",
        targetAmount,
        otherEmployeeTotal: 0,
        managerCount: 0
      };
    });

    const regularEntries = entries.filter((entry) => !entry.managerRemainder);
    const managerEntries = entries.filter((entry) => entry.managerRemainder);
    const otherEmployeeTotal = regularEntries.reduce((sum, entry) => sum + num(entry.amount), 0);
    const managerPool = Math.max(0, targetAmount - otherEmployeeTotal);
    const managerCount = managerEntries.length;
    const baseManagerAmount = managerCount ? Math.floor(managerPool / managerCount) : 0;
    const managerRemainderYen = managerCount ? managerPool % managerCount : 0;

    managerEntries.forEach((entry, index) => {
      const amount = baseManagerAmount + (index < managerRemainderYen ? 1 : 0);
      entry.auto = amount;
      entry.amount = amount;
      entry.manual = false;
      entry.otherEmployeeTotal = otherEmployeeTotal;
      entry.managerCount = managerCount;
    });

    return entries.sort((a, b) => roleIndex(a.e.role) - roleIndex(b.e.role) || String(a.e.name).localeCompare(String(b.e.name), "ja"));
  }

  function renderBonus() {
    const settings = state.settings || {};
    const entries = currentBonusEntries();
    const total = entries.reduce((t, x) => t + num(x.amount), 0);
    const rate = Math.max(0, num(settings.bonusRatePercent ?? 40));
    const coinUnitAmount = effectiveCoinUnitAmount(settings);
    els.bonusSummary.innerHTML = [
      ["対象期間", `${dateOnly(settings.bonusStartDate)}〜${dateOnly(settings.bonusEndDate)}`],
      ["ボーナス予算", money(settings.storeFunds)],
      ["計算後支給額", money(total)],
      ["売上割合", `${rate.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}%`],
      ["コイン単価", money(coinUnitAmount)]
    ]
      .map(([l, v]) => `<div class="stat"><span class="label">${l}</span><strong>${v}</strong></div>`)
      .join("");

    els.bonusCurrent.innerHTML =
      entries
        .map((x) => {
          const breakdown = x.managerRemainder
            ? `
        ${amountCell("ボーナス予算", money(x.targetAmount))}
        ${amountCell("店長以外の支給総額", money(x.otherEmployeeTotal))}
        ${amountCell("店長の残額", money(x.amount), x.managerCount > 1 ? `店長${x.managerCount}人で均等分配` : `${money(x.targetAmount)} − ${money(x.otherEmployeeTotal)}`)}
        ${amountCell("対象期間の売上", money(x.sales), "店長の支給額には加算しません")}`
            : `
        ${amountCell("役職固定給", money(x.roleBonus), x.e.role || "-")}
        ${amountCell("売上加算", money(x.salesBonus), `${money(x.sales)} × ${x.rate.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}%`)}
        ${amountCell("コイン", `${Math.round(x.coins).toLocaleString("ja-JP")}枚`, `${Math.round(x.coins).toLocaleString("ja-JP")}枚 × ${money(x.coinUnitAmount)} = ${money(x.coinBonus)}`)}
        ${amountCell("自動支給額", money(x.auto), `${money(x.roleBonus)} + ${money(x.salesBonus)} + ${money(x.coinBonus)} / 1,000円未満切り上げ`)}`;
          return `<article class="item-card employee-detail-area" data-employee-area="${esc(x.e.id)}">
      <div class="item-top"><div><div class="item-title">${employeeDetailButton(x.e.id, x.e.name)}</div><div class="item-meta">${esc(x.e.role || "-")}</div></div><div><div class="money">${money(x.amount)}</div><div class="money-note">支給額</div></div></div>
      <div class="breakdown-grid">
        ${breakdown}
      </div>
    </article>`;
        })
        .join("") || empty("対象従業員がいません");

    const hist = [...(state.payoutHistory || [])].sort((a, b) => String(b.payoutDate || "").localeCompare(String(a.payoutDate || "")));
    els.payoutHistory.innerHTML =
      hist
        .map(
          (h) => `<details class="item-card payout-history-card">
      <summary><div class="item-top"><div><div class="item-title">${dateOnly(h.payoutDate)}</div><div class="item-meta">${dateOnly(h.periodStart || h.bonusStartDate)}〜${dateOnly(h.periodEnd || h.bonusEndDate)}</div></div><div><div class="money sm">${money(h.totalAmount || h.actualTotal || h.total)}</div><div class="money-note">支給総額</div></div></div><span class="payout-history-hint">タップで内訳を表示</span></summary>
      <div class="payout-history-details">${(h.entries || h.payouts || []).map((x) => `<div><span>${esc(x.employeeName || x.name || "-")} / ${esc(x.role || "-")}</span><strong>${money(x.amount)}</strong></div>`).join("") || '<div><span>内訳なし</span></div>'}</div>
    </details>`
        )
        .join("") || empty("支給履歴がありません");
  }

  function renderEmployees() {
    els.employeeList.innerHTML =
      sortedEmployees()
        .map(
          (e) => `<article class="item-card">
      <div class="item-top"><div><div class="item-title">${esc(e.name || "-")}</div><div class="item-meta">${Array.isArray(e.aliases) && e.aliases.length ? `請求名: ${esc(e.aliases.join(" / "))}` : "請求名なし"}</div></div><span class="pill">${esc(statusLabel(e))}</span></div>
      <div class="pills"><span class="pill role">${esc(e.role || "-")}</span><span class="pill">コイン累計 ${Math.round(num(e.coins)).toLocaleString("ja-JP")}枚</span><span class="pill">今回対象 ${Math.round(bonusCoins(e)).toLocaleString("ja-JP")}枚</span></div>
    </article>`
        )
        .join("") || empty("従業員がいません");
  }

  function renderCoinHistory() {
    if (!els.coinHistorySummary || !els.coinHistoryList) return;
    const rows = coinHistoryRows();
    const cumulativeCoins = (state.employees || []).reduce((sum, employee) => sum + Math.max(0, Math.round(num(employee.coins))), 0);
    const employeeCount = new Set(rows.map(entry => entry.employeeId).filter(Boolean)).size;
    els.coinHistorySummary.innerHTML = `
      <article class="stat"><span class="label">登録履歴</span><strong>${rows.length.toLocaleString("ja-JP")}件</strong></article>
      <article class="stat"><span class="label">対象者</span><strong>${employeeCount.toLocaleString("ja-JP")}人</strong></article>
      <article class="stat coin-history-total"><span class="label">全員の累計コイン</span><strong>${cumulativeCoins.toLocaleString("ja-JP")}枚</strong></article>`;
    els.coinHistoryList.innerHTML = rows.map(entry => {
      const amount = Math.round(num(entry.amount));
      const dateLabel = entry.recordedAt ? invoiceAt(entry.recordedAt) : "履歴導入前";
      return `<article class="item-card coin-history-card">
        <div class="item-top">
          <div><div class="item-title">${esc(entry.employeeName)}</div><div class="item-meta">${dateLabel}</div></div>
          <strong class="coin-history-amount ${amount < 0 ? "negative" : "positive"}">${amount > 0 ? "+" : ""}${amount.toLocaleString("ja-JP")}枚</strong>
        </div>
        <div class="pills"><span class="pill">${esc(coinHistorySourceLabel(entry.source))}</span><span class="pill">登録後 ${Math.max(0, entry.balance).toLocaleString("ja-JP")}枚</span></div>
        ${entry.note ? `<p class="coin-history-note">${esc(entry.note)}</p>` : ""}
      </article>`;
    }).join("") || empty("コイン登録履歴はまだありません");
  }

  function renderAll() {
    renderOverview();
    renderSales();
    renderBuyers();
    renderProducts();
    renderInventory();
    renderBonus();
    renderCoinHistory();
    renderEmployees();
  }

  function showPage(name) {
    $$(".page").forEach((p) => p.classList.toggle("active", p.dataset.page === name));
    $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.pageTarget === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
    els.moreSheet.classList.add("hidden");
    els.moreSheet.setAttribute("aria-hidden", "true");
  }

  async function enterViewer() {
    setSplash("最新データを取得しています…", 78);
    showLoading(true);
    try {
      await loadCloud();
      els.loginScreen.classList.add("hidden");
      els.viewerScreen.classList.remove("hidden");
      showPage("overview");
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(() => {
        if (document.visibilityState === "visible") loadCloud().catch(() => {});
        if (swRegistration) swRegistration.update().catch(() => {});
      }, 60000);
      setSplash("準備ができました", 100);
      hideSplash(180);
    } finally {
      showLoading(false);
    }
  }

  function activateWaitingWorker(registration) {
    const waiting = registration.waiting;
    if (!waiting) return;
    toast("更新を反映しています…");
    waiting.postMessage({ type: "SKIP_WAITING" });
  }

  async function initServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register("./sw.js");
      swRegistration = registration;
      if (registration.waiting) activateWaitingWorker(registration);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            activateWaitingWorker(registration);
          }
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadedFromUpdate) return;
        reloadedFromUpdate = true;
        location.reload();
      });
      window.addEventListener("focus", () => registration.update().catch(() => {}));
    } catch {}
  }

  els.toggleSetupBtn.addEventListener("click", () => els.connectionSetup.classList.toggle("hidden"));
  els.saveConnectionBtn.addEventListener("click", () => {
    const url = els.setupUrl.value.trim().replace(/\/+$/, "");
    const key = els.setupKey.value.trim();
    if (!/^https:\/\/.+\.supabase\.co$/i.test(url) || !key.startsWith("sb_publishable_")) {
      els.loginStatus.textContent = "URLまたはPublishable keyを確認してください。";
      return;
    }
    localStorage.setItem(CONFIG_STORAGE, JSON.stringify({ url, key }));
    els.loginStatus.textContent = "接続設定を保存しました。";
    els.connectionSetup.classList.add("hidden");
  });

  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.loginStatus.textContent = "ログイン中…";
    setSplash("ログインしています…", 48);
    els.startupSplash.classList.remove("hidden");
    try {
      await login(els.emailInput.value.trim(), els.passwordInput.value);
      els.passwordInput.value = "";
      await enterViewer();
    } catch (err) {
      hideSplash(120);
      els.loginStatus.textContent = err.message || "ログインに失敗しました";
    }
  });

  els.refreshBtn.addEventListener("click", async () => {
    showLoading(true);
    try {
      if (swRegistration) await swRegistration.update().catch(() => {});
      await loadCloud();
      toast("最新データに更新しました");
    } catch (e) {
      toast(e.message);
    } finally {
      showLoading(false);
    }
  });

  els.logoutBtn.addEventListener("click", () => {
    clearSession();
    location.reload();
  });

  $$(".nav-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const name = btn.dataset.pageTarget;
      if (name === "more") {
        els.moreSheet.classList.toggle("hidden");
        els.moreSheet.setAttribute("aria-hidden", String(els.moreSheet.classList.contains("hidden")));
        return;
      }
      showPage(name);
    })
  );
  $$('[data-more-target]').forEach((btn) => btn.addEventListener("click", () => showPage(btn.dataset.moreTarget)));
  els.closeMoreBtn.addEventListener("click", () => els.moreSheet.classList.add("hidden"));

  els.overviewCards?.addEventListener("click", () => {
    const opening = els.overviewExtraDetails?.classList.contains("hidden");
    els.overviewExtraDetails?.classList.toggle("hidden", !opening);
    els.overviewCards.setAttribute("aria-expanded", String(Boolean(opening)));
  });

  els.viewerScreen?.addEventListener("click", (event) => {
    if (event.target.closest("button, input, select, textarea, a, label")) return;
    const deliveryArea = event.target.closest("[data-delivery-area]");
    if (deliveryArea?.dataset.deliveryArea) { event.preventDefault(); openDeliveryDetail(deliveryArea.dataset.deliveryArea); return; }
    const saleArea = event.target.closest("[data-sale-area]");
    if (saleArea?.dataset.saleArea) { event.preventDefault(); openSalesDetail(saleArea.dataset.saleArea); return; }
    const buyerArea = event.target.closest("[data-buyer-area]");
    if (buyerArea?.dataset.buyerArea) { event.preventDefault(); openBuyerDetail(buyerArea.dataset.buyerArea); return; }
    const area = event.target.closest("[data-employee-area]");
    if (!area?.dataset.employeeArea) return;
    event.preventDefault();
    openEmployeeDetail(area.dataset.employeeArea);
  });
  els.closeSalesDetailBtn?.addEventListener("click", closeSalesDetail);
  els.salesDetailModal?.addEventListener("click", (event) => { if (event.target.matches("[data-close-sales-detail]")) closeSalesDetail(); });
  els.closeBuyerDetailBtn?.addEventListener("click", closeBuyerDetail);
  els.buyerDetailModal?.addEventListener("click", (event) => { if (event.target.matches("[data-close-buyer-detail]")) closeBuyerDetail(); });
  els.closeEmployeeDetailBtn?.addEventListener("click", closeEmployeeDetail);
  els.employeeDetailModal?.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-employee-detail]")) closeEmployeeDetail();
  });

  $$('[data-sales-tab]').forEach((btn) =>
    btn.addEventListener("click", () => {
      $$('[data-sales-tab]').forEach((x) => x.classList.toggle("active", x === btn));
      const selected = btn.dataset.salesTab;
      $("#storeSalesPanel").classList.toggle("hidden", selected !== "store");
      $("#salesSummaryPanel").classList.toggle("hidden", selected !== "summary");
      $("#deliverySalesPanel").classList.toggle("hidden", selected !== "delivery");
    })
  );
  els.salesSummaryMode?.addEventListener("change", renderSalesSummary);

  async function init() {
    preventDoubleTapZoom();
    await initServiceWorker();
    const c = connection();
    els.setupUrl.value = c.url;
    els.setupKey.value = c.key;
    els.emailInput.value = localStorage.getItem(EMAIL_STORAGE) || "";
    if (!c.url || !c.key) els.connectionSetup.classList.remove("hidden");
    if (session()?.access_token) {
      setSplash("自動ログインしています…", 40);
      try {
        await enterViewer();
        return;
      } catch (e) {
        clearSession();
        els.loginStatus.textContent = "再ログインしてください。";
      }
    }
    setSplash("ログイン待機中", 100);
    els.loginScreen.classList.remove("hidden");
    hideSplash(260);
  }

  init();
})();
