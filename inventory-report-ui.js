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
    const badges = [badge(`実在庫の増減 ${signed(row.delta)}`)];
    if (row.checkedLoss) badges.push(badge(`最低 ${qty(row.checkedLoss)}の減少差`, "ir-loss"));
    if (row.pendingLoss) badges.push(badge(`未判定の減少 ${qty(row.pendingLoss)}`, "ir-gain"));
    if (row.exchangePending) badges.push(badge("交換先は不明"));
    const content = `<dl class="ir-grid ir-equation">
      ${pair("開始在庫（商品＋素）", qty(row.before))}
      ${pair("店頭販売（個数が分かる分）", qty(row.saleQty))}
      ${pair("デリバリー（個数が分かる分）", qty(row.deliveryQty))}
      ${pair("終了在庫（商品＋素）", qty(row.after))}
      ${pair("終了 − 開始 ＋ 個数が分かる販売", signed(row.exchangeNeed))}
      ${pair("この種類に交換した素の数", row.exchangePending ? "不明（総数で照合）" : "交換差分なし")}
      ${pair("商品の実数", `${num(row.productBefore)} → ${qty(row.productAfter)}`)}
      ${pair("対応する素の実数", `${num(row.materialBefore)} → ${qty(row.materialAfter)}`)}
    </dl><p class="ir-note">交換先や数量不明の売上をこの種類へ割り振っていません。販売を戻した増減には、素への交換による補充と数量不明の販売が含まれます。商品を作るだけなら商品＋素の合計は変わりません。</p>
    ${row.loss ? `<p class="ir-note">${interval ? "この区間" : "区間ごとの合計"}で、個数が分かる販売を超えて減っている分は ${qty(row.loss)}です。${row.checkingPending ? "数量不明の販売や記録の未確認事項があるため、不足とは確定しません。" : "この種類への交換を0回としても残る減少です。"}</p>` : ""}
    ${!interval ? '<p class="ir-note">種類ごとの減少差を、先頭の全体の差に重ねて加算しません。期間の差が0でも、途中の区間の差は残して表示します。</p>' : ""}`;
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
    const c = row.coins, a = row.assessment;
    const multiple = c.intervalCount > 1;
    const rateLines = (c.exchangeBreakdown || [c]).map(part => `<p>10枚 → 素${num(part.materialsPerSet)}個：${num(part.exchangeSets)}回分 → 素 ${qty(part.materialEquivalent)}${multiple ? `（${num(part.intervalCount)}区間）` : ""}</p>`).join("");
    const content = `<dl class="ir-grid">
      ${pair("開始のSPコイン", coin(c.before))}
      ${pair("期間内に集めたコイン（登録分）", `＋${coin(c.registered)}`)}
      ${pair("終了のSPコイン", `−${coin(c.after)}`)}
      ${pair(multiple ? "期間全体の差分（区間別の式は各区間へ）" : "交換に使われたと考えられる枚数", signed(c.before + c.registered - c.after, "枚"))}
      ${pair("初期残高・累計修正など（入庫に含めない）", `${signed(c.correction, "枚")} / ${num(c.correctionCount)}件`)}
    </dl><div class="ir-callout"><strong>${a?.coinCheckPending ? "コイン記録に確認事項あり・参考の交換量" : "コイン差分から計算した交換量"}</strong>${rateLines}
      <p>10枚単位に満たない端数${multiple ? "の区間別合計" : ""}：${coin(c.remainder)}。端数や登録分を超える増加がある区間は、交換量を確定せず確認対象にします。</p></div>
      ${multiple ? `<p class="ir-note">区間別の減少相当は合計${coin(c.intervalDecreaseEquivalent)}、10枚単位の交換分は${coin(a.exchangedCoins)}です。登録分より増えた区間の${coin(a.coinIncrease)}とは相殺せず、各区間の計算を残しています。</p>` : ""}
      <p class="ir-note">登録したコインがスタッシュへ入り、減ったコインは素への交換に使われる運用を前提にしています。交換先の素は入力不要です。コインの減少を交換として数えるため、差が出てもコイン側と商品・素側のどちらに原因があるかまでは特定できません。</p>
      <p class="ir-note">区間の終了在庫日時が${esc(date(engine.COIN_EXCHANGE_CHANGE_AT))}より前なら10枚→素50個、それ以降は100個です。9/3→9/4は100個で計算し、複数区間は各区間の交換量を足します。</p>`;
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
    const checked = a.checkedLoss ? `少なくとも${num(a.checkedLoss)}個分` : a.checkingPending ? "未判定の区間あり" : "0個分";
    return `<div class="ir-stats">${kpi("説明できない減少（在庫換算）", checked, a.checkedLoss ? "ir-loss" : a.checkingPending ? "ir-gain" : "")}${kpi("未判定の減少（在庫換算）", `${num(a.pendingLoss)}個分`, "ir-gain")}${kpi("数量不明の売上等", a.unknownSales ? `${num(a.unknownSalesCount)}件` : "なし", a.unknownSales ? "ir-gain" : "")}${kpi(a.recordUncertain ? "増加の差（記録確認前）" : "説明できない増加（在庫換算）", `少なくとも${num(a.increase)}個分`, a.increase ? "ir-gain" : "")}</div>
      <dl class="ir-grid ir-equation">
      ${pair("開始の商品＋全種類の素", qty(a.beforeTotal))}
      ${pair(a.coinCheckPending ? "コイン差分による交換量（参考）" : "コイン差分による交換量", `＋${qty(a.exchangeMaterials)}`)}
      ${pair("個数が分かる販売・デリバリー", `−${qty(a.outgoing)}`)}
      ${pair("数量不明の販売を引く前の予定数", qty(a.expectedTotal))}
      ${pair("実際の終了在庫", qty(a.afterTotal))}
      ${pair(a.intervalCount > 1 ? "期間の純差（終了 − 予定）" : "総数の差（終了 − 予定）", signed(a.difference))}
      </dl>
      ${a.unknownSales ? '<p class="ir-callout"><strong>その他売上などの個数が分からないため、減少の原因は未判定です。</strong><br>種類や個数は入力しなくても保存できます。金額を単価で割ったり、在庫の差を販売数として登録したりはしません。差が0でも、数量不明の売上が残る区間は「問題なし」にしません。</p>' : ""}
      <p class="ir-note">全種類の総数と、1回の交換単位（素50個または100個）で種類別の増減を照合します。「少なくとも」は、交換先をどう選んでも残る最小の差です。交換先を商品記録へ自動登録する計算ではありません。</p>
      <p class="ir-note">${a.intervalCount > 1 ? "先頭の減少・増加は区間別の差を合計し、途中の増加で減少を相殺しません。期間の純差とは異なります。" : "種類ごとの増減を相殺して問題なしにしないよう、交換単位も照合します。"}登録したコインがすべてスタッシュへ入り、コインの減少分を交換した前提です。</p>
      ${a.reasons.length ? `<div class="ir-checks"><strong>判定の理由</strong><ul>${a.reasons.map(reason => `<li>${esc(reason)}</li>`).join("")}</ul></div>` : '<p class="ir-ok">登録された販売・コイン・在庫は、交換先が不明でも数量上は整合しています。</p>'}
      <p class="ir-note">この判定は記録上の整合性です。確認事項がある区間の増加の差も参考値です。不正の有無や、差が出た原因・人物を断定するものではありません。</p>`;
  }

  function healthHtml(report, all = false) {
    const a = report.assessment;
    const status = a?.status || "empty", label = a?.label || engine.ASSESSMENT_LABELS.empty;
    const hint = !a ? report.message : status === "ok" ? "販売・コイン・在庫が数量上は整合しています" : status === "shortage"
      ? `説明できない減少 少なくとも${num(a.checkedLoss)}個分${a.checkingPending ? " / 未判定の区間もあります" : ""}`
      : a.unknownSales ? `数量不明の売上あり / 減少が販売か不足かは未判定${a.increase ? " / 増加にも差があります" : ""}`
      : a.pendingLoss ? `未判定の減少 ${num(a.pendingLoss)}個分 / 記録を確認してください` : "コイン・在庫・販売の記録に差があります";
    const icon = { ok: "✓", shortage: "!", review: "!", empty: "—" }[status];
    const period = report.start && report.end ? `${date(report.start.capturedAt)} → ${date(report.end.capturedAt)}` : "異なる日時の在庫が2回分必要です";
    const unchecked = Object.values(report.afterEnd || {}).reduce((total, value) => total + value, 0);
    return `<details class="ir-health ir-health-${status}" data-ir-key="health"${all ? " open" : ""}><summary><span class="ir-health-icon" aria-hidden="true">${icon}</span><span class="ir-health-copy"><strong>${esc(label)}</strong><span>${esc(hint)}</span><small>${esc(period)}</small>${unchecked ? `<small class="ir-unchecked">終了後の記録 ${num(unchecked)}件は今回の判定対象外です</small>` : ""}</span><span class="ir-health-arrow" aria-hidden="true">›</span></summary><div class="ir-content">${a ? assessmentContent(a) : `<p>${esc(report.message)}</p>`}</div></details>`;
  }

  function movementHtml(row, index, editable = false, all = false) {
    const a = row.assessment, saved = row.end.movementReview;
    const note = saved?.note ? `<p class="ir-note">保存メモ：${esc(saved.note)}</p>` : "";
    const legacy = saved?.version === 1 ? `<p class="ir-note">旧方式の確認記録は保持しています。現在の計算は登録コイン・実在庫・請求書から行います。</p><dl class="ir-grid">${pair("以前のコイン入庫・出庫", `${coin(saved.coinIn)} / ${coin(saved.coinOut)}`)}${engine.STOCK_KEYS.map(cat => pair(engine.LABELS[cat] || engine.MATERIALS[cat], `交換 ${num(saved.exchangeSets?.[cat])}回 / 補充 ${qty(saved.stockIn?.[cat])} / 使用・移動 ${qty(saved.stockOut?.[cat])}`)).join("")}</dl>` : "";
    const description = `<p class="ir-note">コイン報告：${a.coinReportsComplete ? "確認済み" : "未確認"}。未報告分を自動推定して従業員へ加算することはありません。追加登録は実際の収集日時で行ってください。</p>` + '<p class="ir-note">在庫チェックと同じ分の記録は、開始と同じ分なら対象外、終了と同じ分なら対象です。実際の順序が違う場合は元記録の日時を修正してください。</p>';
    if (!editable || all) return detail(`interval-${index}-movements`, "コイン報告・日時の確認", badge(!a.coinReportsComplete ? "報告未確認" : a.boundaryUnconfirmed ? "前後関係を確認" : "確認済み"), description + legacy + note, all);
    const form = `<form class="ir-movement-form" data-ir-movement="${index}">${description}${legacy}
      <label class="ir-check-label"><input name="coinReportsComplete" type="checkbox"${a.coinReportsComplete ? " checked" : ""}><span>この区間のコイン報告を全員分確認し、報告漏れがない</span></label>
      ${row.boundaryEvents?.length ? `<label class="ir-check-label"><input name="boundaryOrderConfirmed" type="checkbox"${a.review?.boundaryOrderConfirmed ? " checked" : ""}><span>同じ分の記録の前後関係を確認した（開始分は開始在庫に含まれ、終了分は終了在庫の前に完了）</span></label>` : ""}
      <label class="ir-note-editor"><span>メモ</span><textarea name="note" maxlength="1000" rows="2">${esc(saved?.note || "")}</textarea></label>
      <div class="ir-form-actions"><button type="submit" class="ir-button ir-primary">報告・日時の確認を保存</button>${saved ? `<button type="button" class="ir-button" data-ir-clear-movement="${index}">保存した確認を解除</button>` : ""}</div><p role="status" class="ir-feedback" data-ir-form-feedback></p></form>`;
    return detail(`interval-${index}-movements`, "コイン報告・日時の確認", badge(a.boundaryUnconfirmed ? "前後関係を確認" : "確認の編集"), form);
  }

  function intervalBody(row, index, all = false, editable = false) {
    const uncertainTimeEvents = (row.dateOnlyEvents || []).filter(e => !row.events.includes(e));
    return assessmentContent(row.assessment) + movementHtml(row, index, editable, all) +
      row.assessment.categories.map(c => categoryHtml(c, `interval-${index}-${c.category}`, all, true)).join("") +
      itemsHtml(row.items, `interval-${index}-items`, all) + coinsHtml(row, `interval-${index}-coins`, all) +
      (uncertainTimeEvents.length ? detail(`interval-${index}-uncertain-time`, "時刻不明でこの区間に含まれていない記録", badge(`${uncertainTimeEvents.length}件`, "ir-gain"), '<p class="ir-note">下の00:00は実際の時刻ではありません。日時を修正すると正しい区間に入れて再計算します。</p>' + evidenceRows(uncertainTimeEvents), all) : "") +
      evidenceHtml(row.events, `interval-${index}-events`, all, all);
  }

  function reportBody(report, all = false) {
    const issues = report.warnings.length ? `<div class="ir-checks"><strong>記録についての補足 ${report.warnings.length}件</strong><ul>${report.warnings.map(w => `<li><b>${w.blocking === false ? "参考・確認済み：" : "未解決："}${esc(w.title)}</b><p>${esc(w.detail)}</p></li>`).join("")}</ul></div>` : "";
    if (report.status !== "ready") return `<p class="ir-empty">${esc(report.message)}</p>${issues}`;
    const s = report.summary;
    const timeline = report.intervals.map((row, i) => {
      const a = row.assessment;
      const meta = badge(a.label, a.status === "ok" ? "ir-ok" : a.status === "shortage" ? "ir-loss" : "ir-gain") + (a.checkedLoss ? badge(`説明できない減少 ${num(a.checkedLoss)}個分`, "ir-loss") : "") + (a.pendingLoss ? badge(`未判定の減少 ${num(a.pendingLoss)}個分`, "ir-gain") : "") + (a.checkedCoinLoss ? badge(`コイン不足 ${coin(a.checkedCoinLoss)}`, "ir-loss") : "");
      const title = `${date(row.start.capturedAt)} → ${date(row.end.capturedAt)}`;
      return all ? detail(`interval-${i}`, title, meta, intervalBody(row, i, true), true) :
        `<details class="ir-detail ir-interval" data-ir-key="interval-${i}" data-ir-lazy="interval" data-ir-index="${i}"><summary><span>${esc(title)}</span><span class="ir-meta">${meta}</span></summary><div class="ir-content" data-ir-content></div></details>`;
    }).join("");
    const after = report.afterEnd;
    const afterNote = after.sales || after.deliveries || after.coins ? `<p class="ir-note">選択した終了日時より後：店頭 ${after.sales}件 / デリバリー ${after.deliveries}件 / コイン ${after.coins}件。今回の比較には含みません。新しい在庫を終了に選ぶと、その時点まで照合できます。</p>` : "";
    return `<p class="ir-note">在庫 ${report.intervals.length + 1}回・${report.intervals.length}区間を照合 / 店頭 ${s.saleCount}件・デリバリー ${s.deliveryCount}件・コイン ${s.coinCount}件</p>
      ${detail("timeline", "区間ごとの判定・計算の内訳", badge(`減少の差 ${report.assessment.shortageCount}区間 / 未判定・要確認 ${report.assessment.reviewCount}区間 / 一致 ${report.assessment.okCount}区間`), timeline, all)}
      <div class="ir-category-list">${report.assessment.categories.map(c => categoryHtml(c, `category-${c.category}`, all)).join("")}</div>
      ${itemsHtml(s.items, "items", all)}
      ${coinsHtml(s, "coins", all)}
      ${evidenceHtml(report.events, "events", all, all)}
      ${issues ? detail("checks", "記録の確認事項", badge(`${report.warnings.filter(w => w.blocking !== false).length}件未解決`), issues, all) : ""}
      ${afterNote}
      ${detail("method", "集計方法", "", '<p>商品と対応する素を合わせ、甘いものの素も含む全種類の総数を比較します。素1個から商品1個を作る作業では総数は変わりません。</p><p>交換枚数＝開始コイン＋期間内に集めた登録コイン−終了コイン。10枚ごとに素100個（旧仕様は50個）へ交換したとして、全体の予定数＝開始総数＋交換総数−個数が分かる店頭販売−デリバリーを計算します。交換先の入力は不要です。</p><p>交換先ごとの回数は分からないため、全種類のどこへ交換したとしても残る最小の減少・増加を確認します。無料配布・使用・移動や外部からの補充はない運用です。総数が一致していても、種類別の増減が交換単位で説明できないときは差を表示します。</p><p>その他売上の金額から個数・種類を推測しません。数量不明の売上がある区間の減少は、販売か不足かを判定できません。コイン端数や日時・読み取りの問題がある区間も未判定になります。</p><p>開始と同じ分の記録は含めず、終了と同じ分は含めます。後から請求書・在庫・コインを追加・修正すると再計算します。保存された実在庫は書き換えません。iPhoneは同期・更新した同じデータで表示します。</p>', all)}`;

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
      container.innerHTML = `<div class="ir-heading"><div><h3>在庫レポート</h3><p class="ir-note">販売・コイン・在庫の総数を照合</p></div><button type="button" class="ir-button" data-ir-control="save"${report.status !== "ready" ? " disabled" : ""}>レポートを保存</button></div>
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
          saved = engine.createTimingReview(current, {
            note: form.querySelector('[name="note"]')?.value || "",
            boundaryOrderConfirmed: form.querySelector('[name="boundaryOrderConfirmed"]')?.checked === true,
            coinReportsComplete: form.querySelector('[name="coinReportsComplete"]')?.checked === true
          });
        }
        form.dataset.irSaving = "true";
        await options.saveMovementReview(current.end.id, saved);
        refresh();
        container.querySelector("[data-ir-feedback]").textContent = clear ? "保存した確認を解除して再計算しました。" : "報告・日時の確認を保存して再計算しました。";
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
