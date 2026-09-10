import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { render } from "@react-email/render";

import {
  EMAIL_PREVIEW_FIXTURES,
  EMAIL_PREVIEW_WIDTHS,
} from "../src/emails/email-preview-fixtures.ts";

const outputDirectory = path.resolve(process.argv[2] ?? ".email-previews");
await mkdir(outputDirectory, { recursive: true });

const previews: string[] = [];
for (const fixture of EMAIL_PREVIEW_FIXTURES) {
  const html = await render(fixture.element);
  const filename = `${fixture.name}.html`;
  await writeFile(path.join(outputDirectory, filename), html, "utf8");

  for (const width of EMAIL_PREVIEW_WIDTHS) {
    previews.push(`
      <section>
        <h2>${fixture.name} — ${width}px</h2>
        <iframe
          title="${fixture.name} at ${width}px"
          src="${filename}"
          width="${width}"
          height="760"
        ></iframe>
      </section>`);
  }
}

const index = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pawcast email previews</title>
    <style>
      body { background: #dfe4e1; color: #26332d; font-family: system-ui, sans-serif; margin: 0; padding: 24px; }
      main { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
      h1 { width: 100%; }
      h2 { font-size: 14px; }
      iframe { background: white; border: 1px solid #9aa79f; max-width: 100%; }
    </style>
  </head>
  <body>
    <main><h1>Pawcast email previews</h1>${previews.join("")}</main>
  </body>
</html>`;

await writeFile(path.join(outputDirectory, "index.html"), index, "utf8");
console.log(`Wrote local email previews to ${outputDirectory}`);
