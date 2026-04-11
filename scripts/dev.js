"use strict";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import readline from "readline";
import { exec } from "child_process";
import { WebSocketServer } from "ws";
import http from "http";
import build from "./builder.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// const config = require('../axt.config.json');
const config = JSON.parse(fs.readFileSync("./axt.config.json", "utf-8"));

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 8000;
const EXT_FILE = path.join(__dirname, "../dist/extension.js"); // ← 改成 dist
const LOADER_FILE = path.join(__dirname, "hotLoader.js");

const getHash = () => {
  if (!fs.existsSync(EXT_FILE)) return "";
  const content = fs.readFileSync(EXT_FILE);
  return crypto.createHash("md5").update(content).digest("hex");
};

app.get("/version", (req, res) => {
  res.json({ hash: getHash() });
});

app.get("/code.js", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(EXT_FILE);
});

app.get("/extension.js", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/javascript");
  // console.log("是否开启热重载:", config.hotreload);
  if (config.hotreload) {
    let loaderCode = fs.readFileSync(LOADER_FILE, "utf-8");
    loaderCode = loaderCode.replace("{{EXTENSION_ID}}", config.id);
    res.send(loaderCode);
  } else {
    res.sendFile(EXT_FILE);
  }
});

const broadcastChange = (filename, size) => {
  const hash = getHash();
  const msg = JSON.stringify({ type: "change", hash });

  let sizeStr = "0 B";
  try {
    const stats = fs.statSync(EXT_FILE);
    const fileSize = stats.size;
    sizeStr =
      fileSize < 1024 ? fileSize + " B" : (fileSize / 1024).toFixed(2) + " KB";
  } catch (e) {}

  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });

  const time = new Date().toLocaleTimeString();
  console.log(`\n\x1b[42m\x1b[30m [UPDATE] \x1b[0m \x1b[32m${time}\x1b[0m`);
  console.log(`   文件: ${filename}  大小: ${sizeStr}`);
};

// ─── 监听 src 目录，变化后重新构建 ───────────────────────────
let building = false;
let pendingRebuild = false;

async function rebuild(filename) {
  if (building) {
    pendingRebuild = true; // 构建中又有变化，排队一次
    return;
  }
  building = true;
  process.stdout.write(`\x1b[33m  rebuilding...\x1b[0m`);
  try {
    await build();
    process.stdout.write(`\r\x1b[2K`);
    broadcastChange(filename);
  } catch (e) {
    process.stdout.write(`\r\x1b[2K`);
    console.error(`\x1b[31m  Build error:\x1b[0m`, e.message);
  } finally {
    building = false;
    if (pendingRebuild) {
      pendingRebuild = false;
      rebuild("src/");
    }
  }
}

let fsWait = false;
fs.watch("./src", { recursive: true }, (event, filename) => {
  if (!filename || filename.includes(".temp_entry")) return; // 忽略临时文件
  if (fsWait) return;
  fsWait = setTimeout(() => {
    fsWait = false;
  }, 200);
  rebuild(filename);
});

// ─── 启动服务器 ───────────────────────────────────────────────
server.listen(PORT, async () => {
  console.clear();
  console.log(`\x1b[36m
  ===========================================
           AxtFrame  ·  ${config.name}
  ===========================================
\x1b[0m`);

  process.stdout.write(`\x1b[33m  初始构建中...\x1b[0m`);
  try {
    await build();
    process.stdout.write(
      `\r\x1b[2K\x1b[32m  ✔ 构建完成，正在监听 src/\x1b[0m\n`,
    );
  } catch (e) {
    process.stdout.write(`\r\x1b[2K\x1b[31m  ✘ 初始构建失败\x1b[0m\n`);
    console.error(e.message);
  }

  const autoOpenUrl = `https://turbowarp.org/editor?extension=http://localhost:${PORT}/extension.js`;
  console.log("\n将会自动打开: " + autoOpenUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("是否打开 TurboWarp 网页版? (Y/n) ", (answer) => {
    // 清理掉问题及回答
    process.stdout.write("\x1b[1A\x1b[2K");
    process.stdout.write("\x1b[1A\x1b[2K");
    process.stdout.write("\x1b[1A\x1b[2K");

    if (answer.trim().toLowerCase() !== "n") {
      const startCmd =
        process.platform === "win32"
          ? "start"
          : process.platform === "darwin"
            ? "open"
            : "xdg-open";
      exec(`${startCmd} ${autoOpenUrl}`);
    }
    rl.close();
  });
});
