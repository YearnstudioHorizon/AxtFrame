import readline from "readline";

export function select(items) {
  return new Promise((resolve) => {
    let selectedIndex = 0;
    const selected = new Set();

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    function render() {
      console.clear();
      console.log("↑↓ 移动  空格 选中  回车 确认\n");
      items.forEach((item, i) => {
        const cursor = i === selectedIndex ? "▶" : " ";
        const check = selected.has(i) ? "✔" : "○";
        console.log(`${cursor} ${check} ${item}`);
      });
    }

    function onKeypress(str, key) {
      if (key.ctrl && key.name === "c") process.exit();

      if (key.name === "up") {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      } else if (key.name === "down") {
        selectedIndex = (selectedIndex + 1) % items.length;
      } else if (key.name === "space") {
        selected.has(selectedIndex)
          ? selected.delete(selectedIndex)
          : selected.add(selectedIndex);
      } else if (key.name === "return") {
        process.stdin.removeListener("keypress", onKeypress);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();
        console.clear();
        resolve([...selected].map((i) => items[i]));
        return;
      }

      render();
    }

    process.stdin.on("keypress", onKeypress);
    render();
  });
}
