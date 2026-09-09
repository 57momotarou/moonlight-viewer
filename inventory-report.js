/* Shared, read-only inventory reconciliation for the desktop app and iPhone viewer. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MoonlightInventoryReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CATEGORIES = ["food", "drink", "joint"];
  const LABELS = { food: "食べ物", drink: "飲み物", joint: "ジョイント" };
  const MATERIALS = { food: "ご飯の素", drink: "飲み物の素", joint: "リラックスの素", sweet: "甘いものの素" };
  const COIN_EXCHANGE_CHANGE_AT = "2026-09-03T17:00";
  const list = value => Array.isArray(value) ? value.filter(item => item && typeof item === "object") : [];
  const text = value => String(value ?? "").normalize("NFKC").trim();
  const key = value => text(value).toLowerCase().replace(/[\s_\-・.()（）]+/g, "");
  function number(value) {
    const result = Number(text(value).replace(/[,$￥¥\s]/g, ""));
    return Number.isFinite(result) ? result : 0;
  }
  const quantity = value => Math.max(0, Math.round(number(value)));
  const amount = value => Math.max(0, number(value));
  const zeroCounts = () => ({ food: 0, drink: 0, joint: 0 });
  const sum = (rows, get) => rows.reduce((total, row) => total + get(row), 0);

  function category(value) {
    const v = text(value).toLowerCase();
    if (["food", "食べ物", "foodrow"].includes(v)) return "food";
    if (["drink", "飲み物", "drinkrow"].includes(v)) return "drink";
    if (["joint", "ジョイント", "jointrow"].includes(v)) return "joint";
    return "";
  }

  function deliveryCategory(name, explicit) {
    if (category(explicit)) return category(explicit);
    const v = key(name);
    if (/ホットサンド|hotsandwich|たらこ|tarako|hatanorotxi|hatanorotchi/.test(v)) return "food";
    if (/カフェラテ|cafelatte|ブラックコーヒー|blackcoffee|紅茶|tea/.test(v)) return "drink";
    if (/ティラミス|tiramisu|ピーチ|peach|もも|コンポート|compot|sushitozzo|すしトッツォ|寿司トッツォ/.test(v)) return "joint";
    return "";
  }

  // Match the app's wall-clock, minute-based comparison. Never invent a date for a report.
  function dateTime(value) {
    const raw = text(value);
    const m = raw.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
    if (!m) return "";
    const y = Number(m[1]), month = Number(m[2]), d = Number(m[3]);
    const hh = Number(m[4] || 0), mm = Number(m[5] || 0);
    const check = new Date(Date.UTC(y, month - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== d || hh > 23 || mm > 59) return "";
    return `${m[1]}-${m[2]}-${m[3]}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  // A stock difference is attributed to its ending snapshot. This deliberately
  // applies the new rate to the Sep 3 -> Sep 4 interval, without inventing exchange times.
  function coinExchangeForInterval(startAt, endAt, spentCoins) {
    const start = dateTime(startAt), end = dateTime(endAt);
    const materialsPerSet = end ? (end < COIN_EXCHANGE_CHANGE_AT ? 50 : 100) : null;
    const spent = quantity(spentCoins), exchangeSets = Math.floor(spent / 10);
    return { materialsPerSet, exchangeSets,
      materialEquivalent: materialsPerSet === null ? null : exchangeSets * materialsPerSet,
      remainder: spent % 10,
      spansRateChange: Boolean(start && end && start < COIN_EXCHANGE_CHANGE_AT && end >= COIN_EXCHANGE_CHANGE_AT) };
  }

  function catalogResolver(state) {
    const catalog = list(state.productCatalog).filter(p => p.active !== false).map(p => ({
      id: text(p.id), name: text(p.name || p.productName || p.label),
      category: category(p.category) || deliveryCategory(p.stashName || p.name) || "food",
      names: [p.name, p.stashName || p.stashDisplayName || p.inventoryName || p.stash_name, ...(Array.isArray(p.aliases) ? p.aliases : [])].map(key).filter(Boolean)
    }));
    return (name, cat, id) => {
      const byId = id && catalog.find(p => p.id === id);
      if (byId) return byId;
      const nameKey = key(name);
      if (!nameKey) return null;
      const candidates = catalog.filter(p => !cat || p.category === cat);
      const exact = candidates.find(p => p.names.includes(nameKey));
      if (exact) return exact;
      const partial = candidates.filter(p => p.names.some(n => n.includes(nameKey) || nameKey.includes(n)));
      return partial.length === 1 ? partial[0] : null;
    };
  }

  function snapshot(raw, index, resolve) {
    let unknownProducts = 0;
    const products = list(raw.products).map(item => {
      const name = text(item.name || item.label || item.recognizedName || item.unresolvedName || "商品名なし");
      const cat = category(item.category || item.rowCategory);
      const id = text(item.productCatalogId || item.product_catalog_id);
      const matched = resolve(name, cat, id);
      const resolvedCategory = matched?.category || cat;
      if (!resolvedCategory) unknownProducts++;
      return {
        name: matched?.name || name, category: resolvedCategory,
        productCatalogId: matched?.id || id,
        count: quantity(item.count ?? item.qty ?? item.quantity)
      };
    });
    const materials = {};
    for (const cat of Object.keys(MATERIALS)) materials[cat] = quantity(raw.materials?.[cat] ?? raw[`${cat}Material`] ?? raw[`${cat}_material_count`]);
    const totals = zeroCounts(), productTotals = zeroCounts();
    for (const cat of CATEGORIES) {
      productTotals[cat] = sum(products.filter(p => p.category === cat), p => p.count);
      totals[cat] = productTotals[cat] + materials[cat];
    }
    return {
      id: text(raw.id) || `report-snapshot-${index}`, capturedAt: dateTime(raw.capturedAt || raw.recordedAt),
      isBaseline: raw.isBaseline === true, createdAt: text(raw.updatedAt || raw.createdAt),
      products, materials, productTotals, totals, unknownProducts,
      spCoins: quantity(raw.spCoins ?? raw.sp_coin_count ?? raw.spCoinCount), note: text(raw.note)
    };
  }

  function eventsFromState(state) {
    const employees = new Map(list(state.employees).map(e => [text(e.id), text(e.name)]));
    const employeeName = raw => employees.get(text(raw.employeeId || raw.employee_id)) || text(raw.employeeName || raw.employee_name) || "従業員未設定";
    const events = list(state.dailySales).map((raw, i) => {
      const rawAt = raw.invoiceAt || raw.invoiceDatetime || raw.billingAt || raw.saleDate;
      const counts = zeroCounts();
      let totalAmount = amount(raw.otherAmount);
      for (const cat of CATEGORIES) {
        counts[cat] = amount(raw[`${cat}Qty`]);
        totalAmount += counts[cat] * amount(raw[`${cat}UnitPrice`] ?? raw[`${cat}_unit_price`] ?? (cat === "joint" ? 50000 : 30000));
      }
      let unknownItems = 0;
      for (const item of list(raw.customItems || raw.custom_items)) {
        const cat = category(item.category), count = quantity(item.count ?? item.qty ?? item.quantity);
        if (!cat) { unknownItems++; continue; }
        if (count === 0) continue;
        counts[cat] += count;
        const price = amount(item.unitPrice ?? item.unit_price ?? item.salePrice);
        totalAmount += amount(item.totalAmount ?? item.total_amount ?? item.amount) || count * price;
      }
      for (const cat of CATEGORIES) counts[cat] = Math.round(counts[cat]);
      const hasCategoryFields = ["foodQty", "drinkQty", "jointQty", "otherAmount"].some(k => Object.prototype.hasOwnProperty.call(raw, k));
      return {
        kind: "sale", id: text(raw.id) || `sale-${i}`, at: dateTime(rawAt), dateOnly: !/[ T]\d{1,2}:\d{2}/.test(text(rawAt)),
        label: employeeName(raw), buyer: text(raw.buyerName || raw.purchaserName || raw.customerName), counts,
        otherAmount: amount(raw.otherAmount), totalAmount,
        invoiceAmount: amount(raw.transactionTotal ?? raw.transaction_total),
        unclassified: unknownItems > 0 || amount(hasCategoryFields ? raw.legacySales : (raw.sales || raw.legacySales)) > 0,
        note: text(raw.note)
      };
    });
    list(state.deliveryOrders).forEach((raw, i) => {
      const rawAt = raw.recordedAt || raw.orderAt || raw.order_at;
      const counts = zeroCounts();
      let unknownItems = 0;
      for (const item of list(raw.items)) {
        const cat = deliveryCategory(item.name || item.product_name || item.recognizedName, item.category);
        const count = quantity(item.count ?? item.qty ?? item.quantity);
        if (cat) counts[cat] += count;
        else unknownItems += count;
      }
      for (const cat of CATEGORIES) counts[cat] = quantity(raw[`${cat}Qty`] ?? raw[`${cat}_count`] ?? counts[cat]);
      events.push({ kind: "delivery", id: text(raw.id) || `delivery-${i}`, at: dateTime(rawAt),
        dateOnly: !/[ T]\d{1,2}:\d{2}/.test(text(rawAt)), label: text(raw.orderNo || raw.order_no) || "デリバリー",
        buyer: text(raw.buyerName || raw.buyer_name || raw.customerName), counts, unknownItems, note: text(raw.note) });
    });
    list(state.coinHistory || state.coinTransactions || state.coinLogs).forEach((raw, i) => {
      const rawAt = Object.prototype.hasOwnProperty.call(raw, "recordedAt") ? raw.recordedAt : (raw.registeredAt || raw.createdAt);
      const source = ["manual", "opening", "initial", "adjustment"].includes(raw.source) ? raw.source : "manual";
      events.push({ kind: "coin", id: text(raw.id) || `coin-${i}`, at: dateTime(rawAt),
        dateOnly: !/[ T]\d{1,2}:\d{2}/.test(text(rawAt)), label: employeeName(raw), source,
        amount: Math.round(number(raw.amount ?? raw.coins ?? raw.quantity)), note: text(raw.note) });
    });
    return events.sort((a, b) => a.at.localeCompare(b.at));
  }

  function itemChanges(start, end) {
    const entries = new Map();
    function append(s, side) {
      for (const product of s.products) {
        const id = `product:${product.category}:${product.productCatalogId || key(product.name)}`;
        if (!entries.has(id)) entries.set(id, { id, name: product.name, category: product.category, kind: "product", unit: "個", before: 0, after: 0 });
        entries.get(id)[side] += product.count;
        if (side === "after") entries.get(id).name = product.name;
      }
      for (const cat of Object.keys(MATERIALS)) {
        const id = `material:${cat}`;
        if (!entries.has(id)) entries.set(id, { id, name: MATERIALS[cat], category: cat, kind: "material", unit: "個", before: 0, after: 0 });
        entries.get(id)[side] = s.materials[cat];
      }
      if (!entries.has("coin")) entries.set("coin", { id: "coin", name: "在庫内のSPコイン", kind: "coin", unit: "枚", before: 0, after: 0 });
      entries.get("coin")[side] = s.spCoins;
    }
    append(start, "before"); append(end, "after");
    return [...entries.values()].map(row => ({ ...row, delta: row.after - row.before }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name, "ja"));
  }

  function reconcile(start, end, events) {
    const sales = events.filter(e => e.kind === "sale"), deliveries = events.filter(e => e.kind === "delivery");
    const coins = events.filter(e => e.kind === "coin");
    const categories = CATEGORIES.map(cat => {
      const saleQty = sum(sales, e => e.counts[cat]), deliveryQty = sum(deliveries, e => e.counts[cat]);
      const before = start.totals[cat], after = end.totals[cat], expected = before - saleQty - deliveryQty;
      const difference = after - expected;
      return { category: cat, label: LABELS[cat], before, after, expected, difference,
        productBefore: start.productTotals[cat], productAfter: end.productTotals[cat],
        materialBefore: start.materials[cat], materialAfter: end.materials[cat],
        saleQty, deliveryQty, outgoing: saleQty + deliveryQty, delta: after - before,
        loss: Math.max(0, -difference), increase: Math.max(0, difference) };
    });
    const incomingCandidates = coins.filter(e => e.source === "manual" && e.amount > 0);
    const otherCoinEntries = coins.filter(e => e.source !== "manual" || e.amount <= 0);
    const registeredCoins = sum(incomingCandidates, e => e.amount);
    const expectedCoins = start.spCoins + registeredCoins;
    const coinDifference = end.spCoins - expectedCoins;
    const decreaseEquivalent = Math.max(0, -coinDifference);
    return {
      start, end, categories, events, saleCount: sales.length, deliveryCount: deliveries.length, coinCount: coins.length,
      otherAmount: sum(sales, e => e.otherAmount), otherCount: sales.filter(e => e.otherAmount > 0 || e.unclassified).length,
      unknownDeliveryCount: deliveries.filter(e => e.unknownItems > 0).length,
      amountMismatchCount: sales.filter(e => e.invoiceAmount > 0 && Math.abs(e.totalAmount - e.invoiceAmount) >= 1).length,
      loss: sum(categories, r => r.loss), increase: sum(categories, r => r.increase), outgoing: sum(categories, r => r.outgoing),
      delta: sum(categories, r => r.delta), items: itemChanges(start, end),
      coins: { before: start.spCoins, after: end.spCoins, delta: end.spCoins - start.spCoins,
        registered: registeredCoins, correction: sum(otherCoinEntries, e => e.amount), correctionCount: otherCoinEntries.length,
        expected: expectedCoins, difference: coinDifference, decreaseEquivalent,
        ...coinExchangeForInterval(start.capturedAt, end.capturedAt, decreaseEquivalent) }
    };
  }

  function build(rawState = {}, options = {}) {
    const state = rawState || {}, resolve = catalogResolver(state), warnings = [];
    const warn = (code, title, detail) => warnings.push({ code, title, detail });
    const allSnapshots = list(state.inventorySnapshots).map((raw, index) => snapshot(raw, index, resolve));
    const invalidSnapshots = allSnapshots.filter(s => !s.capturedAt).length;
    if (invalidSnapshots) warn("snapshot-date", `日時不明の在庫 ${invalidSnapshots}件`, "比較から除外しています。在庫履歴で日時を修正してください。");
    const byTime = new Map();
    for (const s of allSnapshots.filter(s => s.capturedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) byTime.set(s.capturedAt, s);
    const snapshots = [...byTime.values()].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const duplicateSnapshots = allSnapshots.length - invalidSnapshots - snapshots.length;
    if (duplicateSnapshots) warn("snapshot-duplicate", `同じ日時の在庫 ${duplicateSnapshots}件`, "同じ分の記録は更新日時・作成日時が新しい方（同一ならデータ順で最後）を比較に使います。別時点なら日時を修正してください。");
    const baseline = snapshots.filter(s => s.isBaseline).at(-1) || snapshots[0] || null;
    const end = snapshots.find(s => s.id === options.endId) || snapshots.at(-1) || null;
    const start = snapshots.find(s => s.id === options.startId) || baseline;
    const base = { snapshots, start, end, baseline, warnings, intervals: [], summary: null, events: [], afterEnd: null };
    if (!start || !end) return { ...base, status: "empty", message: "在庫を保存すると、ここにレポートが表示されます。増減の比較には、異なる日時の在庫が2回分必要です。" };
    if (start.capturedAt >= end.capturedAt) return { ...base, status: "range", message: "開始より後の在庫を終了に選んでください。基準を保存した直後は、次の在庫を保存すると増減を比較できます。" };
    const selected = snapshots.filter(s => s.capturedAt >= start.capturedAt && s.capturedAt <= end.capturedAt);
    const unknownProducts = sum(selected, s => s.unknownProducts);
    if (unknownProducts) warn("snapshot-products", `分類不明の在庫商品 ${unknownProducts}項目`, "商品別の増減には表示しますが、3カテゴリの照合には含めません。在庫履歴で割り振りを確認してください。");
    const allEvents = eventsFromState(state);
    const events = allEvents.filter(e => e.at > start.capturedAt && e.at <= end.capturedAt);
    const invalidEvents = allEvents.filter(e => !e.at);
    for (const [kind, label] of [["sale", "請求書"], ["delivery", "デリバリー"], ["coin", "コイン履歴"]]) {
      const count = invalidEvents.filter(e => e.kind === kind).length;
      if (count) warn(`${kind}-date`, `日時不明の${label} ${count}件`, "期間に含められないため除外しています。履歴導入前のコイン残高も、入庫日時が分からない場合は含めません。");
    }
    const dateOnlyCount = events.filter(e => e.dateOnly).length;
    if (dateOnlyCount) warn("event-time", `時刻不明の記録 ${dateOnlyCount}件`, "その日の00:00として照合しています。正確な区間に入るよう、履歴の時刻を確認してください。");
    const boundaryTimes = new Set(selected.map(s => s.capturedAt));
    const boundaryEvents = allEvents.filter(e => e.at && boundaryTimes.has(e.at)).length;
    if (boundaryEvents) warn("boundary", `在庫チェックと同じ分の記録 ${boundaryEvents}件`, "開始時刻と同じ分は対象外、終了時刻と同じ分は対象です。実際の前後関係が違う場合は記録日時を確認してください。");
    const intervals = [];
    let eventIndex = 0;
    for (let i = 1; i < selected.length; i++) {
      const intervalEvents = [];
      while (eventIndex < events.length && events[eventIndex].at <= selected[i].capturedAt) intervalEvents.push(events[eventIndex++]);
      intervals.push(reconcile(selected[i - 1], selected[i], intervalEvents));
    }
    const summary = reconcile(start, end, events);
    for (const row of summary.categories) {
      row.loss = sum(intervals, interval => interval.categories.find(c => c.category === row.category).loss);
      row.increase = sum(intervals, interval => interval.categories.find(c => c.category === row.category).increase);
    }
    summary.loss = sum(intervals, r => r.loss);
    summary.increase = sum(intervals, r => r.increase);
    summary.issueIntervals = intervals.filter(r => r.loss > 0 || r.increase > 0).length;
    summary.coins.intervalDecreaseEquivalent = sum(intervals, r => r.coins.decreaseEquivalent);
    summary.coins.intervalMaterialEquivalent = sum(intervals, r => r.coins.materialEquivalent);
    summary.coins.intervalCount = intervals.length;
    // Convert each measured interval with its own historical rate before adding.
    // Converting the whole period with the final rate would rewrite the old-rate stock differences.
    const exchangeByRate = new Map();
    for (const interval of intervals) {
      const c = interval.coins;
      const total = exchangeByRate.get(c.materialsPerSet) || {
        materialsPerSet: c.materialsPerSet, exchangeSets: 0, materialEquivalent: 0,
        decreaseEquivalent: 0, remainder: 0, intervalCount: 0
      };
      for (const field of ["exchangeSets", "materialEquivalent", "decreaseEquivalent", "remainder"]) total[field] += c[field];
      total.intervalCount++;
      exchangeByRate.set(c.materialsPerSet, total);
    }
    summary.coins.exchangeBreakdown = [...exchangeByRate.values()];
    summary.coins.exchangeSets = sum(intervals, r => r.coins.exchangeSets);
    summary.coins.materialEquivalent = summary.coins.intervalMaterialEquivalent;
    summary.coins.remainder = sum(intervals, r => r.coins.remainder);
    summary.coins.materialsPerSet = exchangeByRate.size === 1 ? summary.coins.exchangeBreakdown[0].materialsPerSet : null;
    summary.coins.rateChangeIntervalCount = intervals.filter(r => r.coins.spansRateChange).length;
    // Keep gross changes too: a loss followed by a replenishment must remain visible.
    const itemTotals = new Map();
    for (const interval of intervals) for (const item of interval.items) {
      const totals = itemTotals.get(item.id) || { increase: 0, decrease: 0, reference: item };
      totals.increase += Math.max(0, item.delta);
      totals.decrease += Math.max(0, -item.delta);
      itemTotals.set(item.id, totals);
    }
    const endpointItems = new Map(summary.items.map(item => [item.id, item]));
    summary.items = [...itemTotals].map(([id, changes]) => ({
      ...(endpointItems.get(id) || { ...changes.reference, before: 0, after: 0, delta: 0 }),
      increase: changes.increase, decrease: changes.decrease
    })).sort((a, b) => (b.increase + b.decrease) - (a.increase + a.decrease) || a.name.localeCompare(b.name, "ja"));
    if (summary.otherCount) warn("other-sales", `数量・分類を確認する請求書 ${summary.otherCount}件`, `その他売上 $${Math.round(summary.otherAmount).toLocaleString("en-US")} は数量へ換算していません。販売実績の詳細でカテゴリ・個数を割り振ると再計算されます。`);
    if (summary.unknownDeliveryCount) warn("delivery-items", `分類不明の商品を含むデリバリー ${summary.unknownDeliveryCount}件`, "保存済みのカテゴリ別個数だけで照合しています。デリバリー履歴で数量と割り振りを確認してください。");
    if (summary.amountMismatchCount) warn("sale-amount", `請求金額と内訳が異なる記録 ${summary.amountMismatchCount}件`, "数量は保存済みの個数を使っています。その他売上から割り振った場合は金額の二重計上がないかも確認してください。");
    const negativeExpected = sum(intervals, r => r.categories.filter(c => c.expected < 0).length);
    if (negativeExpected) warn("negative-expected", `開始在庫より販売数が多い区間・カテゴリ ${negativeExpected}件`, "補充記録がないか、請求書の重複・日時・個数や在庫の読み取り結果を確認してください。");
    const afterEnd = allEvents.filter(e => e.at > end.capturedAt);
    const afterCounts = { sales: afterEnd.filter(e => e.kind === "sale").length,
      deliveries: afterEnd.filter(e => e.kind === "delivery").length, coins: afterEnd.filter(e => e.kind === "coin").length };
    return { ...base, status: "ready", summary, intervals, events, afterEnd: afterCounts };
  }

  return { build, dateTime, coinExchangeForInterval, COIN_EXCHANGE_CHANGE_AT, CATEGORIES, LABELS, MATERIALS };
});
