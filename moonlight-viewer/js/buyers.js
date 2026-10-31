// buyers.js — 購入者一覧・購入者詳細。
"use strict";

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
