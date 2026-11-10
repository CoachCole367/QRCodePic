import { mkdir, copyFile, cp } from "node:fs/promises";
import { generateQR } from "./qr.mjs";

await generateQR();
await mkdir("dist", { recursive: true });
for (const file of [
  "index.html",
  "styles.css",
  "app.js",
  "favicon.svg",
  "_headers",
  ".nojekyll",
]) {
  await copyFile(file, `dist/${file}`);
}
await cp("print", "dist/print", { recursive: true });
console.log("Built dist/ — static files only.");
