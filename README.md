# OneComme 片尾滾動名單（YouTube）

OneComme 插件。它統計本次直播的新會員、會員贈送、Super Chat / Super Sticker、會員里程碑與 Raid，並在 OBS 瀏覽器來源播放片尾滾動名單。

## 安裝

1. `npm install`，然後執行 `npm run build`。
2. 把 `dist/onecomme-rolling-credit/` 整個資料夾複製到 OneComme 的插件資料夾。
   Windows 的位置是 `%APPDATA%\onecomme\plugins\`。
3. 在 OneComme 的插件頁啟用本插件。啟用後按「再読み込み」或重開 OneComme。
4. OBS：新增「瀏覽器來源」。
   - 網址：`http://localhost:11180/plugins/com.onecomme.rolling-credit/index.html`
   - 寬高：1920 × 1080
   - 勾選「場景啟用時重新整理瀏覽器」
5. 設定頁：`http://localhost:11180/plugins/com.onecomme.rolling-credit/settings.html`。
   也可以從 OneComme 插件頁的連結開啟。

## 規則

- 同一場直播用 `data.liveId` 判斷。同一個枠出現新的 liveId 時，自動重設該枠的資料。設定頁也可以手動重設。
- 不統計 `meta.isUpdate` 的留言，也用 `data.id` 去除重複留言。資料存在插件的 `state.json`，重開 OneComme 不會遺失。
- Super Chat 依原幣別顯示。同一人的多筆會合併，同幣別相加，不同幣別並列。「依金額排序」用固定匯率換算，只用來排序。
- 降落（Raid）使用 OneComme v9.2.0 的試驗功能，預設關閉，只顯示來源頻道名稱（YouTube 不提供人數）。在設定頁可以手動補上降落。
- 捲動：名單完全離開畫面上方後，「感謝收看」停在中央。停留時間（預設 5 秒）過後淡出（預設 2 秒）。預設捲動速度 150 px/秒。
- 免費版會在最後一行以很小的半透明文字顯示 OneComme credit（利用規約要求）。

## 開發

| 指令 | 用途 |
|---|---|
| `npm test` | 執行統計邏輯的單元測試（Vitest） |
| `npm run check` | 型別檢查（svelte-check + tsc） |
| `npm run build` | 打包。Vite 打包 overlay 與設定頁，esbuild 打包 `plugin.js`（CJS） |
| `npm run mock` | 在 `127.0.0.1:11180` 啟動模擬的 OneComme，不需要 OneComme 也能測試設定頁和 overlay。要先 build |
| `npm run dev` | Vite 開發伺服器。overlay 可以加 `?demo=1` 顯示假資料 |

在 mock 模式送出測試留言：`POST http://localhost:11180/mock/comments`，body 是 Comment 陣列。

## 需要實機確認

在設定頁開啟「除錯：把原始事件寫入 plugin.log」，然後檢查下列事件的實際資料：

- 贈送會員時，`giftReceivers` 的內容。
- YouTube redirect（降落）事件的形式和欄位，需要確認來源頻道名稱是否能取得。

## 安全性

插件 API 跟隨 OneComme，只在 localhost 提供，沒有額外的認證。如果你把 OneComme 的 API 開放到區域網路，同一網路的其他裝置也能讀取或重設統計資料。
