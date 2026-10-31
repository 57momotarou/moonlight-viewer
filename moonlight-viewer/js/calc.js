// calc.js — Windows版と同じ集計（売上・算定コイン・今回のボーナス）。
"use strict";

function effectiveCoinUnitAmount(settings = {}) {
  const saved = Math.max(0, num(settings.coinUnitAmount));
  if (settings.bonusCoinDefaultV2 === true) return saved || 80000;
  return saved === 0 || saved === 30000 ? 80000 : saved;
}

function roleFixedBonus(employee, settings = {}) {
  if (!employee || employee.role === "店長") return 0;
  return Math.max(0, Math.round(num(settings.roleBonuses?.[employee.role] ?? 0)));
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
    if (categoryKey(item.category) === "food") food += amount;
    if (categoryKey(item.category) === "drink") drink += amount;
    if (categoryKey(item.category) === "joint") joint += amount;
  }
  const other = num(r.otherAmount);
  return { food, drink, joint, other, total: food + drink + joint + other };
}

function recordCategoryQty(r, category) {
  const custom = (Array.isArray(r.customItems) ? r.customItems : [])
    .filter((item) => categoryKey(item.category) === category)
    .reduce((sum, item) => sum + num(item.count), 0);
  return num(r[`${category}Qty`]) + custom;
}

function bonusCoins(e) {
  const override = state.bonusComponentOverrides?.[e?.id];
  if (override && Object.prototype.hasOwnProperty.call(override, "coins")) return Math.max(0, Math.round(num(override.coins)));
  let paid = 0;
  for (const payout of state.payoutHistory || []) for (const item of payout.entries || payout.payouts || []) {
    // 店長行は、算定枚数（calculationCoins）が記録されている場合だけ数える（Windows版と同じ）。
    if (item.managerRemainder && !Object.prototype.hasOwnProperty.call(item, "calculationCoins")) continue;
    const match = item.employeeId && e?.id ? String(item.employeeId) === String(e.id) : String(item.employeeName || item.name) === String(e?.name);
    if (match) paid += Math.max(0, Math.round(num(item.calculationCoins ?? item.coins ?? item.bonusCoins)));
  }
  return Math.max(0, Math.round(num(e?.coins)) - paid);
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
