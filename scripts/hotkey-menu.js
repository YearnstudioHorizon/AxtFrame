/**
 * hotkey-menu.js  —  Node.js 终端底部快捷键菜单栏
 * ES Module，无第三方依赖
 */

import readline from 'readline';
import fs from 'fs';

/* ─── ANSI ──────────────────────────────────────────────────────── */

// 所有写终端操作统一用 writeSync，保证 process.exit 前能刷出
function write(str) {
  try { fs.writeSync(1, str); } catch (_) {}
}

const A = {
  hideCursor:  '\x1b[?25l',
  showCursor:  '\x1b[?25h',
  moveToRow1:  (r)    => `\x1b[${r};1H`,
  clearLine:   '\x1b[2K',
  moveTo:      (r, c) => `\x1b[${r};${c}H`,
  reset:       '\x1b[0m',
  bold:        '\x1b[1m',
  fg:          (r, g, b) => `\x1b[38;2;${r};${g};${b}m`,
  bg:          (r, g, b) => `\x1b[48;2;${r};${g};${b}m`,
};

/* ─── 主题 ──────────────────────────────────────────────────────── */

const THEMES = {
  dark: {
    barBg:    [18, 22, 32],
    keyBg:    [40, 46, 60],
    keyFg:    [220, 230, 255],
    labelFg:  [120, 140, 170],
    sepFg:    [50, 60, 80],
    accentBg: [30, 120, 200],
    accentFg: [255, 255, 255],
  },
  light: {
    barBg:    [230, 235, 245],
    keyBg:    [200, 210, 230],
    keyFg:    [30, 40, 70],
    labelFg:  [90, 105, 135],
    sepFg:    [190, 200, 220],
    accentBg: [0, 100, 200],
    accentFg: [255, 255, 255],
  },
};

/* ─── 按键解析 ──────────────────────────────────────────────────── */

function serializeKey(k) {
  const name = (k.name ?? k.sequence ?? '').toLowerCase();
  const parts = [];
  if (k.ctrl)  parts.push('ctrl');
  if (k.shift) parts.push('shift');
  // Escape 的 ESC 字节和 Alt 前缀相同，readline 会误报 meta=true，忽略之
  if (k.meta && name !== 'escape') parts.push('meta');
  parts.push(name);
  return parts.join('+');
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/\s/g, '');
}

/* ─── 渲染 ──────────────────────────────────────────────────────── */

function cols() { return process.stdout.columns || 80; }
function rows() { return process.stdout.rows    || 24; }

function formatBadge(key) {
  const map = {
    escape:'ESC', enter:'ENTER', space:'SPC', tab:'TAB',
    backspace:'BS', delete:'DEL',
    up:'↑', down:'↓', left:'←', right:'→',
    pageup:'PgUp', pagedown:'PgDn', home:'Home', end:'End',
    f1:'F1',f2:'F2',f3:'F3',f4:'F4',f5:'F5',f6:'F6',
    f7:'F7',f8:'F8',f9:'F9',f10:'F10',f11:'F11',f12:'F12',
  };
  const parts = key.split('+');
  const mods  = parts.slice(0,-1).map(p=>({ctrl:'^',shift:'⇧',meta:'◆'})[p]??p.toUpperCase());
  const main  = parts.at(-1);
  return [...mods, map[main] ?? main.toUpperCase()].join('');
}

