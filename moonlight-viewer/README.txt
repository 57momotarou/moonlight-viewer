Moonlight Viewer（iPhone閲覧専用）

■ 更新のしかた
  yuzucityiphone フォルダーの「中身」を、公開先（GitHub Pages のリポジトリ）へ上書きします。
  ・config.js はZIPに入っていません。公開先にある config.js はそのまま残してください。
  ・古い app.js / style.css / inventory-report.* が公開先に残っていても動作に影響はありません（不要なら削除して構いません）。
  反映後、iPhoneでアプリを開き直すと新しい版に切り替わります（キャッシュ moonlight-viewer-v34）。

■ 初めて公開する場合
  config.js を作り、次の2つを書き込むか、iPhoneのログイン画面「接続設定」から入力します。
    window.MOONLIGHT_CONFIG = { supabaseUrl: "https://xxxx.supabase.co", publishableKey: "sb_publishable_..." };
  Secret key / service_role は絶対に入れないでください。
  viewer アカウントのメールアドレスとパスワードでログインします。

■ 中身
  index.html / sw.js / manifest.json / css / js / shared / icons
  このWeb版にデータの更新・削除処理はありません（閲覧のみ）。

■ 18夜の月（ケーキアルバム）2026/11/1〜11/18
  album/ フォルダーが企画用のページです（iPhone閲覧版とは別のページ。ログイン不要）。
    お客さん用：  https://（公開先）/album/
    受付（従業員）：https://（公開先）/album/staff.html   ← 合言葉が必要
  接続先はひとつ上の config.js を使います。config.js が空の場合だけ album/album-config.js に書いてください。
  初回は Supabase の SQL Editor で docs/supabase/moonlight_cake_album.sql を実行し、受付の合言葉を設定してください（手順は docs/HANDOFF.md）。
