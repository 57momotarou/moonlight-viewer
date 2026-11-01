// shell.js — 画面切替・メニュー・設定（仕様書）・サービスワーカー・起動処理。
"use strict";

function renderAll() {
  renderOverview();
  renderSales();
  renderBuyers();
  renderProducts();
  renderInventory();
  renderBonus();
  renderCoinHistory();
  renderEmployees();
}

function setMoreMenuOpen(open) {
  if (!els.moreSheet) return;
  els.moreSheet.classList.toggle("hidden", !open);
  els.moreSheet.setAttribute("aria-hidden", String(!open));
  els.moreMenuBtn?.setAttribute("aria-expanded", String(open));
}

function ensureHelpSettings() {
  if (!els.viewerScreen || !els.moreSheet || document.getElementById("moonlightHelpSettings")) return;
  const content = els.viewerScreen.querySelector("#content") || els.viewerScreen.querySelector(".page")?.parentElement;
  if (!content) return;
  let page = content.querySelector('.page[data-page="settings"]');
  if (!page) {
    page = document.createElement("section");
    page.className = "page";
    page.dataset.page = "settings";
    page.innerHTML = '<div class="page-head"><h1>設定</h1></div>';
    content.appendChild(page);
  }
  const help = document.createElement("div");
  help.id = "moonlightHelpSettings";
  help.className = "moonlight-settings-help";
  help.innerHTML = "<details class=\"settings-group\" id=\"appHelpSettings\"><summary><strong>仕様書・使い方</strong><span>操作方法・計算・保存と復旧</span></summary><div class=\"settings-group-body\"><div class=\"app-specification\"><p class=\"help-intro\">項目を開くと、操作方法と計算のルールを確認できます。</p><details class=\"help-topic\"><summary>基本の使い方・端末</summary><div class=\"help-topic-body\"><p>Windowsは登録・編集、iPhoneは同期されたデータの閲覧用です。更新で保存済みデータ・接続設定を初期化しません。販売・デリバリー・在庫の取り込みは保存成功を確認して完了表示し、失敗した場合は読み込み結果を残します。画面下の保存状態を確認してください。バックアップは「データ・バックアップ」から保存できます。</p><p>一覧の名前や行を押すと詳細が開きます。Windowsでは販売伝票・デリバリー・在庫・コインの保存後の内容も編集できます。通常画面は入力・結果・その記録の確認事項を中心に表示し、詳しい操作や計算方法はこの仕様書にまとめています。</p><p>Windowsは「設定 → 仕様書・使い方」、iPhoneは右上メニューの「設定 → 仕様書・使い方」から開けます。iPhoneで登録や修正は行えません。Windowsで保存・同期したデータを更新して閲覧します。</p></div></details><details class=\"help-topic\"><summary>画像の追加・読み取り</summary><div class=\"help-topic-body\"><p>画像はファイル選択、ドラッグ＆ドロップ、Ctrl＋Vの貼り付けから追加できます。PNG・JPG・WEBP・HEICなどを選択でき、20MB未満を推奨します。実際に開ける形式は利用環境にも依存します。</p><p>解析には設定のGemini APIキーを使い、選んだ画像をGeminiへ送信します。解析しただけでは履歴へ保存しません。結果を確認・修正して保存してください。</p><p>小さいデリバリー画像は拡大し、縦長画像は重なりを付けて分割します。利用できないモデルや形式を読み取れない結果では別のモデルへ切り替えます。文字が不鮮明な場合や読み違いがある場合は結果を手修正してください。</p></div></details><details class=\"help-topic\"><summary>販売・請求書・重複確認</summary><div class=\"help-topic-body\"><p>請求書の各行を、項目名・単価・個数・金額に分けて保存します。同じカテゴリでも単価が違う行は分けて集計します。</p><p>同時回復は食べ物。「食べ物×5万」「飲み物×5万」はそれぞれ5万円の商品です。食べ物・飲み物の共通項目は内訳を推測せず、数量・金額をその他売上の明細として残します。</p><p>未登録のプリセットも省略しません。設定で種類を登録するか、読み込み結果・保存後の伝票から修正できます。金額だけで個数や種類を推測しません。</p><p>未一致の販売員は、従業員を選択するか新規追加するまで全件の保存を止めます。新規追加はボタンを押した場合だけです。</p><p>類似する請求書は購入者名が一致・近似する場合に限り候補になります。同じ画像の同じカードは名前の読み取りが変わっても保存済みとして扱います。同じ画像の別カードは別件です。</p><p>候補を比較し「追加しない」「別の請求として追加」「選んだ請求書へ上書き」を選べます。上書きは1件だけ更新し、変更前の内容を保存します。明細・候補が変わると確認は失効します。</p><p>単価・金額の上下は1万円単位、個数は1個単位です。</p><p>販売履歴の日付は月・日付の選択欄と最近7日のボタンで絞り込みます。古い日付も選択でき、「すべて」で解除できます。</p><p>解析結果の一覧ではカテゴリ別の個数・小計、その他売上、合計を確認します。行を押すと購入者・請求日時・単価などを編集できます。保存後も販売履歴の行から変更できます。</p><p>食べ物・飲み物・ジョイント・登録商品に当てはまらない項目は、初期設定で「その他売上」に残します。イベント商品も、結果や伝票詳細から種類・個数・単価を確認して在庫へ反映できます。</p><p>設定の「請求書のプリセット」では画像にある項目名と種類を登録します。同じ項目名は分類の変更になります。変更は次回の解析から使い、保存済みの請求書を自動では書き換えません。単価は画像の実際の金額を保持します。</p></div></details><details class=\"help-topic\"><summary>デリバリー・注文日時</summary><div class=\"help-topic-body\"><p>通常の注文票と配達完了の履歴カード一覧に対応します。履歴の「日時・注文者・配達員」から注文者だけを読み、折り返された商品名・個数を同じカード内でまとめます。配達員・商品代金・受取額・配達料は集計しません。</p><p>読み取った注文日時は結果欄と保存データへ反映します。「注文の年」は今年を初期表示し、画像に年がない場合だけ、その年と画像の月日・時刻を組み合わせます。過去の画像は年を変更してください。画像に年まであれば画像の年を優先します。解析後の年の変更も反映し、各行で手修正した日時は維持します。一括指定の日時は、画像から日時を決められない行だけに反映します。読めない月日・時刻を現在日時で補わず、不明な行があれば全件の保存を止めます。年をまたぐ一覧は各行の実際の日時を確認してください。</p><p>小さい注文票は拡大し、縦長の画像は重なりを付けて分割して解析します。利用できないモデルや注文のない結果では次のモデルへ切り替えます。重なった同じ注文は一度だけ取り込み、読み取りが食い違う場合は確認するまで保存を止めます。画像の文字が不鮮明な場合など、正確に読み取れないことがあるため結果を確認してください。</p><p>DLV-xxxxの通常注文票や履歴カードを対象にし、1枚に複数件ある場合も抽出します。保存前に各注文の日時・注文番号・注文者・商品個数を確認してください。</p><p>結果欄には認識した元の日時と、補った年を表示します。過去の画像は「注文の年」を変更します。画像で決まる個別の日時は一括指定の日時で上書きしません。</p><p>デリバリー履歴の行を押すと注文の全項目を編集できます。同じ注文番号を読み直して保存した場合は既存の注文を更新し、保存後の数量・注文日時は在庫照合へ反映します。</p></div></details><details class=\"help-topic\"><summary>商品管理・使用する素</summary><div class=\"help-topic-body\"><p>商品登録の「使用する素」で、通常の食べ物は「食べ物の素」、同時回復商品は「満腹の素」を選択します。同時回復も売上分類は食べ物です。どちらも商品1個につき選択した素1個だけを使い、在庫では通常の食べ物＋食べ物の素と、同時回復商品＋満腹の素を別々に照合します。飲み物の素は使いません。既存の商品も商品一覧から変更でき、過去の在庫・商品別販売も再計算されます。</p><p>満腹の素は画像解析・手修正・保存後の在庫詳細で入力できます。過去の在庫で未記録なら0と確定せず、該当区間は確認が必要です。実数が0の場合も在庫履歴で0を入力してください。古い通常食べ物は標準で食べ物の素のままなので、同時回復の商品だけ設定を変更してください。</p><p>請求書の「同時回復」は満腹の素側へ、通常の「食べ物」は食べ物の素側へ反映します。商品別明細は登録商品の設定に従います。過去の合計個数だけの販売から同時回復分を推測はしません。必要なら伝票詳細で商品別明細または「同時回復（満腹の素）」へ修正します。</p><p>商品管理は手動登録です。商品名・スタッシュ名・別表記・画像を登録しておくと、販売や在庫の画像と照合できます。登録商品に一致する場合は登録した分類を優先し、画面内の位置だけで分類しません。</p><p>通常の食べ物は食べ物の素、飲み物は飲み物の素、ジョイントはリラックスの素を1個使って商品1個にします。同時回復は満腹の素1個だけを使います。甘いものの素も在庫の総数に含めます。</p></div></details><details class=\"help-topic\"><summary>在庫の登録・修正・比較基準</summary><div class=\"help-topic-body\"><p>1回の在庫チェックに最大2枚。同じ撮影時点の続きとして読み込み、重なったスロットは1回だけ数えます。2枚では保存前に数量の確認が必要です。</p><p>撮影日時の初期値は画像を追加した時刻です。以前のスクリーンショットを登録するときは実際の撮影日時へ変更してください。コイン・販売・配達の日時との前後関係が照合に使われます。</p><p>重量kgではなく個数を読み取ります。判定行は登録商品・素材・SPコインに割り振り、数量を確認して保存します。未特定の行を勝手に消したり、0個と確定したりはしません。</p><p>在庫履歴の行を押すと全項目を編集できます。画像の判定名や割り振り先を変更し、足りない行を追加できます。比較基準も詳細画面から指定できます。</p><p>請求書・在庫・コインを後から編集すると再計算し、関連する以前の確認を無効にします。</p></div></details><details class=\"help-topic\"><summary>在庫照合・差の見方</summary><div class=\"help-topic-body\"><p>在庫レポートは最初に直近2回の在庫を比較します。「基準から最新まで」や開始・終了の指定にも切り替えられます。「開始在庫＋コイン交換−店頭の請求−デリバリー＝予定在庫」と実在庫・差を表示し、通常食べ物・同時回復・その他の種類を分けた表で確認できます。未確認・数量不明があれば一致とは表示しません。「区間ごとの判定・計算の内訳」から各区間のコイン報告・日時の確認を開けます。</p><p>在庫は商品と対応する素の合計です。素1個から商品1個を作るだけなら総数は変わりません。通常の食べ物と同時回復は別の種類として照合します。</p><p>予定在庫＝開始在庫＋コイン交換で増えた素−個数が分かる店頭販売−デリバリー。種類や個数が不明の売上は勝手に割り振りません。金額を単価で割ったり、在庫の差を販売数として登録したりはしません。</p><p>交換枚数＝開始コイン＋期間内の収集記録−終了コイン。10枚→素100個（終了在庫が2026-09-03 17:00より前の区間は50個）。交換先は決めつけず、どの配分でも説明できない差を表示します。</p><p>種類別表の「販売後・交換前」は開始数から店頭・配達を引いた数です。「補充相当」はその数と実在庫の差で、交換先の確定記録ではありません。交換先は不明のまま、どの配分でも残る最小の差を調べます。</p><p>「少なくとも」は交換先をどう選んでも説明できない最小の差です。種類間や期間間の増減を相殺せず、途中の不足・増加は区間ごとに残します。期間全体の純差が0でも一致とは限りません。</p><p>その他売上の種類・個数、日時、読み取り、報告が未確定なら「確認が必要」。十分な記録で一致した場合は「記録上は問題なし」。説明不能の減少が残れば「不足あり」。人物や不正の断定ではありません。</p><p>コインがすべてスタッシュへ入り、減ったコインを素へ交換する運用を前提にしています。無料配布・従業員飲食・集計対象外への移動や外部補充を、差の説明として勝手に追加しません。</p><p>10枚単位に満たないコインの端数、登録分を超える増加、数量・日時・読取内容の未確定がある区間は確認対象です。未確認の増減も参考値であり、差が出た原因や人物を断定するものではありません。</p><p>開始在庫と同じ分の記録は期間外、終了在庫と同じ分は期間内です。実際の前後関係が違う場合は元記録の日時を修正します。時刻不明の記録に表示される00:00は、実際の時刻が判明した意味ではありません。</p><p>選択した終了日時より後の記録は今回の判定に含めません。新しい在庫を終了に選ぶと、その時点まで再計算できます。「レポートを保存」はその時点の結果をHTMLで出力し、集計方法も含めます。</p></div></details><details class=\"help-topic\"><summary>コイン登録・報告確認</summary><div class=\"help-topic-body\"><p>登録時の「収集・スタッシュへ入れた日時」が空欄の場合は現在時刻です。後からの報告は実際の日時を入力してください。メモも残せます。</p><p>未報告コインを自動で誰かに加算しません。後からの報告は収集・スタッシュへ入れた日時で追加してください。区間ごとに報告漏れがないと確認するまでは交換量・減少差は参考値です。</p><p>登録履歴の編集で枚数を修正すると、該当従業員の累計コインとボーナス算定枚数に差分を反映します。累計枚数を支給のたびにリセットする運用ではありません。</p><p>在庫レポートの「区間ごとの判定・計算の内訳」から区間を開き、「コイン報告・日時の確認」を行います。確認はWindowsで保存できます。元の在庫・販売・コインが変わると以前の確認は無効になります。</p><p>履歴導入前の残高・初期登録・累計修正は、期間内に集めてスタッシュへ入れたコインとしては数えません。旧方式の確認記録は保持し、現在の判定は登録されたコイン・実在庫・請求書から計算します。</p></div></details><details class=\"help-topic\"><summary>購入者・従業員名簿</summary><div class=\"help-topic-body\"><p>購入者の名前・行を押すと詳細が開きます。名前・別名の編集、まとめる相手の選択、「この人を統合」は詳細内で行います。購入回数、店頭・デリバリー履歴を統合し、元の名前を別名に残すため、次回の取り込みにも使えます。</p><p>請求書の名前が表示名と違う場合は別名を登録します。購入者はカンマ区切り、従業員はカンマまたは改行区切りで複数の別名を入力できます。登録名は次の画像読み取りの照合にも使います。</p><p>購入者の統合は詳細で相手を選び、確認して実行します。選んだ相手に店頭・デリバリーの購入履歴と回数をまとめ、元の名前を別名に残します。</p><p>概要の従業員詳細は全期間の販売実績を表示します。従業員の追加・役職・退職の変更はWindowsで行います。画像から従業員を自動追加せず、未一致の場合は名簿から選ぶか新規追加ボタンで登録します。</p></div></details><details class=\"help-topic\"><summary>ボーナス・支給履歴</summary><div class=\"help-topic-body\"><p>店長以外：役職固定給＋対象期間の売上×設定割合＋今回算定コイン×設定単価。1,000円未満を切り上げ、支給額の手修正もできます。店長は予算から他の従業員への支給を引いた残額（最低0）。退職者は対象外です。</p><p>未支給コイン＝累計コイン−支給履歴に記録した算定枚数（最低0）。今回算定コインは編集可能。支給時の枚数・単価・各加算額・最終支給額を履歴へ保存します。過去に保存されていない内訳は「記録なし」です。</p><p>ボーナス詳細の販売実績は集計期間内の全件。概要の個人詳細は全期間の全件です。スクロールで閲覧し、Windowsでは行から伝票を編集できます。過去の支給履歴の金額は、請求書を直しても自動で書き換えません。</p><p>対象売上は食べ物・飲み物・ジョイント・その他売上の合計です。売上割合の初期値は40%、コイン単価の初期値は80,000です。設定で変更できます。</p><p>例：役職固定給100,000＋売上1,000,000×40%＋算定コイン10枚×80,000＝1,300,000。店長以外の支給総額が予算を超える場合、店長分は0になります。</p><p>ボーナスの従業員行を開くと、今回の算定枚数と最終支給額を編集できます。支給履歴は支給時点の記録を使い、現在の算定値で過去の内訳を補いません。</p><p>支給の記録：記録前に支給日・集計期間・販売件数・支給総額を確認します。開始日が終了日より後の期間、記録済みの支給と重なる期間、販売記録が0件の期間は記録しません（二重支給の防止）。集計終了日が今日以降のときは確認画面で注意を表示します。保存に失敗した場合は記録前の状態へ戻します。支給履歴を削除すると、その回の算定コインを未支給に戻し、集計期間を残っている最新の支給から計算し直します。店長は残額で計算し、支給時点の未支給コインを算定済みとして記録します（金額には加えません）。</p></div></details><details class=\"help-topic\"><summary>18夜の月（ケーキアルバム）</summary><div class=\"help-topic-body\"><p>11/1〜11/18のケーキセット企画です。受付・お客さん用のページはiPhone版とは別のサイト（GitHub の moonlight-18nights）にあり、ケーキの画像はGitHubに置かずSupabaseに保存して（「18夜の月 → 設定 → ケーキ画像を登録」）、その夜に買った人にだけ見せます。記録はSupabaseの cake_* テーブルに保存します。従業員管理の業務データには書き込みません（受付の名前候補に購入者名、受け付ける人の候補に在籍中の従業員名を読むだけ）。受付ではお客さんを名前でも4桁の番号でも探せます。アルバムは従業員管理の購入者とつながり（受付で名前・別名が一致すると自動）、「アルバム（お客さん）」で手動でもつなげます。お客さんがアルバムから名前の変更を申請すると「名前変更の申請」に届き、承認するとアルバムの名前と購入者の表示名が変わります（元の名前は購入者の別名に残ります）。</p><p>Windowsの「18夜の月」で、来店の記録・アルバム・街への寄せ書きを確認できます。寄せ書きは書かれた時点で公開予定になり、最終夜に公開されます。まずいものは「非公開」にします（非公開にされた人が書き直しても非公開のまま。「公開に戻す」で戻せます）。「新しいもの」は「ここまで確認した」を押した後に書かれた寄せ書きです。記録の削除、お客さんの名前の修正・削除、夜空の目標数、受付の合言葉の変更もここで行います。</p><p>アルバムは「図鑑」「画像・飾り」「寄せ書き」のタブに分かれています。前の夜から続けて来た夜のカードには流れ星（✦）が付き、2夜続けて来ると画像に流れ星を入れられます。画像のフレームは集めた夜の数で増えます（月あかり1夜・星くず3夜・三日月7夜・十三夜12夜・満月18夜）。コレクション画像は名前・称号の有無を選べます。最終夜（11/18）から、来た夜の数と集めたケーキが入った「月の証明書」を保存できます。来た夜の数で名前と月の形が変わります（1〜5夜は三日月、6〜11夜は半月、12〜17夜は十三夜、18夜すべてで「満月証明書」）。署名は店長 ここここし ここし。</p><p>購入者の詳細（Windowsは購入者一覧の行、iPhoneは購入者のカード）では、店頭・デリバリーの購入履歴の全件と、18夜の月の参加状況（来た夜・ケーキ・一緒に来た人・寄せ書きと公開／非公開）を見られます。18夜の月はアルバムが購入者とつながっている人だけ表示されます（テストの記録は出しません）。</p><p>受付ページ・お客さん用ページのURLの最後に ?test=1 を付けると、本番とは別のテストの記録で試せます（テストの「今夜」を自由に選べます）。上の「テスト」で確認し、「テストの記録をすべて消す」で片付けます。</p></div></details><details class=\"help-topic\"><summary>設定・APIキー・クラウド接続</summary><div class=\"help-topic-body\"><p>Gemini APIキーは設定で保存します。バックアップJSONには含めず、Windowsのアプリ専用領域に保存します。利用可能な環境では暗号化して保存します。</p><p>クラウド接続にはSupabaseのURLと公開キーを使います。Secret key / service_roleは入力しません。Windowsはadminで登録・編集、iPhoneはviewerで閲覧します。</p><p>管理者パスワードもPCのアプリ専用設定に保存し、利用可能な環境では暗号化します。接続・同期状況は設定の状態表示で確認できます。</p></div></details><details class=\"help-topic\"><summary>履歴の保存・バックアップ・復旧</summary><div class=\"help-topic-body\"><p>読込・変換に失敗した場合は空データで代替せず、保存とクラウド同期を止めます。起動だけでは保存・同期しません。Windowsは起動時に読み込んだ履歴と、内容が変わる保存の前後を世代別に保管します。世代は自動削除せず、同一内容は重複作成しません。書込内容を照合し、コピーや書込に失敗したら元ファイルの置換を止めます。通常の空データによる上書きや履歴の大幅な減少も止めます。</p><p>「復旧候補を探して保存」で、PC内の保存前コピー・旧保存領域・接続済みクラウドから、履歴のある候補をJSONへ取り出せます。元データは変更しません。過去のバックアップは「バックアップ読込」から、確認して復元できます。保存前コピーはこの更新以降の保護であり、すでに失われた履歴を自動で復元するものではありません。</p><p>設定の「データ・バックアップ」で自動バックアップの件数・保存先を確認できます。「別の保存先を追加・変更」でUSBや同期フォルダーを選ぶと、その時点の履歴と以後の変更を二重保存します。過去の全世代を自動で移す操作ではありません。追加先へ保存できない場合も上書きを止めるため、USBは接続したまま使用してください。PC故障や同じディスクの破損まで完全には防げないため、PC外にもコピーを保管してください。</p><p>クラウド同期も書換え前のデータをPCに保管し、版が変わる競合や古い保存内容の送信を検知したら上書きを止めます。複数ウィンドウの同時起動も抑止します。エラーは保存状態・同期状態に表示します。</p><p>従業員・購入者・販売・配達・在庫・商品・コイン履歴・支給履歴・ボーナス設定は、アプリ本体とは別のデータファイルに保存します。実際の場所は設定の保存先表示で確認できます。</p><p>設定の「自動バックアップを開く」で世代保存のフォルダーを開けます。保存前のコピーと直前の正常なデータを保管し、保存失敗は画面下へ表示します。取り込み結果が残る場合は原因を解消して再保存してください。</p><p>「全データ初期化」は従業員名簿・購入者名簿・販売実績・配達・在庫・商品・コイン実績・支給履歴・ボーナス設定を初期状態へ戻します。Gemini APIキーは削除しません。実行前に対象を確認してください。</p></div></details></div></div></details>";
  page.appendChild(help);
  if (!els.moreSheet.querySelector('[data-more-target="settings"]')) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.moreTarget = "settings";
    button.textContent = "設定";
    els.moreSheet.insertBefore(button, els.moreSheet.querySelector("#closeMoreBtn"));
  }
}

