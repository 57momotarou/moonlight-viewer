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
    if (!row.loss && !row.increase) badges.push(badge("数量一致", "ir-ok"));
    let note = "";
    if (row.materialAfter < row.materialBefore && row.productAfter > row.productBefore && row.difference === 0) {
      note = '<p class="ir-note">素材が減り、商品が増えています。素1個から商品1個を作った場合の変化と数量上は整合します。</p>';
    }
    const content = `<dl class="ir-grid ir-equation">
      ${pair("開始在庫（商品＋素）", qty(row.before))}
      ${pair("店頭販売", `−${qty(row.saleQty)}`)}
      ${pair("デリバリー", `−${qty(row.deliveryQty)}`)}
      ${pair("計算上の終了在庫", qty(row.expected))}
      ${pair("実際の終了在庫", qty(row.after))}
      ${pair("実在庫 − 計算上の在庫", signed(row.difference), row.difference < 0 ? "ir-loss" : row.difference > 0 ? "ir-gain" : "ir-ok")}
    </dl><dl class="ir-grid">
      ${pair("商品の実数", `${num(row.productBefore)} → ${qty(row.productAfter)}`)}
      ${pair("対応する素の実数", `${num(row.materialBefore)} → ${qty(row.materialAfter)}`)}
      ${pair(interval ? "説明が足りない減少" : "各区間の減少差の合計", qty(row.loss), "ir-loss")}
      ${pair(interval ? "補充などを確認する増加" : "各区間の増加差の合計", qty(row.increase), "ir-gain")}
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
      '<p class="ir-note">実際に保存された在庫数の変化です。商品別の減少には販売や製造による変化も含まれます。甘いものの素とSPコインは3カテゴリの照合に含めません。</p>' +
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
    <p class="ir-note">コインの登録は従業員の実績です。実際の入庫・交換日時の記録ではないため、上の計算は「登録分がこの区間に全て入庫した場合」の仮定です。修正・初期登録・負の登録は入庫に加算しません。交換候補でカテゴリの差を自動的に埋めることもありません。</p>`;
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

  function intervalBody(row, index, all = false) {
    return row.categories.map(c => categoryHtml(c, `interval-${index}-${c.category}`, all, true)).join("") +
      itemsHtml(row.items, `interval-${index}-items`, all) + coinsHtml(row, `interval-${index}-coins`, all) +
      evidenceHtml(row.events, `interval-${index}-events`, all, all);
  }

  function reportBody(report, all = false) {
    const issues = report.warnings.length ? `<div class="ir-checks"><strong>確認事項 ${report.warnings.length}件</strong><ul>${report.warnings.map(w => `<li><b>${esc(w.title)}</b><p>${esc(w.detail)}</p></li>`).join("")}</ul></div>` : "";
    if (report.status !== "ready") return `<p class="ir-empty">${esc(report.message)}</p>${issues}`;
    const s = report.summary;
    const headline = s.loss || s.increase ? "確認が必要な在庫差があります" : "3カテゴリの数量は記録と一致しています";
    const kpi = (label, value, note, cls = "") => `<article class="ir-stat"><span>${esc(label)}</span><strong class="${cls}">${esc(value)}</strong><small>${esc(note)}</small></article>`;
    const timeline = report.intervals.map((row, i) => {
      const meta = badge(`減少差 ${qty(row.loss)}`, row.loss ? "ir-loss" : "") + badge(`増加差 ${qty(row.increase)}`, row.increase ? "ir-gain" : "");
      const title = `${date(row.start.capturedAt)} → ${date(row.end.capturedAt)}`;
      return all ? detail(`interval-${i}`, title, meta, intervalBody(row, i, true), true) :
        `<details class="ir-detail ir-interval" data-ir-key="interval-${i}" data-ir-lazy="interval" data-ir-index="${i}"><summary><span>${esc(title)}</span><span class="ir-meta">${meta}</span></summary><div class="ir-content" data-ir-content></div></details>`;
    }).join("");
    const after = report.afterEnd;
    const afterNote = after.sales || after.deliveries || after.coins ? `<p class="ir-note">選択した終了日時より後：店頭 ${after.sales}件 / デリバリー ${after.deliveries}件 / コイン ${after.coins}件。今回の比較には含みません。新しい在庫を終了に選ぶと、その時点まで照合できます。</p>` : "";
    return `<div class="ir-result-head"><strong>${headline}</strong><p class="ir-note">在庫 ${report.intervals.length + 1}回・${report.intervals.length}区間を照合 / 店頭 ${s.saleCount}件・デリバリー ${s.deliveryCount}件・コイン ${s.coinCount}件</p></div>
      <div class="ir-stats">
        ${kpi("在庫の実増減", signed(s.delta), "3カテゴリの商品＋素の純増減")}
        ${kpi("販売・デリバリーの減少分", qty(s.outgoing), "保存済みのカテゴリ別個数")}
        ${kpi("説明が足りない減少", qty(s.loss), "区間ごとの減少差の合計", "ir-loss")}
        ${kpi("補充などを確認する増加", qty(s.increase), "区間ごとの増加差の合計", "ir-gain")}
      </div><p class="ir-note">減少差と増加差は、カテゴリ別・区間別に合計しています。別の区間の増減で相殺しません。差だけで不正とは判断せず、読み取り・請求漏れ・補充・交換・移動を確認してください。</p>
      ${issues}
      <div class="ir-category-list">${s.categories.map(c => categoryHtml(c, `category-${c.category}`, all)).join("")}</div>
      ${itemsHtml(s.items, "items", all)}
      ${coinsHtml(s, "coins", all)}
      ${detail("timeline", "在庫チェックごとの照合", badge(`${report.intervals.length}区間 / 差のある区間 ${s.issueIntervals}`), timeline, all)}
      ${evidenceHtml(report.events, "events", all, all)}
      ${afterNote}
      ${detail("method", "集計方法", "", '<p>各カテゴリの「商品＋対応する素」を比較します。計算上の在庫は「開始在庫 − 店頭販売数 − デリバリー数」、差は「実際の終了在庫 − 計算上の在庫」です。素1個から商品1個を作る前提です。</p><p>登録した順番ではなく、請求日時・デリバリー日時・コイン登録日時で集計します。開始の分は含めず、終了の分は含めます。その他売上の金額から個数やカテゴリは推測しません。</p><p>請求書や在庫を後から保存・編集すると、次にレポートを開いた時や再計算時に反映します。保存された実在庫を書き換えたり、同じ販売を再計算のたびに引いたりすることはありません。iPhoneは更新で取得したデータを使います。</p>', all)}`;
  }

  function mount(container, getState) {
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
        if (report.intervals[i]) target.innerHTML = intervalBody(report.intervals[i], i);
      } else if (details.dataset.irLazy === "events") fillEvidence(details);
      details.dataset.irFilled = "true";
    }

    function refresh() {
      const opened = new Set([...container.querySelectorAll("details[open][data-ir-key]")].map(d => d.dataset.irKey));
      const activeControl = container.contains(document.activeElement) ? document.activeElement?.dataset.irControl : "";
      report = engine.build(getState(), choices);
      for (const field of ["startId", "endId"]) if (choices[field] && !report.snapshots.some(s => s.id === choices[field])) choices[field] = "";
      const options = (field, automatic) => `<option value="">${esc(automatic)}</option>` + report.snapshots.map(s => `<option value="${esc(s.id)}"${choices[field] === s.id ? " selected" : ""}>${esc(date(s.capturedAt))}${s.isBaseline ? "（基準）" : ""}</option>`).join("");
      container.innerHTML = `<div class="ir-heading"><div><h3>在庫レポート</h3><p class="ir-note">在庫と、その間の販売・コイン履歴を照合</p></div><button type="button" class="ir-button" data-ir-control="save"${report.status !== "ready" ? " disabled" : ""}>レポートを保存</button></div>
        <div class="ir-controls"><label>比較開始<select data-ir-control="startId">${options("startId", `自動：比較基準${report.baseline ? ` ${date(report.baseline.capturedAt)}` : ""}`)}</select></label>
        <label>比較終了<select data-ir-control="endId">${options("endId", `自動：最新の在庫${report.snapshots.length ? ` ${date(report.snapshots.at(-1).capturedAt)}` : ""}`)}</select></label>
        <button type="button" class="ir-button ir-primary" data-ir-control="refresh">再計算</button></div>
        <p class="ir-note ir-period">${report.start && report.end ? `${esc(date(report.start.capturedAt))} より後 → ${esc(date(report.end.capturedAt))} まで` : "保存済みの在庫が比較の開始・終了になります。"}</p>
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
      const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moonlight 在庫レポート</title><style>${css}</style><body><main class="inventory-report"><h1>Moonlight 在庫レポート</h1><p>${esc(date(report.start.capturedAt))} より後 → ${esc(date(report.end.capturedAt))} まで</p><p class="ir-note">出力日時 ${esc(exportedAt)} / 出力時の記録による集計</p>${reportBody(report, true)}</main></body></html>`;
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
    });
    container.addEventListener("toggle", event => {
      if (event.target.matches("details[data-ir-lazy]")) hydrate(event.target);
    }, true);
    return { refresh };
  }
  root.MoonlightInventoryReportUI = { mount };
})(typeof globalThis !== "undefined" ? globalThis : this);
