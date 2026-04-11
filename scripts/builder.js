//const fs = require('fs');
//const path = require('path');
//const esbuild = require('esbuild');

import fs from "fs";
import path from "path";
import esbuild from "esbuild";
import { pathToFileURL } from "url";

const config = JSON.parse(fs.readFileSync("./axt.config.json", "utf-8"));

// ─── ProgressBar ───────────────────────────────────────────────
class ProgressBar {
  constructor({ width = 28 } = {}) {
    this.width = width;
    this.startTime = Date.now();
  }

  update(current, total, msg = "") {
    const percent = Math.round((current / total) * 100);
    const filled = Math.round((this.width * percent) / 100);
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    const bar =
      "\x1b[36m" +
      "▓".repeat(filled) +
      "\x1b[90m" +
      "░".repeat(this.width - filled) +
      "\x1b[0m";

    const pct = "\x1b[1m" + String(percent).padStart(3) + "%\x1b[0m";
    const ratio = "\x1b[90m" + `${current}/${total}` + "\x1b[0m";
    const time = "\x1b[33m" + elapsed + "s\x1b[0m";

    process.stdout.write(`\r\x1b[2K  ${pct} [${bar}] ${ratio} ${time} ${msg}`);
  }

  clear() {
    process.stdout.write("\r\x1b[2K");
  }
}

// ─── scanBlocks ────────────────────────────────────────────────
function scanBlocks(dir) {
  const files = fs.readdirSync(dir);
  let blocks = [];

  files.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      blocks.push({
        type: "category",
        name: file,
        children: scanBlocks(fullPath),
      });
    } else if (file.endsWith(".js")) {
      blocks.push({
        type: "block",
        id: path.basename(file, ".js"),
        path: fullPath.replace(/\\/g, "/"),
      });
    }
  });
  return blocks;
}

function countBlocks(items) {
  let n = 0;
  items.forEach((item) => {
    if (item.type === "block") n++;
    else if (item.type === "category") n += countBlocks(item.children);
  });
  return n;
}

// ─── generateEntry ─────────────────────────────────────────────
async function generateEntry(structure, onBlock) {
  let imports = [];
  let registrations = [];
  let blockCounter = 0;

  // 验证块文件的导出
  async function validateBlock(filePath, blockId) {
    try {
      // 在全局提供 Scratch 对象供块文件使用
      global.Scratch = {
        BlockType: {
          COMMAND: "command",
          REPORTER: "reporter",
          BOOLEAN: "Boolean",
          HAT: "hat",
          EVENT: "event",
        },
      };

      const modulePath = path.resolve(filePath);
      // 将本地路径转换为标准的 file:// URL，并追加时间戳破坏 ESM 缓存
      const fileUrl = pathToFileURL(modulePath).href;
      const module = await import(`${fileUrl}?t=${Date.now()}`);

      if (!module.info) {
        throw new Error(`Missing 'info' export`);
      }

      if (typeof module.info !== "object") {
        throw new Error(`'info' must be an object, got ${typeof module.info}`);
      }

      if (!module.info.text) {
        process.stdout.write("\r\x1b[2K"); // 清除当前进度条所在的行
        console.warn(
          `\x1b[33m⚠ 警告:\x1b[0m 积木块 "${blockId}" 缺失 info.text 属性，将默认使用文件名`,
        );
      }

      if (module.func && typeof module.func !== "function") {
        process.stdout.write("\r\x1b[2K");
        console.warn(
          `\x1b[33m⚠ 警告:\x1b[0m 积木块 "${blockId}" 的 func 并不是一个函数`,
        );
      }
    } catch (error) {
      console.error(
        `\x1b[31m✘\x1b[0m Validation failed for block "${blockId}" (${filePath}):`,
      );
      console.error(`   ${error.message}`);
      process.exit(1);
    }
  }

  async function walk(items) {
    for (const item of items) {
      if (item.type === "block") {
        // 在生成代码前先验证
        await validateBlock(item.path, item.id);

        const varName = `block_${blockCounter++}`;
        imports.push(`import * as ${varName} from '../${item.path}';`);
        registrations.push(`this._registerBlock('${item.id}', ${varName});`);
        onBlock(item.id);
      } else if (item.type === "category") {
        registrations.push(`this._addLabel('${item.name}');`);
        await walk(item.children);
      }
    }
  }

  await walk(structure);

  const template = `
import { AxtBase } from './core/BaseExtension';
${imports.join("\n")}

class Extension extends AxtBase {
    constructor(runtime) {
        super(runtime, '${config.id}', '${config.name}');
        ${registrations.join("\n        ")}
    }
}

Scratch.extensions.register(new Extension(window.Scratch.vm.runtime));
`;

  fs.writeFileSync("./src/.temp_entry.js", template);
}

function applyCallProtectWrapper(outfile) {
  if (!config.callprotect) return;

  const injectorPath = "./scripts/libs/blocky-injector.js";
  const injectorCode = fs.readFileSync(injectorPath, "utf-8").trim();
  const bundleCode = fs.readFileSync(outfile, "utf-8").trim();
  const wrappedCode = `(function (Scratch) {
${injectorCode}
${bundleCode}
})(Scratch);
`;

  fs.writeFileSync(outfile, wrappedCode);
}

// ─── build 函数 ────────────────────────────────────────────────
async function build({ silent = false } = {}) {
  const bar = silent ? null : new ProgressBar();
  const structure = scanBlocks("./src/blocks");
  const total = countBlocks(structure);
  let processed = 0;

  await generateEntry(structure, (blockId) => {
    processed++;
    bar?.update(processed, total, blockId);
  });

  bar?.update(total, total, "bundling...");

  await esbuild.build({
    entryPoints: ["./src/.temp_entry.js"],
    bundle: true,
    outfile: "./dist/extension.js",
  });

  applyCallProtectWrapper("./dist/extension.js");

  bar?.clear();
  return total;
}

export default build;

// ─── 直接运行时执行 ────────────────────────────────────────────
import showBanner from "./libs/banner.js";

import { fileURLToPath } from "url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  showBanner();
  build()
    .then((total) => {
      console.log(`\x1b[32m✔\x1b[0m Built \x1b[1m${total}\x1b[0m blocks`);
    })
    .catch((err) => {
      console.error("\x1b[31m✘\x1b[0m Build failed:", err.message);
      process.exit(1);
    });
}
