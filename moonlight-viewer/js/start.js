// start.js — イベント登録と起動。最後に読み込むこと。
"use strict";

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
  setMoreMenuOpen(false);
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
  setMoreMenuOpen(false);
  clearSession();
  location.reload();
});

ensureHelpSettings();

$$(".nav-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    showPage(btn.dataset.pageTarget);
  })
);

$$('[data-more-target]').forEach((btn) => btn.addEventListener("click", () => showPage(btn.dataset.moreTarget)));

els.moreMenuBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  setMoreMenuOpen(els.moreSheet?.classList.contains("hidden"));
});

document.addEventListener("click", (event) => {
  if (els.moreSheet?.classList.contains("hidden")) return;
  if (event.target.closest("#moreSheet, #moreMenuBtn")) return;
  setMoreMenuOpen(false);
});

els.viewerScreen?.addEventListener("click", (event) => {
  if (event.target.closest("button, input, select, textarea, a, label")) return;
  const deliveryArea = event.target.closest("[data-delivery-area]");
  if (deliveryArea?.dataset.deliveryArea) { event.preventDefault(); openDeliveryDetail(deliveryArea.dataset.deliveryArea); return; }
  const saleArea = event.target.closest("[data-sale-area]");
  if (saleArea?.dataset.saleArea) { event.preventDefault(); openSalesDetail(saleArea.dataset.saleArea); return; }
  const summaryArea = event.target.closest("[data-sales-summary-area]");
  if (summaryArea?.dataset.salesSummaryArea) { event.preventDefault(); openSalesSummaryDetail(summaryArea.dataset.salesSummaryArea); return; }
  const inventoryArea = event.target.closest("[data-inventory-area]");
  if (inventoryArea?.dataset.inventoryArea) { event.preventDefault(); openInventoryDetail(inventoryArea.dataset.inventoryArea); return; }
  const bonusArea = event.target.closest("[data-bonus-area]");
  if (bonusArea?.dataset.bonusArea) { event.preventDefault(); openBonusDetail(bonusArea.dataset.bonusArea); return; }
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

init();
