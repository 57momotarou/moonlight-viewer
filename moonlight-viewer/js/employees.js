// employees.js — 概要・従業員一覧・従業員詳細・コイン履歴。
"use strict";

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
  const recent = records.map((r) => {
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
      <div class="detail-alias"><span>${esc(employee.role || "-")} ／ ${esc(statusLabel(employee))}</span><strong>${esc(aliases)}</strong></div>
      <div class="detail-profile-grid overview-person-hero">
        <div><span>累計売上</span><strong>${money(totals.total)}</strong><small>${records.length}件</small></div>
        <div><span>累計コイン</span><strong>${Math.round(num(employee.coins))}枚</strong><small>今回算定 ${employee.role === "店長" ? "対象外" : `${Math.round(bonusCoins(employee))}枚`}</small></div>
        <div><span>今回の支給予定</span><strong>${current ? money(current.amount) : "対象外"}</strong></div>
      </div>
      <details class="detail-section"><summary>カテゴリ別の累計売上</summary><div class="breakdown-grid detail-money-grid">
        ${amountCell("食べ物売上", money(totals.food))}${amountCell("飲み物売上", money(totals.drink))}
        ${amountCell("ジョイント売上", money(totals.joint))}${amountCell("その他売上", money(totals.other))}
      </div></details>
      <div class="detail-section"><h3>販売実績（${records.length}件）</h3><div class="detail-list detail-sales-scroll">${recent}</div></div>
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
    totals.foodQty += recordCategoryQty(record, "food");
    totals.drinkQty += recordCategoryQty(record, "drink");
    totals.jointQty += recordCategoryQty(record, "joint");
    return totals;
  }, { food: 0, drink: 0, joint: 0, other: 0, foodQty: 0, drinkQty: 0, jointQty: 0 });
  const today = new Date();
  const y = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayRecords = allRecords.filter((record) => String(record.invoiceAt || record.saleDate || "").slice(0, 10) === y);
  const todayBreakdown = todayRecords.reduce((totals, record) => {
    const amount = recordAmounts(record);
    totals.food += amount.food;
    totals.drink += amount.drink;
    totals.joint += amount.joint;
    totals.other += amount.other;
    totals.total += amount.total;
    totals.foodQty += recordCategoryQty(record, "food");
    totals.drinkQty += recordCategoryQty(record, "drink");
    totals.jointQty += recordCategoryQty(record, "joint");
    return totals;
  }, { food: 0, drink: 0, joint: 0, other: 0, total: 0, foodQty: 0, drinkQty: 0, jointQty: 0 });
  const lastPayout = [...(state.payoutHistory || [])].sort((a, b) => String(b.payoutDate || "").localeCompare(String(a.payoutDate || "")))[0];
  const buyers = buyerSummary();
  const deliveryCount = (state.deliveryOrders || []).length;
  const cumulativeCoins = (state.employees || []).reduce((sum, employee) => sum + Math.max(0, Math.round(num(employee.coins))), 0);

  els.cloudMeta.textContent = "";
  if (els.overviewTodayLabel) els.overviewTodayLabel.textContent = dateOnly(y);
  els.overviewCards.innerHTML = `
      <div class="overview-today-total"><span>今日の売上合計</span><strong>${money(todayBreakdown.total)}</strong><small>${todayRecords.length.toLocaleString("ja-JP")}伝票</small></div>
      <div class="overview-detail-grid">
        ${amountCell("食べ物", money(todayBreakdown.food), qty(todayBreakdown.foodQty))}
        ${amountCell("飲み物", money(todayBreakdown.drink), qty(todayBreakdown.drinkQty))}
        ${amountCell("ジョイント", money(todayBreakdown.joint), qty(todayBreakdown.jointQty))}
        ${amountCell("その他売上", money(todayBreakdown.other))}
      </div>
    `;
  els.overviewExtraDetails.innerHTML = `
      <div class="overview-detail-grid">
        ${amountCell("食べ物売上", money(totalBreakdown.food), qty(totalBreakdown.foodQty))}
        ${amountCell("飲み物売上", money(totalBreakdown.drink), qty(totalBreakdown.drinkQty))}
        ${amountCell("ジョイント売上", money(totalBreakdown.joint), qty(totalBreakdown.jointQty))}
        ${amountCell("その他売上", money(totalBreakdown.other))}
        ${amountCell("売上合計", money(allAmounts), `${allRecords.length.toLocaleString("ja-JP")}伝票`)}
        ${amountCell("コイン累計", `${cumulativeCoins.toLocaleString("ja-JP")}枚`)}
        ${amountCell("在籍人数", `${active.toLocaleString("ja-JP")}人`)}
        ${amountCell("購入者", `${buyers.length.toLocaleString("ja-JP")}人`)}
        ${amountCell("デリバリー", `${deliveryCount.toLocaleString("ja-JP")}件`)}
        ${amountCell("最終支給日", lastPayout?.payoutDate ? dateOnly(lastPayout.payoutDate) : "-")}
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
