import showBanner from "./scripts/libs/banner.js";
import { select } from "./scripts/libs/select.js";
import { prompt } from "./scripts/libs/ios.js";
import { writeFileSync } from "fs";

showBanner();
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
