import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const distDir = path.resolve("dist");
const assetsDir = path.join(distDir, "assets");
const indexPath = path.join(distDir, "index.html");

function escapeClosingScript(content) {
  return content.replaceAll("</script", "<\\/script");
}

let html = await readFile(indexPath, "utf8");
const assets = await readdir(assetsDir);

for (const file of assets) {
  if (file.endsWith(".css")) {
    const cssPath = `/assets/${file}`;
    const css = await readFile(path.join(assetsDir, file), "utf8");
    html = html.replace(
      new RegExp(`<link rel="stylesheet" crossorigin href="${cssPath}">`),
      () => `<style>\n${css}\n</style>`
    );
  }

  if (file.endsWith(".js")) {
    const jsPath = `/assets/${file}`;
    const js = await readFile(path.join(assetsDir, file), "utf8");
    html = html.replace(
      new RegExp(`<script type="module" crossorigin src="${jsPath}"></script>`),
      () => `<script type="module">\n${escapeClosingScript(js)}\n</script>`
    );
  }
}

await writeFile(indexPath, html, "utf8");

console.log(`Wrote single-file HTML: ${indexPath}`);
