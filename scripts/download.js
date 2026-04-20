// @ts-nocheck
// scripts/init.js
import { existsSync, mkdirSync, createWriteStream } from "fs";
import { join } from "path";
import { get } from "https";
import { platform as _platform, arch as _arch } from "os";
import { execSync } from "child_process";

const VERSION = "v1.0.2";
const REPO = "YearnstudioHorizon/axtFrame";
const BIN_DIR = join(import.meta.dirname, "../bin");

if (!existsSync(BIN_DIR)) mkdirSync(BIN_DIR);

function getBinaryName() {
  const platform = _platform();
  const arch = _arch();
  const ext = platform === "win32" ? ".exe" : "";
  return `axt-builder-${platform}-${arch}${ext}`;
}

const binaryName = getBinaryName();
const url = `https://github.com/${REPO}/releases/download/${VERSION}/${binaryName}`;
const dest = join(
  BIN_DIR,
  "axt-builder" + (_platform() === "win32" ? ".exe" : ""),
);

console.log(`[Init] 正在从 ${url} 下载二进制产物...`);

function downloadFile(downloadUrl) {
  get(downloadUrl, (response) => {
    // 处理 301/302 重定向
    if (response.statusCode === 301 || response.statusCode === 302) {
      return downloadFile(response.headers.location);
    }
    if (response.statusCode !== 200) {
      console.error(`下载失败: ${response.statusCode}`);
      process.exit(1);
    }

    const file = createWriteStream(dest);
    response.pipe(file);
    file.on("finish", () => {
      file.close();
      // Linux/macOS 需要赋予可执行权限
      if (_platform() !== "win32") {
        execSync(`chmod +x ${dest}`);
      }
      console.log(`[Init] 构建工具安装成功: ${dest}`);
    });
  }).on("error", (err) => {
    console.error(`网络错误: ${err.message}`);
  });
}

downloadFile(url);
