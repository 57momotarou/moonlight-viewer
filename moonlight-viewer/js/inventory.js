// inventory.js — 商品一覧・在庫照合（計算は shared/inventory-report.js）。
"use strict";

function renderProducts() {
  const rows = (state.productCatalog || []).filter((p) => p.active !== false).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja"));
  els.productsList.innerHTML =
    rows
      .map(
        (p) => `<article class="product-card">
      <div class="product-image">${p.imageDataUrl ? `<img src="${esc(p.imageDataUrl)}" alt="${esc(p.name || "商品")}">` : `<span class="empty">画像なし</span>`}</div>
      <div class="product-body"><div class="product-name">${esc(p.name || "-")}</div><div class="product-stash">${esc(p.stashName || "-")}</div><div class="pills"><span class="pill">${esc(categoryLabel(p.category))}</span><span class="pill">${esc(window.MoonlightInventoryReport.MATERIALS[window.MoonlightInventoryReport.materialCategory(p, categoryKey(p.category))])}</span></div><div class="product-price">${money(p.salePrice)}</div></div>
    </article>`
      )
      .join("") || empty("商品が登録されていません");
}

function productNameKey(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/[\s_\-・.()（）]+/g, "").trim();
}

function canonicalInventoryName(name, category = "") {
  const raw = String(name || "").trim();
  return window.MoonlightInventoryReport.catalogResolver(state)(raw, category)?.name || raw;
}

function normalizeSnapshot(s) {
  const resolve = window.MoonlightInventoryReport.catalogResolver(state);
  return {
    ...s,
    products: (Array.isArray(s.products) ? s.products : []).map(product => {
      const matched = resolve(product.name, product.category, product.productCatalogId || product.product_catalog_id)
        || resolve(product.recognizedName, "", "");
      return { ...product, name: matched?.name || product.name, category: matched?.category || categoryKey(product.category), materialCategory: window.MoonlightInventoryReport.materialCategory(matched || product, matched?.category || categoryKey(product.category)) };
    }),
    materials: s.materials || {},
    spCoins: num(s.spCoins)
  };
}

function inventorySnapshotKey(snapshot) {
  const index = (state.inventorySnapshots || []).indexOf(snapshot);
  return String(snapshot?.id || `${snapshot?.capturedAt || ""}|${index}`);
}

function findInventorySnapshotByKey(key) {
  return (state.inventorySnapshots || []).find((snapshot) => inventorySnapshotKey(snapshot) === String(key || "")) || null;
}

function renderSnapshot(s, latest = false) {
  const snapshotKey = inventorySnapshotKey(s);
  s = normalizeSnapshot(s);
  const materialTotal = ["food", "drink", "joint", "full", "sweet"].reduce((sum, name) => sum + num(s.materials[name]), 0);
  const productQty = s.products.reduce((sum, product) => sum + num(product.count), 0);
  return `<article class="inventory-block tap-detail-card compact-inventory-card" data-inventory-area="${esc(snapshotKey)}">
      <div class="item-top"><div><div class="item-title">${latest ? "最新在庫" : "在庫チェック"}${s.isBaseline ? ' <span class="pill role">比較基準</span>' : ""}</div><div class="item-meta">画像送信日時 ${invoiceAt(s.capturedAt)}</div></div><strong>SP ${Math.round(s.spCoins).toLocaleString("ja-JP")}枚</strong></div>
      <div class="pills"><span class="pill">素材 ${qty(materialTotal)}</span><span class="pill">商品 ${s.products.length.toLocaleString("ja-JP")}種類 / ${qty(productQty)}</span></div>
    </article>`;
}

function openInventoryDetail(key) {
  const raw = findInventorySnapshotByKey(key);
  if (!raw) return;
  const snapshot = normalizeSnapshot(raw);
  const products = snapshot.products
    .map((product) => `<div class="inventory-product"><strong>${esc(canonicalInventoryName(product.name || "-", product.category))}</strong><br><span class="muted">${esc(categoryLabel(product.category))} / ${esc(window.MoonlightInventoryReport.MATERIALS[product.materialCategory] || "素未設定")}</span> ${qty(product.count)}</div>`)
    .join("") || '<div class="empty-state">登録商品の在庫はありません</div>';
  openSharedDetail("INVENTORY DETAIL", "在庫チェック詳細", `
      <div class="detail-profile-grid">
        <article><span>画像送信日時</span><strong>${invoiceAt(snapshot.capturedAt)}</strong></article>
        <article><span>比較基準</span><strong>${snapshot.isBaseline ? "現在の基準" : "通常記録"}</strong></article>
        <article><span>SPコイン</span><strong>${Math.round(snapshot.spCoins).toLocaleString("ja-JP")}枚</strong></article>
        <article><span>登録商品</span><strong>${snapshot.products.length.toLocaleString("ja-JP")}種類</strong></article>
      </div>
      <div class="detail-section"><h3>素材</h3><div class="breakdown-grid">
        ${amountCell("食べ物の素", qty(snapshot.materials.food))}
        ${amountCell("満腹の素", window.MoonlightInventoryReport.fullMaterialRecorded(snapshot) ? qty(snapshot.materials.full) : "未記録")}
        ${amountCell("飲み物の素", qty(snapshot.materials.drink))}
        ${amountCell("リラックスの素", qty(snapshot.materials.joint))}
        ${amountCell("甘いものの素", qty(snapshot.materials.sweet))}
      </div></div>
      <div class="detail-section"><h3>商品在庫</h3><div class="inventory-products detail-inventory-products">${products}</div></div>`);
}

function renderInventory() {
  const rows = [...(state.inventorySnapshots || [])].sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")));
  els.inventoryLatest.innerHTML = rows[0] ? renderSnapshot(rows[0], true) : empty("在庫チェックがありません");
  els.inventoryHistory.innerHTML = rows.slice(1, 21).map((s) => renderSnapshot(s, false)).join("") || empty("過去の在庫履歴はありません");
  if (!inventoryReportView && window.MoonlightInventoryReportUI) {
    inventoryReportView = window.MoonlightInventoryReportUI.mount($("#inventoryReport"), () => state);
  }
  inventoryReportView?.refresh();
}
