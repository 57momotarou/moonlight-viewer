Moonlight Viewer（iPhone閲覧専用）

■ 更新のしかた
  yuzucityiphone フォルダーの「中身」を、公開先（GitHub Pages のリポジトリ）へ上書きします。
  ・config.js はZIPに入っていません。公開先にある config.js はそのまま残してください。
  ・古い app.js / style.css / inventory-report.* が公開先に残っていても動作に影響はありません（不要なら削除して構いません）。
  反映後、iPhoneでアプリを開き直すと新しい版に切り替わります（キャッシュ moonlight-viewer-v36）。

■ 初めて公開する場合
  config.js を作り、次の2つを書き込むか、iPhoneのログイン画面「接続設定」から入力します。
    window.MOONLIGHT_CONFIG = { supabaseUrl: "https://xxxx.supabase.co", publishableKey: "sb_publishable_..." };
  Secret key / service_role は絶対に入れないでください。
  viewer アカウントのメールアドレスとパスワードでログインします。

■ 中身
  index.html / sw.js / manifest.json / css / js / shared / icons
  このWeb版にデータの更新・削除処理はありません（閲覧のみ）。

■ 18夜の月
  18夜の月（ケーキアルバム）は別のリポジトリ moonlight-18nights に分けました。
  以前この公開先に置いた album フォルダーは削除して構いません（iPhone版の動作には関係ありません）。
