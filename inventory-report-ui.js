(function (root) {
  "use strict";
  const engine = root.MoonlightInventoryReport;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const num = value => Math.round(value || 0).toLocaleString("ja-JP");
  const qty = value => `${num(value)}個`;
  const coin = value => `${num(value)}枚`;
  const signed = (value, unit = "個") => `${value > 0 ? "+" : ""}${num(value)}${unit}`;
  const date = value => String(value || "").replace("T", " ").replace(/-/g, "/");
  const money = value => `$${num(value)}`;
  const pair = (label, value, cls = "") => `<div class="ir-pair"><dt>${esc(label)}</dt><dd class="${cls}">${esc(value)}</dd></div>`;
  const badge = (label, cls = "") => `<span class="ir-badge ${cls}">${esc(label)}</span>`;
  const detail = (key, title, meta, content, open = false) => `<details class="ir-detail" data-ir-key="${esc(key)}"${open ? " open" : ""}><summary><span>${esc(title)}</span><span class="ir-meta">${meta}</span></summary><div class="ir-content">${content}</div></details>`;

  function categoryHtml(row, key, open = false, interval = false) {
    const badges = [badge(`在庫 ${signed(row.delta)}`)];
    if (row.loss) badges.push(badge(`減少差 ${qty(row.loss)}`, "ir-loss"));
    if (row.increase) badges.push(badge(`増加差 ${qty(row.increase)}`, "ir-gain"));
    if (row.exchangePending) badges.push(badge("交換先の確認待ち", "ir-gain"));
    else if (!row.loss && !row.increase) badges.push(badge("数量一致", "ir-ok"));
    let note = "";
    if (row.materialAfter < row.materialBefore && row.productAfter > row.productBefore && row.difference === 0 && !row.exchanged && !row.stockIn && !row.stockOut) {
      note = '<p class="ir-note">素材が減り、商品が増えています。素1個から商品1個を作った場合の変化と数量上は整合します。</p>';
    }
    const content = `<dl class="ir-grid ir-equation">
      ${pair("開始在庫（商品＋素）", qty(row.before))}
      ${pair("確認済みのコイン交換", `＋${qty(row.exchanged || 0)}`)}
      ${pair("その他の補充", `＋${qty(row.stockIn || 0)}`)}
      ${pair("店頭販売", `−${qty(row.saleQty)}`)}
      ${pair("デリバリー", `−${qty(row.deliveryQty)}`)}
      ${pair("販売以外の使用・移動", `−${qty(row.stockOut || 0)}`)}
      ${pair(row.exchangePending ? "計算上の終了在庫（交換先未確定）" : "計算上の終了在庫", qty(row.expected))}
      ${pair("実際の終了在庫", qty(row.after))}
      ${pair("実在庫 − 計算上の在庫", signed(row.difference), row.difference < 0 ? "ir-loss" : row.difference > 0 ? "ir-gain" : "ir-ok")}
    </dl><dl class="ir-grid">
      ${pair("商品の実数", `${num(row.productBefore)} → ${qty(row.productAfter)}`)}
      ${pair("対応する素の実数", `${num(row.materialBefore)} → ${qty(row.materialAfter)}`)}
      ${pair(interval ? "記録上の不足" : "各区間の不足の合計", qty(row.loss), "ir-loss")}
      ${pair(interval ? "説明がついていない増加" : "各区間の増加差の合計", qty(row.increase), "ir-gain")}
    </dl>${note}`;
    return detail(key, row.label, badges.join(""), content, open);
  }

  function itemsHtml(items, key, open = false) {
    const changed = items.filter(item => item.delta !== 0 || item.increase || item.decrease);
    const unchanged = items.filter(item => !changed.includes(item));
    const rowHtml = item => {
      const label = item.kind === "coin" ? "コイン" : item.category === "sweet" ? "参考素材" : engine.LABELS[item.category] || "分類不明";
      const gross = item.increase !== undefined ? `<small>区間別：増 ${num(item.increase)} / 減 ${num(item.decrease)}${esc(item.unit)}</small>` : "";
      return `<div class="ir-item"><div><strong>${esc(item.name)}</strong><small>${esc(label)}</small></div><div class="ir-item-numbers"><b class="${item.delta < 0 ? "ir-loss" : item.delta > 0 ? "ir-gain" : ""}">${esc(signed(item.delta, item.unit))}</b><span>${num(item.before)} → ${num(item.after)}${esc(item.unit)}</span>${gross}</div></div>`;
    };
    return detail(key, "商品・素材ごとの増減", badge(`変化あり ${changed.length}項目`),
      '<p class="ir-note">実際に保存された在庫数の変化です。商品別の減少には販売や製造による変化も含まれます。甘いものの素も判定対象です。SPコインは枚数で別に照合します。</p>' +
      (changed.map(rowHtml).join("") || '<p class="ir-note">在庫数の変化はありません。</p>') +
      (unchanged.length ? detail(`${key}-unchanged`, "変化なし", badge(`${unchanged.length}項目`), unchanged.map(rowHtml).join(""), open) : ""), open);
  }

  function coinsHtml(row, key, open = false) {
    const c = row.coins;
    const multiple = c.intervalCount > 1;
    const breakdown = c.exchangeBreakdown || [c];
    const rateLines = breakdown.map(part => `<p>10枚 → 素${num(part.materialsPerSet)}個：${coin(part.decreaseEquivalent)}の減少相当から ${num(part.exchangeSets)}回・素 ${qty(part.materialEquivalent)}相当${multiple ? `（${num(part.intervalCount)}区間）` : ""}</p>`).join("");
    const grossNote = multiple ? `<p>区間別の減少相当は計 ${coin(c.intervalDecreaseEquivalent)}、交換候補の合計は素 ${qty(c.materialEquivalent)}です。各区間の換算結果を合算し、途中のコイン増加とは相殺していません。</p>` : "";
    const changeNote = (c.rateChangeIntervalCount ?? (c.spansRateChange ? 1 : 0)) > 0
      ? '<p class="ir-note">切替日時をまたぐ区間は、終了側の新しい換算を適用しています。9/3→9/4の在庫差分は10枚→素100個です。実際の交換日時を推定して前後に振り分ける計算ではありません。</p>' : "";
    const matchesExchange = c.materialEquivalent > 0 && c.remainder === 0 && row.loss === 0 && row.increase === c.materialEquivalent && row.start.materials.sweet === row.end.materials.sweet;
    const matchNote = matchesExchange ? `<p class="ir-note">3カテゴリの増加差 ${qty(row.increase)} は、この交換候補の合計と数量上は一致します。実際の交換先と入庫時刻を確認してください。</p>` : "";
    const coinIncreaseNote = c.difference > 0 ? `<p class="ir-note">登録分を加えてもSPコインが ${coin(c.difference)} 多くなっています。コイン登録漏れ・別の入庫・画像の読み取りを確認してください。</p>` : "";
    const content = `<dl class="ir-grid">
      ${pair("在庫内のSPコイン", `${num(c.before)} → ${coin(c.after)}（${signed(c.delta, "枚")}）`)}
      ${pair("期間内のコイン登録（正の枚数）", coin(c.registered))}
      ${pair("累計修正・初期登録・負の登録", `${signed(c.correction, "枚")} / ${num(c.correctionCount)}件`)}
      ${pair("登録分が全て入庫した場合", coin(c.expected))}
      ${pair("その場合の実在庫との差", signed(c.difference, "枚"))}
      ${pair(multiple ? "開始・終了から見た減少相当" : "その場合の使用・移動等に相当", coin(c.decreaseEquivalent))}
    </dl><div class="ir-callout"><strong>交換した場合の参考値</strong>${rateLines}${grossNote}<p>10枚単位に満たない分${multiple ? "（各区間の合計）" : ""}は ${coin(c.remainder)}です。</p></div>
    <p class="ir-note">換算は各区間の終了在庫日時で判定します。${esc(date(engine.COIN_EXCHANGE_CHANGE_AT))}より前は10枚→素50個、同時刻以降は10枚→素100個です。</p>${changeNote}${matchNote}${coinIncreaseNote}
    <p class="ir-note">上の参考計算は、正のコイン登録分がすべて入庫し、差分が交換に使われた場合の仮定です。区間ごとに記録した実際の交換・入出庫は、先頭の判定とカテゴリ別内訳に反映します。累計修正・初期登録・負の登録は自動で入庫に加えません。</p>`;
    return detail(key, "コインと交換の照合", badge(`SP ${signed(c.delta, "枚")}`) + badge(`登録 ${coin(c.registered)}`), content, open);
  }

  function evidenceRows(events, limit = Infinity) {
    return events.slice(0, limit).map(event => {
      const source = { manual: "コイン登録", opening: "履歴導入前", initial: "初期登録", adjustment: "累計修正" };
      const label = event.kind === "sale" ? "店頭販売" : event.kind === "delivery" ? "デリバリー" : source[event.source];
      const counts = event.counts ? engine.CATEGORIES.map(c => `${engine.LABELS[c]} ${qty(event.counts[c])}`).join(" / ") : signed(event.amount, "枚");
      const other = event.kind === "sale" ? ` / その他 ${money(event.otherAmount)} / 合計 ${money(event.totalAmount)}` : "";
      const mismatch = event.invoiceAmount > 0 && Math.abs(event.totalAmount - event.invoiceAmount) >= 1;
      return `<article class="ir-evidence-row"><div class="ir-row-head"><strong>${esc(event.label)}</strong>${badge(label)}</div>
        <p class="ir-note">${esc(date(event.at))}${event.buyer ? ` / 購入者 ${esc(event.buyer)}` : ""}</p>
        <p>${esc(counts + other)}</p>${mismatch ? `<p class="ir-loss">請求書の合計 ${money(event.invoiceAmount)} と内訳が異なります。</p>` : ""}
        ${event.note ? `<p class="ir-note">${esc(event.note)}</p>` : ""}</article>`;
    }).join("") || '<p class="ir-note">この区間に保存済みの記録はありません。</p>';
  }

  function evidenceHtml(events, key, open = false, all = false) {
    const meta = badge(`店頭 ${events.filter(e => e.kind === "sale").length}件`) + badge(`デリバリー ${events.filter(e => e.kind === "delivery").length}件`) + badge(`コイン ${events.filter(e => e.kind === "coin").length}件`);
    if (all) return detail(key, "照合に使った記録", meta, evidenceRows(events), open);
    return `<details class="ir-detail" data-ir-key="${esc(key)}" data-ir-lazy="events"><summary><span>照合に使った記録</span><span class="ir-meta">${meta}</span></summary><div class="ir-content" data-ir-content></div></details>`;
  }

  function assessmentContent(a) {
    const kpi = (label, value, cls = "") => `<article class="ir-stat"><span>${esc(label)}</span><strong class="${cls}">${esc(value)}</strong></article>`;
    return `<div class="ir-stats">${kpi("記録上の不足", qty(a.loss), a.loss ? "ir-loss" : "ir-ok")}${kpi("コインの不足", coin(a.coinLoss), a.coinLoss ? "ir-loss" : "ir-ok")}${kpi("説明がついていない増加", qty(a.increase), a.increase ? "ir-gain" : "")}${kpi("確認済みの交換で入庫", qty(a.exchangeMaterials))}</div>
      ${a.potentialLoss ? `<p class="ir-callout"><strong>交換した場合は、少なくとも ${qty(a.potentialLoss)} 不足する可能性があります。</strong><br>交換先・実際の入庫が未確認の区間を含む参考値です。記録上の不足とは加算しません。</p>` : ""}
      ${a.coinIncrease ? `<p class="ir-gain">コインが計算より ${coin(a.coinIncrease)} 多くなっています。</p>` : ""}
      ${a.reasons.length ? `<div class="ir-checks"><strong>確認すること</strong><ul>${a.reasons.map(reason => `<li>${esc(reason)}</li>`).join("")}</ul></div>` : a.status === "ok" ? '<p class="ir-ok">保存済みの販売・在庫・入出庫の数量が一致し、未解決の確認事項はありません。</p>' : '<p class="ir-loss">入出庫を反映しても不足が残っています。区間ごとの記録を確認してください。</p>'}
      <p class="ir-note">不足と増加はカテゴリ別・区間別に残し、相殺しません。「問題なし」は表示期間内の登録済み記録の照合結果です。未登録の取引や、在庫チェックの間に起きて戻った動きまでは確認できません。</p>`;
  }

  function healthHtml(report, all = false) {
    const a = report.assessment;
    const status = a?.status || "empty", label = a?.label || engine.ASSESSMENT_LABELS.empty;
    const hint = !a ? report.message : status === "ok" ? "在庫・販売・入出庫の記録が一致しています" : status === "shortage"
      ? `在庫 ${qty(a.loss)} / コイン ${coin(a.coinLoss)} の不足`
      : a.potentialLoss ? `交換を含めると ${qty(a.potentialLoss)} 不足する可能性があります` : `確認事項 ${num(a.reasons.length)}件`;
    const icon = { ok: "✓", shortage: "!", review: "!", empty: "—" }[status];
    const period = report.start && report.end ? `${date(report.start.capturedAt)} → ${date(report.end.capturedAt)}` : "異なる日時の在庫が2回分必要です";
    const unchecked = Object.values(report.afterEnd || {}).reduce((total, value) => total + value, 0);
    return `<details class="ir-health ir-health-${status}" data-ir-key="health"${all ? " open" : ""}><summary><span class="ir-health-icon" aria-hidden="true">${icon}</span><span class="ir-health-copy"><strong>${esc(label)}</strong><span>${esc(hint)}</span><small>${esc(period)}</small>${unchecked ? `<small class="ir-unchecked">終了後の記録 ${num(unchecked)}件は今回の判定対象外です</small>` : ""}</span><span class="ir-health-arrow" aria-hidden="true">›</span></summary><div class="ir-content">${a ? assessmentContent(a) : `<p>${esc(report.message)}</p>`}</div></details>`;
  }

  function movementHtml(row, index, editable = false, all = false) {
    const a = row.assessment, saved = row.end.movementReview;
    const values = a.review || saved || { coinIn: row.coins.registered, coinOut: 0 };
    const inputValue = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
    const entry = (name, label, value, unit) => `<label><span>${esc(label)}（${unit}）</span><input type="number" name="${name}" min="0" max="1000000000" step="1" required value="${inputValue(value)}" inputmode="numeric"></label>`;
    const materialLabel = cat => engine.MATERIALS[cat];
    const savedInfo = a.confirmed ? `<p class="ir-ok">この区間の交換・入出庫を反映済みです。</p><p class="ir-note">記録日時 ${esc(a.checkedAt)}</p><dl class="ir-grid">${pair("コインの実際の入庫", coin(a.coinIn))}${pair("交換に使用したコイン", coin(a.exchangedCoins))}${pair("交換以外のコイン出庫", coin(a.coinOut))}${pair("計算上のコイン残高", coin(a.expectedCoins))}${pair("実際との差", signed(a.coinDifference, "枚"))}</dl>${a.review.note ? `<p class="ir-callout">${esc(a.review.note)}</p>` : ""}` :
      `<p class="ir-note">${a.stale ? "元記録または区間が変わったため、以前の入出庫記録は計算に使っていません。内容を確認して記録し直してください。" : "交換・補充・移動があった場合は、実際の内訳を記録すると判定に反映します。"}</p>`;
    if (!editable || all) return detail(`interval-${index}-movements`, "交換・入出庫の記録", badge(a.confirmed ? "反映済み" : a.stale ? "再確認が必要" : "未登録"), savedInfo + (!a.confirmed ? '<p class="ir-note">Windows版のこの区間を開くと、交換先や補充・使用・移動を登録できます。</p>' : ""), all);
    const form = `<form class="ir-movement-form" data-ir-movement="${index}">
      <p class="ir-note">${date(row.start.capturedAt)} より後 ～ ${date(row.end.capturedAt)} までの実際の入出庫を入力します。画像の在庫数は変更しません。</p>
      <fieldset><legend>コイン</legend><div class="ir-form-grid">${entry("coinIn", "実際に在庫へ入れたコイン", values.coinIn, "枚")}${entry("coinOut", "交換以外で使用・移動したコイン", values.coinOut, "枚")}</div><p class="ir-note">この区間の正のコイン登録は ${coin(row.coins.registered)}。未入庫の実績は、実際の入庫枚数から除いてください。</p></fieldset>
      <fieldset><legend>コインから素への交換</legend><p class="ir-note">1回＝10枚 → 素${num(row.coins.materialsPerSet)}個。交換先ごとに回数を入力します。コイン差分の参考は ${coin(row.coins.decreaseEquivalent)}（素${qty(row.coins.materialEquivalent)}相当）です。</p><div class="ir-form-grid">${engine.STOCK_KEYS.map(cat => entry(`exchangeSets.${cat}`, materialLabel(cat), values.exchangeSets?.[cat], "回")).join("")}</div></fieldset>
      <fieldset><legend>コイン交換以外の補充・販売以外の使用や移動</legend><p class="ir-note">商品と対応する素を合わせた数量です。素から商品を作るだけの移動や、登録済みの販売数は入力しません。</p>${engine.STOCK_KEYS.map(cat => `<div class="ir-movement-category"><strong>${esc(engine.LABELS[cat] || materialLabel(cat))}</strong><div class="ir-form-grid">${entry(`stockIn.${cat}`, "補充", values.stockIn?.[cat], "個")}${entry(`stockOut.${cat}`, "使用・移動", values.stockOut?.[cat], "個")}</div></div>`).join("")}</fieldset>
      ${row.boundaryEvents?.length ? `<label class="ir-check-label"><input name="boundaryOrderConfirmed" type="checkbox"${values.boundaryOrderConfirmed ? " checked" : ""}><span>同じ分の記録の前後関係を確認した（開始と同じ分は開始在庫に含まれ、終了と同じ分は終了在庫の前に完了）</span></label>` : ""}
      ${row.otherCount ? `<label class="ir-check-label"><input name="nonStockSalesConfirmed" type="checkbox"${values.nonStockSalesConfirmed ? " checked" : ""}><span>この区間のその他・未分類売上は、すべて在庫が動かない売上で、商品の販売を含まないことを確認した（理由をメモに入力）</span></label><p class="ir-note">お祭りの商品など、在庫が動く販売はチェックせず、販売実績の詳細でカテゴリ・個数を割り振ってください。</p>` : ""}
      <label class="ir-note-editor"><span>メモ</span><textarea name="note" maxlength="1000" rows="2" placeholder="補充・使用・移動の理由や、コイン登録分との違い">${esc(values.note || "")}</textarea></label>
      <p class="ir-note">数値は実際の入出庫に合わせてください。補充・使用・移動、登録枚数と異なる入庫には理由が必要です。</p>
      <div class="ir-form-actions"><button type="submit" class="ir-button ir-primary">この内容を記録して再計算</button>${saved ? `<button type="button" class="ir-button" data-ir-clear-movement="${index}">入出庫の記録を解除</button>` : ""}</div><p role="status" class="ir-feedback" data-ir-form-feedback></p></form>`;
    return detail(`interval-${index}-movements`, "交換・入出庫を登録／編集", badge(a.confirmed ? "反映済み" : a.stale ? "再確認が必要" : "未登録"), savedInfo + form);
  }

  function intervalBody(row, index, all = false, editable = false) {
    return assessmentContent(row.assessment) + movementHtml(row, index, editable, all) +
      row.assessment.categories.map(c => categoryHtml(c, `interval-${index}-${c.category}`, all, true)).join("") +
      itemsHtml(row.items, `interval-${index}-items`, all) + coinsHtml(row, `interval-${index}-coins`, all) +
      evidenceHtml(row.events, `interval-${index}-events`, all, all);
  }

  function reportBody(report, all = false) {
    const issues = report.warnings.length ? `<div class="ir-checks"><strong>記録についての補足 ${report.warnings.length}件</strong><ul>${report.warnings.map(w => `<li><b>${w.blocking === false ? "参考・確認済み：" : "未解決："}${esc(w.title)}</b><p>${esc(w.detail)}</p></li>`).join("")}</ul></div>` : "";
    if (report.status !== "ready") return `<p class="ir-empty">${esc(report.message)}</p>${issues}`;
    const s = report.summary;
    const timeline = report.intervals.map((row, i) => {
      const a = row.assessment;
      const meta = badge(a.label, a.status === "ok" ? "ir-ok" : a.status === "shortage" ? "ir-loss" : "ir-gain") + (a.loss ? badge(`不足 ${qty(a.loss)}`, "ir-loss") : "") + (a.potentialLoss ? badge(`交換した場合の不足 ${qty(a.potentialLoss)}`, "ir-gain") : "");
      const title = `${date(row.start.capturedAt)} → ${date(row.end.capturedAt)}`;
      return all ? detail(`interval-${i}`, title, meta, intervalBody(row, i, true), true) :
        `<details class="ir-detail ir-interval" data-ir-key="interval-${i}" data-ir-lazy="interval" data-ir-index="${i}"><summary><span>${esc(title)}</span><span class="ir-meta">${meta}</span></summary><div class="ir-content" data-ir-content></div></details>`;
    }).join("");
    const after = report.afterEnd;
    const afterNote = after.sales || after.deliveries || after.coins ? `<p class="ir-note">選択した終了日時より後：店頭 ${after.sales}件 / デリバリー ${after.deliveries}件 / コイン ${after.coins}件。今回の比較には含みません。新しい在庫を終了に選ぶと、その時点まで照合できます。</p>` : "";
    return `<p class="ir-note">在庫 ${report.intervals.length + 1}回・${report.intervals.length}区間を照合 / 店頭 ${s.saleCount}件・デリバリー ${s.deliveryCount}件・コイン ${s.coinCount}件</p>
      ${detail("timeline", "区間ごとの判定・交換の記録", badge(`不足 ${report.assessment.shortageCount}区間 / 要確認 ${report.assessment.pendingCount}区間`), timeline, all)}
      <div class="ir-category-list">${report.assessment.categories.map(c => categoryHtml(c, `category-${c.category}`, all)).join("")}</div>
      ${itemsHtml(s.items, "items", all)}
      ${coinsHtml(s, "coins", all)}
      ${evidenceHtml(report.events, "events", all, all)}
      ${issues ? detail("checks", "記録の確認事項", badge(`${report.warnings.filter(w => w.blocking !== false).length}件未解決`), issues, all) : ""}
      ${afterNote}
      ${detail("method", "集計方法", "", '<p>商品＋対応する素をカテゴリ別に比較します。計算上の在庫＝開始在庫＋確認済みの交換＋その他の補充−店頭販売−デリバリー−販売以外の使用・移動。素1個から商品1個を作る前提です。甘いものの素も個別に照合します。</p><p>コインの計算上の残高＝開始枚数＋実際の入庫−交換に使った枚数−交換以外の出庫。交換先が未確認の差分は、交換した場合の不足を参考表示し、「問題なし」とは判定しません。</p><p>開始と同じ分の記録は含めず、終了と同じ分は含めます。その他売上の金額から個数・カテゴリは推測しません。</p><p>後から請求書・在庫・コイン履歴を追加・修正すると再計算します。以前に確認した入出庫と元記録が変わった場合は再確認になります。保存済みの実在庫は書き換えません。iPhoneは更新で取得したデータを使います。</p>', all)}`;
  }

  function mount(container, getState, options = {}) {
    if (!container || !engine) return { refresh() {} };
    container.classList.add("inventory-report");
    let choices = { startId: "", endId: "" }, report = null;
    const getEvents = key => key === "events" ? report.events : report.intervals[Number(key.split("-")[1])]?.events || [];

    function fillEvidence(details, limit = 50) {
      const events = getEvents(details.dataset.irKey);
      const target = details.querySelector("[data-ir-content]");
      target.innerHTML = evidenceRows(events, limit) + (events.length > limit ? `<button type="button" class="ir-button" data-ir-more="${limit + 50}">さらに表示（${limit} / ${events.length}件）</button>` : "");
    }
    function hydrate(details) {
      if (!details.open || details.dataset.irFilled || !report) return;
      const target = details.querySelector("[data-ir-content]");
      if (!target) return;
      if (details.dataset.irLazy === "interval") {
        const i = Number(details.dataset.irIndex);
        if (report.intervals[i]) target.innerHTML = intervalBody(report.intervals[i], i, false, typeof options.saveMovementReview === "function");
      } else if (details.dataset.irLazy === "events") fillEvidence(details);
      details.dataset.irFilled = "true";
    }

    function refresh() {
      const opened = new Set([...container.querySelectorAll("details[open][data-ir-key]")].map(d => d.dataset.irKey));
      const activeControl = container.contains(document.activeElement) ? document.activeElement?.dataset.irControl : "";
      report = engine.build(getState(), choices);
      for (const field of ["startId", "endId"]) if (choices[field] && !report.snapshots.some(s => s.id === choices[field])) choices[field] = "";
      const options = (field, automatic) => `<option value="">${esc(automatic)}</option>` + report.snapshots.map(s => `<option value="${esc(s.id)}"${choices[field] === s.id ? " selected" : ""}>${esc(date(s.capturedAt))}${s.isBaseline ? "（基準）" : ""}</option>`).join("");
      container.innerHTML = `<div class="ir-heading"><div><h3>在庫レポート</h3><p class="ir-note">在庫・販売・交換・入出庫を照合</p></div><button type="button" class="ir-button" data-ir-control="save"${report.status !== "ready" ? " disabled" : ""}>レポートを保存</button></div>
        ${healthHtml(report)}
        ${detail("period", "比較する期間", "", `<div class="ir-controls"><label>比較開始<select data-ir-control="startId">${options("startId", `自動：比較基準${report.baseline ? ` ${date(report.baseline.capturedAt)}` : ""}`)}</select></label>
        <label>比較終了<select data-ir-control="endId">${options("endId", `自動：最新の在庫${report.snapshots.length ? ` ${date(report.snapshots.at(-1).capturedAt)}` : ""}`)}</select></label>
        <button type="button" class="ir-button ir-primary" data-ir-control="refresh">再計算</button></div>`, report.status !== "ready")}
        <div aria-live="polite" class="ir-feedback" data-ir-feedback></div>${reportBody(report)}`;
      // Restore expanded areas, hydrating parents before nested detail areas.
      for (const d of container.querySelectorAll("details[data-ir-key]")) {
        if (opened.has(d.dataset.irKey)) { d.open = true; hydrate(d); }
      }
      for (const d of container.querySelectorAll("details[data-ir-key]")) {
        if (opened.has(d.dataset.irKey)) { d.open = true; hydrate(d); }
      }
      if (activeControl) container.querySelector(`[data-ir-control="${activeControl}"]`)?.focus();
    }

    function download() {
      // Rebuild from current data even if this tab has remained open during an edit.
      refresh();
      if (report.status !== "ready") return;
      const exportedAt = new Date().toLocaleString("ja-JP");
      const css = `*{box-sizing:border-box}body{font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#182030;background:#f1f3f6;margin:0;padding:24px}.inventory-report{max-width:1050px;margin:auto}h1{font-size:25px}.ir-stats,.ir-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ir-stat,.ir-detail,.ir-checks{background:white;border:1px solid #cdd3dc;border-radius:12px;padding:16px;margin:12px 0}.ir-stat span,.ir-stat strong,.ir-stat small{display:block}.ir-stat strong{font-size:24px}.ir-detail summary{font-weight:700}.ir-meta{display:block}.ir-badge{display:inline-block;padding:3px 8px;background:#edf0f5;border-radius:6px;margin:3px}.ir-loss{color:#a82428}.ir-gain{color:#765900}.ir-ok{color:#23634b}.ir-note,small{color:#535e70}.ir-pair{border-bottom:1px solid #d8dee7;padding:7px 0}.ir-pair dt{font-size:13px}.ir-pair dd{margin:3px 0;font-weight:600}.ir-item,.ir-row-head{display:flex;justify-content:space-between;gap:12px}.ir-item,.ir-evidence-row{padding:12px 0;border-bottom:1px solid #d8dee7}.ir-item small,.ir-item-numbers span,.ir-item-numbers b{display:block}.ir-item-numbers{text-align:right}.ir-callout{background:#f4f1e7;padding:12px}p{margin:8px 0}ul{padding-left:20px}.ir-content{margin-top:12px}@media(max-width:600px){body{padding:12px}.ir-grid,.ir-stats{grid-template-columns:1fr}}@media print{body{background:white;padding:0}.ir-detail{break-inside:auto}.ir-stat,.ir-item,.ir-evidence-row{break-inside:avoid}}`;
      const healthCss = '.ir-health{border:2px solid #a66b14;border-radius:12px;background:white;margin:16px 0}.ir-health>summary{display:flex;gap:14px;padding:18px;cursor:pointer}.ir-health-ok{border-color:#258050}.ir-health-shortage{border-color:#b53333}.ir-health-copy{display:grid;gap:5px;flex:1}.ir-health-copy>strong{font-size:25px}.ir-health-icon{font-size:28px}.ir-health small{display:block}.ir-health-empty{border-color:#8893a3}';
      const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moonlight 在庫レポート</title><style>${css}${healthCss}</style><body><main class="inventory-report"><h1>Moonlight 在庫レポート</h1><p>${esc(date(report.start.capturedAt))} より後 → ${esc(date(report.end.capturedAt))} まで</p><p class="ir-note">出力日時 ${esc(exportedAt)} / 出力時の記録による集計</p>${healthHtml(report, true)}${reportBody(report, true)}</main></body></html>`;
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `Moonlight_inventory_report_${report.start.capturedAt.slice(0, 10)}_${report.end.capturedAt.slice(0, 10)}.html`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      container.querySelector("[data-ir-feedback]").textContent = "レポートを出力しました。保存したHTMLはブラウザで開けます。";
    }

    container.addEventListener("change", event => {
      const control = event.target.dataset.irControl;
      if (control === "startId" || control === "endId") { choices[control] = event.target.value; refresh(); }
    });
    container.addEventListener("click", event => {
      const target = event.target.closest("button");
      if (!target || !container.contains(target)) return;
      if (target.dataset.irControl === "refresh") { refresh(); container.querySelector("[data-ir-feedback]").textContent = "現在の保存済みデータで再計算しました。"; }
      if (target.dataset.irControl === "save") download();
      if (target.dataset.irMore) fillEvidence(target.closest("details[data-ir-lazy='events']"), Number(target.dataset.irMore));
      if (target.dataset.irClearMovement !== undefined) return saveMovement(target.closest("form"), true);
    });
    async function saveMovement(form, clear = false) {
      if (!form || typeof options.saveMovementReview !== "function" || form.dataset.irSaving) return;
      const feedback = form.querySelector("[data-ir-form-feedback]");
      try {
        const previous = report.intervals[Number(form.dataset.irMovement)];
        const current = engine.build(getState(), choices).intervals.find(row => row.start.id === previous?.start.id && row.end.id === previous?.end.id);
        if (!current || engine.movementBasis(current) !== engine.movementBasis(previous)) throw new Error("元記録が変わりました。「再計算」してから、内容を確認してください。");
        let saved = null;
        if (!clear) {
          const value = name => form.querySelector(`[name="${name}"]`)?.value;
          const input = { coinIn: value("coinIn"), coinOut: value("coinOut"), note: value("note"),
            boundaryOrderConfirmed: form.querySelector('[name="boundaryOrderConfirmed"]')?.checked === true,
            nonStockSalesConfirmed: form.querySelector('[name="nonStockSalesConfirmed"]')?.checked === true };
          for (const field of ["exchangeSets", "stockIn", "stockOut"]) input[field] = Object.fromEntries(engine.STOCK_KEYS.map(cat => [cat, value(`${field}.${cat}`)]));
          saved = engine.createMovementReview(current, input);
        }
        form.dataset.irSaving = "true";
        await options.saveMovementReview(current.end.id, saved);
        refresh();
        container.querySelector("[data-ir-feedback]").textContent = clear ? "入出庫の記録を解除して再計算しました。" : "交換・入出庫を記録して再計算しました。";
      } catch (error) {
        feedback.textContent = error.message || "保存できませんでした。";
      } finally { delete form.dataset.irSaving; }
    }
    container.addEventListener("submit", event => {
      const form = event.target.closest("form[data-ir-movement]");
      if (!form || !container.contains(form)) return;
      event.preventDefault();
      return saveMovement(form);
    });
    container.addEventListener("toggle", event => {
      if (event.target.matches("details[data-ir-lazy]")) hydrate(event.target);
    }, true);
    return { refresh };
  }
  root.MoonlightInventoryReportUI = { mount };
})(typeof globalThis !== "undefined" ? globalThis : this);
