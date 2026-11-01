// sales.js — 販売実績・売上集計・伝票とデリバリーの詳細。
"use strict";

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

function openSharedDetail(eyebrow, title, content) {
  if (!els.salesDetailModal || !els.salesDetailContent) return;
  if (els.salesDetailEyebrow) els.salesDetailEyebrow.textContent = eyebrow;
  els.salesDetailTitle.textContent = title;
  els.salesDetailContent.innerHTML = content;
  els.salesDetailModal.classList.remove("hidden");
  els.salesDetailModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("detail-open");
}

function openSalesDetail(key) {
  const r = findSaleRecordByKey(key);
  if (!r || !els.salesDetailModal || !els.salesDetailContent) return;
  const a = recordAmounts(r);
  const emp = employeeForRecord(r);
  const customItems = Array.isArray(r.customItems) ? r.customItems : [];
  const customRows = customItems.map((item) => amountCell(item.name || "カスタム商品", qty(item.count), `${categoryLabel(item.category)} / ${money(item.totalAmount || num(item.count) * num(item.unitPrice))}`)).join("");
  openSharedDetail("SALES DETAIL", "伝票詳細", `
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
      ${customRows ? `<div class="detail-section"><h3>カスタム請求の在庫商品</h3><div class="breakdown-grid">${customRows}</div></div>` : ""}`);
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
  openSharedDetail("DELIVERY DETAIL", "デリバリー詳細", `
      <div class="detail-profile-grid">
        <article><span>注文番号</span><strong>${esc(d.orderNo || "デリバリー")}</strong></article>
        <article><span>注文者</span><strong>${esc(d.buyerName || "-")}</strong></article>
        <article><span>注文日時</span><strong>${invoiceAt(d.recordedAt)}</strong></article>
      </div>
      <div class="detail-section"><h3>商品内訳</h3>
        <div class="breakdown-grid">${itemRows}</div>
      </div>`);
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
        total: 0,
        records: []
      });
    }
    const group = groups.get(key);
    const amounts = recordAmounts(record);
    group.transactions += 1;
    group.records.push(record);
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
    return `<article class="item-card sales-summary-card tap-detail-card compact-summary-card" data-sales-summary-area="${esc(group.key)}">
        <div class="item-top">
          <div><div class="item-title">${esc(group.label)}</div><div class="item-meta">取引 ${group.transactions.toLocaleString("ja-JP")}件</div></div>
          <div class="money sm">${money(group.total)}</div>
        </div>
      </article>`;
  }).join("") || empty("集計できる販売記録がありません");
}

function openSalesSummaryDetail(key) {
  const mode = els.salesSummaryMode?.value || "day";
  const group = buildSalesSummaryGroups(mode).find((item) => item.key === String(key || ""));
  if (!group) return;
  const categoryQty = (category) => group.records.reduce((sum, record) => sum + recordCategoryQty(record, category), 0);
  const recordRows = [...group.records]
    .sort((a, b) => String(b.invoiceAt || b.saleDate || "").localeCompare(String(a.invoiceAt || a.saleDate || "")))
    .map((record) => {
      const amounts = recordAmounts(record);
      const employee = employeeForRecord(record);
      const parts = [
        `食べ物 ${qty(recordCategoryQty(record, "food"))} / ${money(amounts.food)}`,
        `飲み物 ${qty(recordCategoryQty(record, "drink"))} / ${money(amounts.drink)}`,
        `ジョイント ${qty(recordCategoryQty(record, "joint"))} / ${money(amounts.joint)}`,
        `その他 ${money(amounts.other)}`
      ].map((part) => `<span>${part}</span>`).join("");
      return `<article class="detail-sale-row detail-sale-row-expanded"><div><strong>${invoiceAt(record.invoiceAt || record.saleDate)}</strong><span>${esc(employee?.name || record.employeeName || "-")} / 購入者 ${esc(record.buyerName || "-")}</span><div class="detail-sale-breakdown">${parts}</div></div><div class="money sm">${money(amounts.total)}</div></article>`;
    }).join("") || '<div class="empty-state">販売実績はありません</div>';
  openSharedDetail("SALES SUMMARY", `${group.label} の集計`, `
      <div class="detail-profile-grid">
        <article><span>集計単位</span><strong>${mode === "day" ? "日別" : mode === "employee" ? "従業員別" : "日別 × 従業員別"}</strong></article>
        <article><span>販売記録</span><strong>${group.transactions.toLocaleString("ja-JP")}件</strong></article>
        <article><span>売上合計</span><strong>${money(group.total)}</strong></article>
      </div>
      <div class="detail-section"><h3>集計内訳</h3><div class="breakdown-grid">
        ${amountCell("食べ物売上", money(group.food), qty(categoryQty("food")))}
        ${amountCell("飲み物売上", money(group.drink), qty(categoryQty("drink")))}
        ${amountCell("ジョイント売上", money(group.joint), qty(categoryQty("joint")))}
        ${amountCell("その他売上", money(group.other))}
      </div></div>
      <div class="detail-section"><h3>含まれる販売記録</h3><div class="detail-list">${recordRows}</div></div>`);
}
