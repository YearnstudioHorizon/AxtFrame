import figlet from "figlet";
import chalk from "chalk";

function showBanner() {
  const text1 = figlet.textSync("Axt", { font: "ANSI Shadow" });
  console.log(chalk.blue(text1));
  const text2 = figlet.textSync("Frame", { font: "ANSI Shadow" });
  console.log(chalk.blue(text2));
}
export default showBanner;
