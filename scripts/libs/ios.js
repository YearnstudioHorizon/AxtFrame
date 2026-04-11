import readline from "readline";

let rl = null;
let refCount = 0; // 记录当前有几个 prompt 在等待

function getRL() {
  if (!rl || rl.closed) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.on("close", () => {
      rl = null;
    });
  }
  return rl;
}

function prompt(question, defaultValue = "") {
  const q = defaultValue
    ? `${question} (默认: ${defaultValue}): `
    : `${question}: `;

  refCount++;
  return new Promise((resolve) => {
    getRL().question(q, (answer) => {
      resolve(answer.trim() || defaultValue);
      refCount--;
      // 没有更多 prompt 在等待时才关闭，释放 event loop
      if (refCount === 0) rl?.close();
    });
  });
}

export { prompt };
