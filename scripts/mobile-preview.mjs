/**
 * 獨立手機預覽：不碰 Vite / src / server。
 * 用法：node scripts/mobile-preview.mjs
 * 開啟：http://localhost:5188
 */
import http from "node:http";
import { URL } from "node:url";

const PREVIEW_PORT = Number(process.env.MOBILE_PREVIEW_PORT || 5188);
const DEFAULT_APP = process.env.MOBILE_PREVIEW_APP || "http://localhost:5174";

const HTML = (appUrl) => `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MeetFlow · 手機預覽</title>
  <style>
    :root {
      --bg: #1a1f2e;
      --frame: #0c0f16;
      --bezel: #2a3142;
      --accent: #5eead4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(ellipse at 30% 20%, #243044 0%, transparent 50%),
        radial-gradient(ellipse at 70% 80%, #1e293b 0%, transparent 45%),
        var(--bg);
      font-family: "SF Pro Text", "PingFang TC", "Noto Sans TC", system-ui, sans-serif;
      color: #e2e8f0;
    }
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 24px;
    }
    .label {
      font-size: 13px;
      letter-spacing: 0.04em;
      opacity: 0.75;
    }
    .label strong { color: var(--accent); font-weight: 600; }
    .phone {
      width: 390px;
      height: 844px;
      max-height: calc(100vh - 96px);
      background: var(--frame);
      border-radius: 44px;
      border: 3px solid var(--bezel);
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.06),
        0 25px 80px rgba(0,0,0,0.55);
      overflow: hidden;
      position: relative;
    }
    .notch {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      width: 118px;
      height: 28px;
      background: #000;
      border-radius: 18px;
      z-index: 2;
      pointer-events: none;
    }
    iframe {
      border: 0;
      width: 100%;
      height: 100%;
      background: #fff;
      display: block;
    }
    .hint {
      font-size: 12px;
      opacity: 0.5;
      text-align: center;
      max-width: 360px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="label">手機預覽 · <strong>${appUrl}</strong></div>
    <div class="phone">
      <div class="notch" aria-hidden="true"></div>
      <iframe
        src="${appUrl}"
        title="MeetFlow mobile"
        allow="clipboard-read; clipboard-write"
      ></iframe>
    </div>
    <p class="hint">寬度約 iPhone 14（390×844）。電腦版請繼續用原本的 localhost:5174／5175。</p>
  </div>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url || "/", `http://localhost:${PREVIEW_PORT}`);
  if (u.pathname !== "/" && u.pathname !== "/index.html") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const appUrl = u.searchParams.get("app") || DEFAULT_APP;
  const html = HTML(appUrl);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
});

server.listen(PREVIEW_PORT, "127.0.0.1", () => {
  console.log(`[mobile-preview] http://localhost:${PREVIEW_PORT}`);
  console.log(`[mobile-preview] iframe → ${DEFAULT_APP}`);
  console.log(`[mobile-preview] 換來源：http://localhost:${PREVIEW_PORT}/?app=http://localhost:5175`);
});
