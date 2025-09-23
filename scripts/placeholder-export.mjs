import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const outDir = path.join(process.cwd(), "out");

async function main() {
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }
  const html = `<!doctype html><html><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>Build placeholder</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;line-height:1.4;padding:24px}</style></head><body><h1>Build OK</h1><p>Ce dépôt est désormais déployé sur Vercel. Cet artefact est un placeholder pour GitHub Pages.</p></body></html>`;
  await writeFile(path.join(outDir, "index.html"), html);
  console.log("Placeholder static export generated in ./out");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


