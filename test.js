import { createHotkeyMenu } from './scripts/hotkey-menu.js';

const menu = createHotkeyMenu([
  { key: 'f1',     label: '帮助',  action: () => console.log('\n[帮助]') },
  { key: 'ctrl+s', label: '保存',  action: () => console.log('\n[保存]') },
  { key: 'ctrl+n', label: '新建',  action: () => console.log('\n[新建]') },
  { key: 'escape', label: '退出',  action: () => menu.destroy() },
], {
  theme:    'dark',     // 'dark' | 'light'
  position: 'bottom',   // 'bottom' | 'top'
  padding:  2,          // 条目间距（空格数）
});