function buildLine(bindings, theme, padding) {
  const t   = THEMES[theme] ?? THEMES.dark;
  const W   = cols();
  const pad = ' '.repeat(padding);

  const bgBar = A.bg(...t.barBg);
  const fgKey = A.bg(...t.keyBg) + A.bold + A.fg(...t.keyFg);
  const fgLbl = A.fg(...t.labelFg);
  const fgSep = A.fg(...t.sepFg);
  const rst   = A.reset + bgBar;

  const items = bindings.map(b => {
    const badge = `[${formatBadge(b._key)}]`;
    return { badge, label: b.label, w: badge.length + 1 + b.label.length };
  });

  const sepW = 1 + padding * 2;
  let used = 1;
  const vis = [];
  for (let i = 0; i < items.length; i++) {
    const extra = i === 0 ? 0 : sepW;
    const hint  = items.length - i - 1 > 0 ? (` …+${items.length-i-1}`).length : 0;
    if (used + extra + items[i].w + hint <= W) { used += extra + items[i].w; vis.push(i); }
    else break;
  }

  const hidden = items.length - vis.length;
  let line = bgBar + ' ';
  vis.forEach((idx, i) => {
    if (i > 0) line += pad + fgSep + '│' + rst + pad;
    line += fgKey + items[idx].badge + rst + ' ' + fgLbl + items[idx].label + rst;
  });
  if (hidden > 0) line += pad + fgSep + '│' + rst + pad + fgLbl + `…+${hidden}` + rst;

  const rawLen = line.replace(/\x1b\[[^m]*m/g, '').length;
  line += ' '.repeat(Math.max(0, W - rawLen)) + A.reset;
  return line;
}

/* ─── 导出 ──────────────────────────────────────────────────────── */

/**
 * @typedef {{ key: string, label: string, action: Function }} HotkeyBinding
 * @typedef {{ theme?: 'dark'|'light', position?: 'bottom'|'top', padding?: number }} HotkeyMenuOptions
 */

/**
 * 创建终端快捷键菜单栏
 * @param {HotkeyBinding[]}   bindings
 * @param {HotkeyMenuOptions} [options]
 */
export function createHotkeyMenu(bindings, options = {}) {
  const { theme = 'dark', position = 'bottom', padding = 2 } = options;

  let list      = bindings.map(b => ({ ...b, _key: normalizeKey(b.key) }));
  let destroyed = false;

  // 当前光标所在行（渲染正文时用）——初始设为倒数第二行
  // 我们只记录"菜单之外的光标行"用于恢复，不用 save/restore
  function menuRow() { return position === 'top' ? 1 : rows(); }

  /* ── 渲染菜单行（不移动用户光标） ── */
  function render() {
    if (destroyed) return;
    const mr   = menuRow();
    const line = buildLine(list, theme, padding);
    // 1. 移到菜单行，清行，写内容
    // 2. 用 CPL（\x1b[A 上移）+ \r 回到写之前的位置并不依赖 save/restore
    // 实际上最简单可靠的做法：写完后用 \x1b[{mr}A 上移 mr 行再回到列首
    // 但我们并不知道用户光标在哪一行，所以直接在菜单行写完后
    // 用 \x1b[999;1H 把光标停在左上角（或用 \r\n 让 shell 接管）
    // ——最终选择：写完菜单后把光标移回到菜单行的上一行末尾，让正常输出继续
    write(
      A.moveToRow1(mr) +
      A.clearLine +
      line +
      A.moveToRow1(mr === 1 ? 2 : mr - 1) // 光标回到菜单行紧邻行
    );
  }

  /* ── 清除菜单行（同步，exit 安全） ── */
  function clearMenuRow() {
    const mr = menuRow();
    write(
      A.moveToRow1(mr) +
      A.clearLine +
      A.reset +
      A.showCursor +
      A.moveToRow1(mr === 1 ? 2 : mr - 1)
    );
  }

  /* ── stdin raw mode ── */
  const { stdin } = process;
  if (stdin.isTTY) {
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
  }

  write(A.hideCursor);

  /* ── 高亮闪烁 ── */
  function flash(b) {
    if (destroyed) return;
    const t   = THEMES[theme] ?? THEMES.dark;
    const W   = cols();
    const mr  = menuRow();
    const txt = ` [${formatBadge(b._key)}] ${b.label} `;
    const raw = txt.replace(/\x1b\[[^m]*m/g, '');
    const fil = ' '.repeat(Math.max(0, W - raw.length));
    write(
      A.moveToRow1(mr) +
      A.clearLine +
      A.bg(...t.accentBg) + A.bold + A.fg(...t.accentFg) +
      txt + fil + A.reset +
      A.moveToRow1(mr === 1 ? 2 : mr - 1)
    );
    setTimeout(() => render(), 180);
  }

  /* ── 按键处理 ── */
  function onKeypress(_ch, key) {
    if (!key) return;
    if (key.ctrl && key.name === 'c') { destroy(); process.exit(0); }

    const pressed = serializeKey(key);
    for (const b of list) {
      if (pressed === b._key) { flash(b); b.action?.(); return; }
    }
  }

  stdin.on('keypress', onKeypress);

  /* ── resize ── */
  function onResize() { render(); }
  process.stdout.on('resize', onResize);

  /* ── 首次渲染 ── */
  // bottom 模式：先输出一个换行，把滚动区让出最后一行给菜单
  if (position === 'bottom') write('\n');
  render();

  /* ── 销毁 ── */
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stdin.removeListener('keypress', onKeypress);
    process.stdout.removeListener('resize', onResize);
    clearMenuRow();                    // 同步清除菜单行
    if (stdin.isTTY) {
      stdin.setRawMode(false);
      stdin.pause();
    }
  }

  return {
    render,
    update(nb) { list = nb.map(b => ({ ...b, _key: normalizeKey(b.key) })); render(); },
    destroy,
  };
}
