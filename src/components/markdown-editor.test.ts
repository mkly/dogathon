import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

Object.assign(globalThis, {
  DOMParser: dom.window.DOMParser,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
  MutationObserver: dom.window.MutationObserver,
  Node: dom.window.Node,
  document: dom.window.document,
  getComputedStyle: dom.window.getComputedStyle,
  window: dom.window,
});

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

const { createElement } = await import("react");
const { cleanup, render, screen, waitFor } = await import("@testing-library/react");
const { MarkdownEditor } = await import("./markdown-editor");

const classNames = {
  counter: "counter",
  counterOverLimit: "counter-over-limit",
  editorContent: "editor-content",
  editorSurface: "editor-surface",
  loading: "loading",
  preview: "preview",
  root: "root",
  toolbar: "toolbar",
  toolbarButton: "toolbar-button",
};

afterEach(cleanup);

test("loads Markdown into Tiptap and serializes an equivalent value", async () => {
  const markdown = "**bold** and [link](https://x.y)";
  const { container } = render(
    createElement(MarkdownEditor, {
      classNames,
      defaultValue: markdown,
      id: "postscript",
      maxLength: 2000,
      name: "pinnedPostscript",
    }),
  );

  await waitFor(() => {
    const input = container.querySelector<HTMLInputElement>(
      'input[name="pinnedPostscript"]',
    );
    assert.equal(input?.value, markdown);
  });
});

test("shows the editor content as plain text", async () => {
  render(
    createElement(MarkdownEditor, {
      classNames,
      defaultValue: "**bold** and [link](https://x.y)",
      id: "postscript",
      maxLength: 2000,
      name: "pinnedPostscript",
    }),
  );

  await waitFor(() => {
    const preview = screen.getByRole("region", { name: "Plain-text version" });
    assert.match(preview.textContent ?? "", /bold and link/);
    assert.doesNotMatch(preview.textContent ?? "", /\*\*/);
  });
});

test("shows the configured organization-wide note placeholder", async () => {
  const placeholder = "Thank you for sponsoring. Our adoption fair is this Saturday.";
  const { container } = render(
    createElement(MarkdownEditor, {
      classNames,
      defaultValue: "",
      id: "postscript",
      maxLength: 2000,
      name: "pinnedPostscript",
      placeholder,
    }),
  );

  await waitFor(() => {
    const emptyParagraph = container.querySelector<HTMLElement>("p.is-editor-empty");
    assert.equal(emptyParagraph?.dataset.placeholder, placeholder);
  });
});

test("does not submit Markdown over the character limit", async () => {
  const { container } = render(
    createElement(MarkdownEditor, {
      classNames,
      defaultValue: "x".repeat(2001),
      id: "postscript",
      maxLength: 2000,
      name: "pinnedPostscript",
    }),
  );

  await waitFor(() => {
    const input = container.querySelector<HTMLInputElement>(
      'input[name="pinnedPostscript"]',
    );
    assert.equal(input?.disabled, true);
    assert.equal(screen.getByRole("alert").textContent, "2001 / 2000 characters");
  });
});
