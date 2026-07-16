# 效期管理（expiry-tracker）

離線優先的家庭食品庫存與效期管理 PWA。

## 技術棧

- React 19 + Vite + TypeScript
- Material UI
- Dexie.js / IndexedDB
- vite-plugin-pwa

## 本機執行

```bash
npm install
npm run dev
```

若 Windows PowerShell 的執行原則阻擋 `npm.ps1`，請改用 `npm.cmd install` 與 `npm.cmd run dev`。

Vite 的 base path 已設定為 `/expiry-tracker/`，對應 GitHub Pages 專案網址。
本機開發固定使用 `http://localhost:2222/expiry-tracker/`，與 GitHub Pages 使用相同的 base path。
同一個區域網路中的手機可使用 `http://192.168.0.111:2222/expiry-tracker/` 測試；若電腦的區網 IP 改變，請改用新的 IPv4 位址。

## 指令

```bash
npm run build
npm run test
npm run typecheck
npm run check
```

## 目前狀態

目前包含手機優先導覽、自然清新主題、商品與批次管理、FIFO 消耗、指定批次丟棄、盤點調整、可安全復原的異動紀錄，以及可調整的效期門檻與狀態色。

資料儲存在 IndexedDB。JSON 備份會在一致的資料庫快照中建立；匯入前會驗證版本、ID、商品／分類／批次關聯、異動數量與復原關聯，並以單一交易完整取代資料，失敗時不會留下只還原一半的狀態。