function showPage(name) {
  $$(".page").forEach((p) => p.classList.toggle("active", p.dataset.page === name));
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.pageTarget === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
  setMoreMenuOpen(false);
}

async function enterViewer() {
  setSplash("最新データを取得しています…", 78);
  showLoading(true);
  try {
    await loadCloud();
    els.loginScreen.classList.add("hidden");
    els.viewerScreen.classList.remove("hidden");
    showPage("overview");
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") loadCloud().catch(() => {});
      if (swRegistration) swRegistration.update().catch(() => {});
    }, 60000);
    setSplash("準備ができました", 100);
    hideSplash(180);
  } finally {
    showLoading(false);
  }
}

function activateWaitingWorker(registration) {
  const waiting = registration.waiting;
  if (!waiting) return;
  toast("更新を反映しています…");
  waiting.postMessage({ type: "SKIP_WAITING" });
}

async function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    swRegistration = registration;
    if (registration.waiting) activateWaitingWorker(registration);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          activateWaitingWorker(registration);
        }
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadedFromUpdate) return;
      reloadedFromUpdate = true;
      location.reload();
    });
    window.addEventListener("focus", () => registration.update().catch(() => {}));
  } catch {}
}

async function init() {
  preventDoubleTapZoom();
  await initServiceWorker();
  const c = connection();
  els.setupUrl.value = c.url;
  els.setupKey.value = c.key;
  els.emailInput.value = localStorage.getItem(EMAIL_STORAGE) || "";
  if (!c.url || !c.key) els.connectionSetup.classList.remove("hidden");
  if (session()?.access_token) {
    setSplash("自動ログインしています…", 40);
    try {
      await enterViewer();
      return;
    } catch (e) {
      clearSession();
      els.loginStatus.textContent = "再ログインしてください。";
    }
  }
  setSplash("ログイン待機中", 100);
  els.loginScreen.classList.remove("hidden");
  hideSplash(260);
}
