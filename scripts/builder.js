import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";
import showBanner from "./libs/banner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const platform = os.platform();
const arch = os.arch();
const ext = platform === "win32" ? ".exe" : "";
const binaryName = `axt-builder-${platform}-${arch}${ext}`;
const binaryPath = path.join(__dirname, "../bin", binaryName);
const mainGoPath = path.join(__dirname, "../main.go");

let command = "";
let args = [];

const isCalledByParent = process.env.AXT_IS_CHILD === "true"; // 是否由父进程调用

if (!isCalledByParent) {
  showBanner();
}

if (fs.existsSync(binaryPath)) {
  command = binaryPath;
  args = process.argv.slice(2);
} else if (fs.existsSync(mainGoPath)) {
  command = "go";
  args = ["run", "main.go", ...process.argv.slice(2)];
} else {
  console.error("[Error] 找不到二进制文件及main.go");
  process.exit(1);
}

const builder = spawn(command, args, {
  stdio: "inherit",
  shell: false,
});

builder.on("error", (err) => {
  console.error("[Error] 子进程启动失败:", err);
});

builder.on("close", (code) => {
  process.exit(code);
});
