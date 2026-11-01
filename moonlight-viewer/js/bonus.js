// bonus.js — 今回のボーナス・支給履歴の詳細。
"use strict";

function bonusBreakdownMarkup(entry) {
  if (entry.managerRemainder) {
    return `
        ${amountCell("ボーナス予算", money(entry.targetAmount))}
        ${amountCell("店長以外の支給総額", money(entry.otherEmployeeTotal))}
        ${amountCell("店長の残額", money(entry.amount), entry.managerCount > 1 ? `店長${entry.managerCount}人で均等分配` : `${money(entry.targetAmount)} − ${money(entry.otherEmployeeTotal)}`)}
        ${amountCell("対象期間の売上", money(entry.sales), "店長の支給額には加算しません")}`;
  }
  return `
      ${amountCell("役職固定給", money(entry.roleBonus), entry.e.role || "-")}
      ${amountCell("売上による支給額", money(entry.salesBonus), `${money(entry.sales)} × ${entry.rate.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}%`)}
      ${amountCell("算定コイン", `${Math.round(entry.coins).toLocaleString("ja-JP")}枚`, `${Math.round(entry.coins).toLocaleString("ja-JP")}枚 × ${money(entry.coinUnitAmount)} = ${money(entry.coinBonus)}`)}
      ${amountCell("コインによる支給額", money(entry.coinBonus))}
      ${amountCell("合計支給額", money(entry.amount))}
      ${amountCell("自動支給額", money(entry.auto), `${money(entry.roleBonus)} + ${money(entry.salesBonus)} + ${money(entry.coinBonus)} / 1,000円未満切り上げ`)}`;
}

function periodSalesMarkup(employeeId, start, end) {
  const records = (state.dailySales || []).filter(r => employeeId && String(employeeForRecord(r)?.id || r.employeeId) === String(employeeId)
    && periodIncludes(r.invoiceAt || r.saleDate, start, end)).sort((a,b) => String(b.invoiceAt || b.saleDate).localeCompare(String(a.invoiceAt || a.saleDate)));
  return `<div class="detail-section"><h3>期間中の販売実績（${records.length}件）</h3><div class="detail-list detail-sales-scroll">${records.map(r => `<details class="detail-sale-row"><summary>${invoiceAt(r.invoiceAt || r.saleDate)} ／ ${esc(r.buyerName || "-")} ／ ${money(recordAmounts(r).total)}</summary><div class="detail-sale-breakdown">${["food","drink","joint"].map(cat => `<span>${({food:"食べ物",drink:"飲み物",joint:"ジョイント"})[cat]} ${qty(recordCategoryQty(r,cat))} ／ ${money(recordAmounts(r)[cat])}</span>`).join("")}<span>その他 ${money(recordAmounts(r).other)}</span></div></details>`).join("") || '<div class="empty-state">販売実績はありません</div>'}</div></div>`;
}

function historicalBonusMarkup(payout, entry) {
  const coins = entry.calculationCoins ?? entry.coins ?? entry.bonusCoins;
  const stored = value => value == null ? "記録なし" : money(value);
  return `<details class="history-employee-detail"><summary><strong>${esc(entry.employeeName || entry.name || "-")}</strong><span>${money(entry.amount)}</span></summary><div class="breakdown-grid">
      ${amountCell("今回算定コイン（支給時）", entry.managerRemainder ? "対象外" : coins == null ? "記録なし" : `${Math.round(num(coins))}枚`)}
      ${amountCell("コインによる支給額", entry.managerRemainder ? "対象外" : stored(entry.coinBonus))}
      ${amountCell("売上による支給額", entry.managerRemainder ? "対象外" : stored(entry.salesBonus))}
      ${amountCell("役職固定給", entry.managerRemainder ? "対象外" : stored(entry.roleBonus))}
      ${amountCell("合計支給額", money(entry.amount), "支給時の記録")}</div>
      ${periodSalesMarkup(entry.employeeId, payout.periodStart || payout.bonusStartDate, payout.periodEnd || payout.bonusEndDate)}</details>`;
}

function openBonusDetail(employeeId) {
  const entry = currentBonusEntries().find((item) => String(item.e.id) === String(employeeId || ""));
  if (!entry) return;
  const settings = state.settings || {};
  openSharedDetail("BONUS DETAIL", `${entry.e.name || "従業員"} のボーナス`, `
      <div class="detail-profile-grid">
        <article><span>役職</span><strong>${esc(entry.e.role || "-")}</strong></article>
        <article><span>対象期間</span><strong>${dateOnly(settings.bonusStartDate)}〜${dateOnly(settings.bonusEndDate)}</strong></article>
        <article><span>対象期間の売上</span><strong>${money(entry.sales)}</strong></article>
        <article><span>今回の支給額</span><strong>${money(entry.amount)}</strong></article>
      </div>
      <div class="detail-section"><h3>算定内訳</h3><div class="breakdown-grid">${bonusBreakdownMarkup(entry)}</div></div>${periodSalesMarkup(employeeId, settings.bonusStartDate, settings.bonusEndDate)}`);
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
        return `<article class="item-card tap-detail-card compact-bonus-card" data-bonus-area="${esc(x.e.id)}">
      <div class="item-top"><div><div class="item-title">${esc(x.e.name || "-")}</div><div class="item-meta">${esc(x.e.role || "-")}${x.managerRemainder ? " / 店長の残額" : ` / 算定コイン ${Math.round(x.coins).toLocaleString("ja-JP")}枚`}</div></div><div><div class="money">${money(x.amount)}</div><div class="money-note">支給額</div></div></div>
    </article>`;
      })
      .join("") || empty("対象従業員がいません");

  const hist = [...(state.payoutHistory || [])].sort((a, b) => String(b.payoutDate || "").localeCompare(String(a.payoutDate || "")));
  els.payoutHistory.innerHTML =
    hist
      .map(
        (h) => `<details class="item-card payout-history-card">
      <summary><div class="item-top"><div><div class="item-title">${dateOnly(h.payoutDate)}</div><div class="item-meta">${dateOnly(h.periodStart || h.bonusStartDate)}〜${dateOnly(h.periodEnd || h.bonusEndDate)}</div></div><div><div class="money sm">${money(h.totalAmount || h.actualTotal || h.total)}</div><div class="money-note">支給総額</div></div></div></summary>
      <div class="payout-history-details">${(h.entries || h.payouts || []).map(x => historicalBonusMarkup(h, x)).join("") || '<div><span>内訳なし</span></div>'}</div>
    </details>`
      )
      .join("") || empty("支給履歴がありません");
}
