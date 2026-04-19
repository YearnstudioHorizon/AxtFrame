// scripts/init.js
const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");
const { execSync } = require("child_process");

const VERSION = "v1.0.0";
const REPO = "YearnstudioHorizon/axtFrameNew";
const BIN_DIR = path.join(__dirname, "../bin");

if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR);

function getBinaryName() {
  const platform = os.platform();
  const arch = os.arch();
  const ext = platform === "win32" ? ".exe" : "";
  return `axt-builder-${platform}-${arch}${ext}`;
}

const binaryName = getBinaryName();
const url = `https://github.com/${REPO}/releases/download/${VERSION}/${binaryName}`;
const dest = path.join(
  BIN_DIR,
  "axt-builder" + (os.platform() === "win32" ? ".exe" : ""),
);

console.log(`[Init] 正在从 ${url} 下载二进制产物...`);

const file = fs.createWriteStream(dest);

https
  .get(url, (response) => {
    if (response.statusCode !== 200) {
      console.error(`下载失败: ${response.statusCode}`);
      process.exit(1);
    }
    response.pipe(file);
    file.on("finish", () => {
      file.close();
      // Linux/macOS 需要赋予可执行权限
      if (os.platform() !== "win32") {
        execSync(`chmod +x ${dest}`);
      }
      console.log(`[Init] 构建工具安装成功: ${dest}`);
    });
  })
  .on("error", (err) => {
    console.error(`网络错误: ${err.message}`);
  });
