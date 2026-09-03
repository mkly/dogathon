# Agent notes

## Dependencies are NOT baked into the image lease

The Incus image your box is leased from does not include this project's
`node_modules`. Before running any lint, test, build, or Prisma command in a
fresh box, install dependencies first:

```sh
npm install
```

Run it from the repo root inside the box. Skipping this is why commands like
`npm run lint` or `npm run build` fail with missing-module errors on a new
lease. `node_modules` is gitignored and never synced into the box, so every
fresh lease needs its own install.

## Styling

- Use CSS Modules only; do not use Tailwind or runtime CSS-in-JS.
- Each primitive in `src/components` owns exactly one CSS Module.
- Route pages compose primitives and keep a module only for page-specific layout.
- Keep tokens, resets, tone utilities, and focus rules only in `src/app/globals.css` and `src/app/felt.css`.
- Never restyle a primitive with a descendant selector from another module; pass `className` or a prop instead.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
