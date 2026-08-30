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
    salesList: $("#salesList"),
    deliveryList: $("#deliveryList"),
    buyersList: $("#buyersList"),
    productsList: $("#productsList"),
    inventoryLatest: $("#inventoryLatest"),
    inventoryHistory: $("#inventoryHistory"),
    bonusSummary: $("#bonusSummary"),
    bonusCurrent: $("#bonusCurrent"),
    payoutHistory: $("#payoutHistory"),
    employeeList: $("#employeeList"),
    moreSheet: $("#moreSheet"),
    closeMoreBtn: $("#closeMoreBtn"),
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
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const categoryLabel = (v) => ({ food: "食べ物", drink: "飲み物", joint: "ジョイント" }[v] || v || "-");
  const statusLabel = (e) => (e?.status === "retired" ? "退職" : "在籍");
  const activeEmployee = (e) => e?.status !== "retired";

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
    const food = num(r.foodQty) * num(r.foodUnitPrice ?? (num(r.foodQty) ? 30000 : 0));
    const drink = num(r.drinkQty) * num(r.drinkUnitPrice ?? (num(r.drinkQty) ? 30000 : 0));
    const joint = num(r.jointQty) * num(r.jointUnitPrice ?? (num(r.jointQty) ? 50000 : 0));
    const other = num(r.otherAmount);
    return { food, drink, joint, other, total: food + drink + joint + other };
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
      x.food += num(r.foodQty);
      x.drink += num(r.drinkQty);
      x.joint += num(r.jointQty);
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
        num(r.foodQty) > 0 ? `食べ物 ${qty(r.foodQty)} × ${money(r.foodUnitPrice || 0)} = ${money(a.food)}` : "",
        num(r.drinkQty) > 0 ? `飲み物 ${qty(r.drinkQty)} × ${money(r.drinkUnitPrice || 0)} = ${money(a.drink)}` : "",
        num(r.jointQty) > 0 ? `ジョイント ${qty(r.jointQty)} × ${money(r.jointUnitPrice || 0)} = ${money(a.joint)}` : "",
        a.other > 0 ? `その他 ${money(a.other)}` : ""
      ].filter(Boolean).map((line) => `<span>${line}</span>`).join("");
      return `<article class="detail-sale-row detail-sale-row-expanded"><div><strong>${invoiceAt(r.invoiceAt || r.saleDate)}</strong><span>${esc(r.buyerName || "-")}</span><div class="detail-sale-breakdown">${detailParts || '<span>内訳なし</span>'}</div></div><div class="money sm">${money(a.total)}</div></article>`;
    }).join("") || `<div class="empty-state">販売実績はありません</div>`;
    const payoutRows = payouts.slice(0, 5).map((p) => `<article class="detail-sale-row"><div><strong>${dateOnly(p.date)}</strong><span>${dateOnly(p.start)}〜${dateOnly(p.end)}</span></div><div class="money sm">${money(p.amount)}</div></article>`).join("") || `<div class="empty-state">支給履歴はありません</div>`;

    els.employeeDetailContent.innerHTML = `
      <div class="detail-profile-grid">
        <div><span>役職</span><strong>${esc(employee.role || "-")}</strong></div>
        <div><span>状態</span><strong>${esc(statusLabel(employee))}</strong></div>
        <div><span>SPコイン</span><strong>${Math.round(num(employee.coins)).toLocaleString("ja-JP")}枚</strong></div>
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
    const active = (state.employees || []).filter(activeEmployee).length;
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
        ${amountCell("累計売上", money(allAmounts), `${allRecords.length.toLocaleString("ja-JP")}伝票`)}
        ${amountCell("食べ物売上", money(totalBreakdown.food))}
        ${amountCell("飲み物売上", money(totalBreakdown.drink))}
        ${amountCell("ジョイント売上", money(totalBreakdown.joint))}
        ${amountCell("その他売上", money(totalBreakdown.other))}
        ${amountCell("今日の伝票", `${todayRecords.length.toLocaleString("ja-JP")}件`)}
        ${amountCell("購入者", `${buyers.length.toLocaleString("ja-JP")}人`)}
        ${amountCell("デリバリー", `${deliveryCount.toLocaleString("ja-JP")}件`)}
      </div>
      <p class="overview-cloud-note">クラウド version ${cloud.version} / ${cloud.updatedAt ? new Date(cloud.updatedAt).toLocaleString("ja-JP") : "-"}</p>
    `;

    const salesMap = employeeSalesMap();
    els.overviewAchievements.innerHTML = sortedEmployees().map((employee) => {
      const sales = salesMap.get(String(employee.id)) || { food: 0, drink: 0, joint: 0, other: 0, total: 0 };
      return `<article class="overview-employee-card employee-detail-area" data-employee-area="${esc(employee.id)}">
        <div>
          <strong>${esc(employee.name)}</strong>
          <span>${esc(employee.role || "-")}</span>
        </div>
        <div class="overview-employee-total"><span>売上合計</span><strong>${money(sales.total)}</strong></div>
        <span class="overview-chevron">›</span>
      </article>`;
    }).join("") || empty("従業員がいません");
  }

  function amountCell(label, amount, note = "") {
    return `<div class="breakdown-cell${note && note.startsWith("+") ? " accent" : ""}"><span class="cell-label">${label}</span><strong>${amount}</strong>${note ? `<small>${note}</small>` : ""}</div>`;
  }

  function renderSales() {
    const rows = [...(state.dailySales || [])].sort((a, b) => String(b.invoiceAt || b.saleDate || "").localeCompare(String(a.invoiceAt || a.saleDate || "")));
    els.salesList.innerHTML =
      rows
        .map((r) => {
          const a = recordAmounts(r);
          const emp = employeeForRecord(r);
          const employeeId = emp?.id || r.employeeId || "";
          return `<article class="item-card employee-detail-area" data-employee-area="${esc(employeeId)}">
            <div class="item-top">
              <div>
                <div class="item-title">${employeeDetailButton(employeeId, emp?.name || r.employeeName || "-")}</div>
                <div class="item-meta">${invoiceAt(r.invoiceAt || r.saleDate)} / 購入者 ${esc(r.buyerName || "-")}</div>
              </div>
              <div>
                <div class="money">${money(a.total)}</div>
                <div class="money-note">売上合計</div>
              </div>
            </div>
            <div class="breakdown-grid">
              ${amountCell("食べ物", qty(r.foodQty))}
              ${amountCell("飲み物", qty(r.drinkQty))}
              ${amountCell("ジョイント", qty(r.jointQty))}
              ${amountCell("その他", money(a.other), a.other ? "その他売上" : "加算なし")}
            </div>
          </article>`;
        })
        .join("") || empty("販売実績がありません");

    const deliveries = [...(state.deliveryOrders || [])].sort((a, b) => String(b.recordedAt || "").localeCompare(String(a.recordedAt || "")));
    els.deliveryList.innerHTML =
      deliveries
        .map((d) => {
          const itemRows = Array.isArray(d.items) && d.items.length
            ? d.items.map((i) => amountCell(i.name || categoryLabel(i.category), qty(i.count), `カテゴリ ${categoryLabel(i.category)}`)).join("")
            : [
                amountCell("食べ物", qty(d.foodQty)),
                amountCell("飲み物", qty(d.drinkQty)),
                amountCell("ジョイント", qty(d.jointQty))
              ].join("");
          return `<article class="item-card">
            <div class="item-top">
              <div>
                <div class="item-title">${esc(d.orderNo || "デリバリー")}</div>
                <div class="item-meta">${invoiceAt(d.recordedAt)} / 注文者 ${esc(d.buyerName || "-")}</div>
              </div>
            </div>
            <div class="breakdown-grid">${itemRows}</div>
          </article>`;
        })
        .join("") || empty("デリバリー履歴がありません");
  }

  function renderBuyers() {
    const rows = buyerSummary();
    els.buyersList.innerHTML =
      rows
        .map(
          (b) => `<article class="item-card">
        <div class="item-top"><div><div class="item-title">${esc(b.name)}</div><div class="item-meta">${b.aliases.length ? `請求書名: ${esc(b.aliases.join(" / "))}` : "請求書名なし"}</div></div><strong>${b.count}回</strong></div>
        <div class="pills"><span class="pill">店頭 ${b.store}回</span><span class="pill">デリバリー ${b.delivery}回</span><span class="pill">最終 ${invoiceAt(b.last)}</span></div>
        <div class="breakdown-grid">
          ${amountCell("食べ物", qty(b.food))}
          ${amountCell("飲み物", qty(b.drink))}
          ${amountCell("ジョイント", qty(b.joint))}
          ${amountCell("その他売上", money(b.other))}
        </div>
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
      <div class="item-top"><div><div class="item-title">${latest ? "最新在庫" : "在庫チェック"}</div><div class="item-meta">画像送信日時 ${invoiceAt(s.capturedAt)}</div></div><strong>SP ${Math.round(s.spCoins).toLocaleString("ja-JP")}枚</strong></div>
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
    const roleBonuses = settings.roleBonuses || {};
    const entries = [];
    for (const e of employees.filter((x) => x.role !== "店長")) {
      const sales = totals.get(String(e.id)) || 0;
      const salesBonus = (sales / 50000) * num(settings.salesUnitAmount);
      const coinBonus = num(e.coins) * num(settings.coinUnitAmount || 30000);
      const roleBonus = num(roleBonuses[e.role]);
      const auto = Math.ceil(Math.max(0, roleBonus + salesBonus + coinBonus) / 1000) * 1000;
      const override = state.payoutOverrides && Object.prototype.hasOwnProperty.call(state.payoutOverrides, e.id) ? num(state.payoutOverrides[e.id]) : null;
      entries.push({ e, sales, roleBonus, salesBonus, coinBonus, amount: override === null ? auto : override, manager: false });
    }
    const target = num(settings.storeFunds);
    const paid = entries.reduce((t, x) => t + x.amount, 0);
    const managers = employees.filter((x) => x.role === "店長");
    managers.forEach((e, i) => entries.push({ e, sales: totals.get(String(e.id)) || 0, roleBonus: 0, salesBonus: 0, coinBonus: 0, amount: i === 0 ? Math.max(0, target - paid) : 0, manager: true }));
    return entries.sort((a, b) => roleIndex(a.e.role) - roleIndex(b.e.role) || String(a.e.name).localeCompare(String(b.e.name), "ja"));
  }

  function renderBonus() {
    const settings = state.settings || {};
    const entries = currentBonusEntries();
    const total = entries.reduce((t, x) => t + num(x.amount), 0);
    els.bonusSummary.innerHTML = [
      ["対象期間", `${dateOnly(settings.bonusStartDate)}〜${dateOnly(settings.bonusEndDate)}`],
      ["今回支給額", money(settings.storeFunds)],
      ["計算後支給額", money(total)],
      ["売上$50,000あたり", money(settings.salesUnitAmount)]
    ]
      .map(([l, v]) => `<div class="stat"><span class="label">${l}</span><strong>${v}</strong></div>`)
      .join("");

    els.bonusCurrent.innerHTML =
      entries
        .map(
          (x) => `<article class="item-card employee-detail-area" data-employee-area="${esc(x.e.id)}">
      <div class="item-top"><div><div class="item-title">${employeeDetailButton(x.e.id, x.e.name)}</div><div class="item-meta">${esc(x.e.role || "-")}${x.manager ? " / 余り支給" : ""}</div></div><div><div class="money">${money(x.amount)}</div><div class="money-note">支給額</div></div></div>
      <div class="breakdown-grid">
        ${amountCell("対象期間の売上", money(x.sales), x.manager ? "-" : "売上金額")}
        ${amountCell("役職固定", money(x.roleBonus), x.manager ? "余り支給" : "役職ごとの固定額")}
        ${amountCell("売上分", money(x.salesBonus), x.manager ? "-" : `売上÷50,000 × ${money(settings.salesUnitAmount)}`)}
        ${amountCell("コイン分", money(x.coinBonus), x.manager ? "-" : `SPコイン ${Math.round(num(x.e.coins)).toLocaleString("ja-JP")}枚`)}
      </div>
    </article>`
        )
        .join("") || empty("対象従業員がいません");

    const hist = [...(state.payoutHistory || [])].sort((a, b) => String(b.payoutDate || "").localeCompare(String(a.payoutDate || "")));
    els.payoutHistory.innerHTML =
      hist
        .map(
          (h) => `<article class="item-card">
      <div class="item-top"><div><div class="item-title">${dateOnly(h.payoutDate)}</div><div class="item-meta">${dateOnly(h.periodStart || h.bonusStartDate)}〜${dateOnly(h.periodEnd || h.bonusEndDate)}</div></div><div><div class="money sm">${money(h.totalAmount || h.actualTotal || h.total)}</div><div class="money-note">支給総額</div></div></div>
      <div class="pills">${(h.entries || h.payouts || []).map((x) => `<span class="pill">${esc(x.employeeName || x.name || "-")} ${money(x.amount)}</span>`).join("")}</div>
    </article>`
        )
        .join("") || empty("支給履歴がありません");
  }

  function renderEmployees() {
    els.employeeList.innerHTML =
      sortedEmployees()
        .map(
          (e) => `<article class="item-card">
      <div class="item-top"><div><div class="item-title">${esc(e.name || "-")}</div><div class="item-meta">${Array.isArray(e.aliases) && e.aliases.length ? `請求名: ${esc(e.aliases.join(" / "))}` : "請求名なし"}</div></div><span class="pill">${esc(statusLabel(e))}</span></div>
      <div class="pills"><span class="pill role">${esc(e.role || "-")}</span><span class="pill">SPコイン ${Math.round(num(e.coins)).toLocaleString("ja-JP")}枚</span></div>
    </article>`
        )
        .join("") || empty("従業員がいません");
  }

  function renderAll() {
    renderOverview();
    renderSales();
    renderBuyers();
    renderProducts();
    renderInventory();
    renderBonus();
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
    const area = event.target.closest("[data-employee-area]");
    if (!area?.dataset.employeeArea) return;
    event.preventDefault();
    openEmployeeDetail(area.dataset.employeeArea);
  });
  els.closeEmployeeDetailBtn?.addEventListener("click", closeEmployeeDetail);
  els.employeeDetailModal?.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-employee-detail]")) closeEmployeeDetail();
  });

  $$('[data-sales-tab]').forEach((btn) =>
    btn.addEventListener("click", () => {
      $$('[data-sales-tab]').forEach((x) => x.classList.toggle("active", x === btn));
      const delivery = btn.dataset.salesTab === "delivery";
      $("#storeSalesPanel").classList.toggle("hidden", delivery);
      $("#deliverySalesPanel").classList.toggle("hidden", !delivery);
    })
  );

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
