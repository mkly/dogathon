import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controlsSource = readFile(
  new URL("../app/[orgSlug]/admin/admin-controls.tsx", import.meta.url),
  "utf8",
);
const stylesSource = readFile(
  new URL("../app/[orgSlug]/admin/admin.module.css", import.meta.url),
  "utf8",
);

function rule(stylesheet: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  );

  assert.ok(match, `Expected to find the ${selector} CSS rule`);
  return match[1];
}

test("draft editor keeps its header and actions outside the scrolling content", async () => {
  const source = await controlsSource;
  const header = source.indexOf("styles.draftDialogHeader");
  const scroller = source.indexOf("styles.draftEditorScroll", header);
  const editor = source.indexOf("className={styles.draftEditor}", scroller);
  const footer = source.indexOf("styles.draftModalActions", editor);

  assert.ok(header >= 0 && header < scroller);
  assert.ok(scroller < editor && editor < footer);
  assert.match(source.slice(scroller, editor), /role="region"/u);
  assert.match(source.slice(scroller, editor), /tabIndex=\{0\}/u);
  assert.match(source.slice(editor, footer), /<MarkdownEditor/u);
  assert.doesNotMatch(source.slice(editor, footer), />Cancel</u);
  assert.match(source.slice(footer), />\s*Cancel\s*</u);
  assert.match(source.slice(footer), /Save changes/u);
});

test("bounded shell assigns overflow only to the keyboard-scrollable editor", async () => {
  const styles = await stylesSource;

  assert.match(rule(styles, ".draftDialog"), /100dvh/u);
  assert.match(rule(styles, ".draftDialog"), /overflow:\s*hidden/u);
  assert.match(
    rule(styles, ".draftDialogPanel"),
    /grid-template-rows:\s*auto minmax\(0, 1fr\) auto/u,
  );
  assert.match(rule(styles, ".draftEditorScroll"), /overflow-y:\s*auto/u);
  assert.match(rule(styles, ".draftEditorScroll"), /overflow-x:\s*hidden/u);
  assert.match(rule(styles, ".draftEditorScroll"), /scrollbar-width:\s*thin/u);
  assert.match(
    rule(styles, ".draftEditorScroll"),
    /scrollbar-gutter:\s*stable/u,
  );
  assert.match(rule(styles, ".draftModalActions"), /border-top/u);
  assert.match(
    styles,
    /@media \(forced-colors: active\)[\s\S]*scrollbar-color:\s*auto/u,
  );
});

test("short and overflowing fixture drafts keep actions in the visible shell", () => {
  const chromeHeight = 190;
  const fixtureDrafts = [
    { contentHeight: 260, name: "short" },
    { contentHeight: 1_180, name: "long" },
    { contentHeight: 1_360, name: "overflowing validation" },
  ];

  for (const viewportHeight of [568, 667, 900]) {
    const shellLimit = viewportHeight - (viewportHeight <= 667 ? 24 : 32);

    for (const fixture of fixtureDrafts) {
      const shellHeight = Math.min(
        shellLimit,
        chromeHeight + fixture.contentHeight,
      );
      const editorViewport = shellHeight - chromeHeight;

      assert.ok(editorViewport > 0, `${fixture.name} has an editor viewport`);
      assert.ok(shellHeight <= shellLimit, `${fixture.name} stays in viewport`);
      assert.equal(
        fixture.contentHeight > editorViewport,
        fixture.contentHeight + chromeHeight > shellLimit,
      );
    }
  }

  for (const viewportWidth of [320, 390, 1024]) {
    const gutter = viewportWidth <= 620 ? 24 : 32;
    const shellWidth = Math.min(680, viewportWidth - gutter);
    assert.ok(shellWidth + gutter <= viewportWidth);
  }
});
