import showBanner from "./libs/banner.js";
import { select } from "./libs/select.js";
import { prompt } from "./libs/ios.js";
import { writeFileSync, existsSync } from "fs";

showBanner();
if (existsSync("./axt.config.json")) {
  console.log("检测到已有 axt.config.json，跳过初始化。");
  console.log(" 如需重新初始化，请先删除该文件再运行 pnpm run init。");
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.log("非交互环境，跳过初始化。");
  process.exit(0);
}

console.log("\n~~欢迎使用本框架, 接下来您需要完成初始化~~");
const workId = await prompt("请输入扩展ID:", "axtProject");
const workName = await prompt("请输入扩展名称:", "Axt Extension");

// await new Promise((resolve) => setTimeout(resolve, 3000));
const result = await select(["启用扩展热重载", "启动外源调用防护"]);

let hotreload = false; // 是否启用扩展热重载
let callprotect = false; // 是否启用外源调用防护

for (const item of result) {
  switch (item) {
    case "启用扩展热重载":
      hotreload = true;
      break;
    case "启动外源调用防护":
      callprotect = true;
      break;
  }
}

const config = {
  id: workId,
  name: workName,
  version: "1.0.0",
  hotreload,
  callprotect,
};

writeFileSync("./axt.config.json", JSON.stringify(config, null, 2), "utf-8");
console.log("\n初始化完成，配置已写入 axt.config.json");
