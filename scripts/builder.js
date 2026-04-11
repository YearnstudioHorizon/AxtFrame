//const fs = require('fs');
//const path = require('path');
//const esbuild = require('esbuild');

import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';

const config = JSON.parse(fs.readFileSync('./axt.config.json', 'utf-8'));

// ─── ProgressBar ───────────────────────────────────────────────
class ProgressBar {
  constructor({ width = 28 } = {}) {
    this.width = width;
    this.startTime = Date.now();
  }

  update(current, total, msg = '') {
    const percent = Math.round((current / total) * 100);
    const filled = Math.round(this.width * percent / 100);
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    const bar =
      '\x1b[36m' + '▓'.repeat(filled) +
      '\x1b[90m' + '░'.repeat(this.width - filled) +
      '\x1b[0m';

    const pct   = '\x1b[1m' + String(percent).padStart(3) + '%\x1b[0m';
    const ratio = '\x1b[90m' + `${current}/${total}` + '\x1b[0m';
    const time  = '\x1b[33m' + elapsed + 's\x1b[0m';

    process.stdout.write(`\r\x1b[2K  ${pct} [${bar}] ${ratio} ${time} ${msg}`);
  }

  clear() {
    process.stdout.write('\r\x1b[2K');
  }
}

// ─── scanBlocks ────────────────────────────────────────────────
function scanBlocks(dir) {
  const files = fs.readdirSync(dir);
  let blocks = [];

  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      blocks.push({ type: 'category', name: file, children: scanBlocks(fullPath) });
    } else if (file.endsWith('.js')) {
      blocks.push({ type: 'block', id: path.basename(file, '.js'), path: fullPath.replace(/\\/g, '/') });
    }
  });
  return blocks;
}

function countBlocks(items) {
  let n = 0;
  items.forEach(item => {
    if (item.type === 'block') n++;
    else if (item.type === 'category') n += countBlocks(item.children);
  });
  return n;
}

// ─── generateEntry ─────────────────────────────────────────────
function generateEntry(structure, onBlock) {
  let imports = [];
  let registrations = [];
  let blockCounter = 0;

  function walk(items) {
    items.forEach(item => {
      if (item.type === 'block') {
        const varName = `block_${blockCounter++}`;
        imports.push(`import * as ${varName} from '../${item.path}';`);
        registrations.push(`this._registerBlock('${item.id}', ${varName});`);
        onBlock(item.id);
      } else if (item.type === 'category') {
        registrations.push(`this._addLabel('${item.name}');`);
        walk(item.children);
      }
    });
  }

  walk(structure);

  const template = `
import { AxtBase } from './core/BaseExtension';
${imports.join('\n')}

class Extension extends AxtBase {
    constructor(runtime) {
        super(runtime, '${config.id}', '${config.name}');
        ${registrations.join('\n        ')}
    }
}

Scratch.extensions.register(new Extension(window.Scratch.vm.runtime));
`;

  fs.writeFileSync('./src/.temp_entry.js', template);
}

// ─── build 函数 ────────────────────────────────────────────────
async function build({ silent = false } = {}) {
  const bar = silent ? null : new ProgressBar();
  const structure = scanBlocks('./src/blocks');
  const total = countBlocks(structure);
  let processed = 0;

  generateEntry(structure, (blockId) => {
    processed++;
    bar?.update(processed, total, blockId);
  });

  bar?.update(total, total, 'bundling...');

  await esbuild.build({
    entryPoints: ['./src/.temp_entry.js'],
    bundle: true,
    outfile: './dist/extension.js',
  });

  bar?.clear();
  return total;
}

export default build;

// ─── 直接运行时执行 ────────────────────────────────────────────
import showBanner from "./banner.js"

import { fileURLToPath } from 'url'

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // import showBanner from "./banner.js"
  showBanner();
  build().then(total => {
    console.log(`\x1b[32m✔\x1b[0m Built \x1b[1m${total}\x1b[0m blocks`);
  }).catch(err => {
    console.error('\x1b[31m✘\x1b[0m Build failed:', err.message);
    process.exit(1);
  });
}
