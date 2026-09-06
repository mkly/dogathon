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
const { render: renderEmail } = await import("@react-email/render");
const { PupdateEmail } = await import("../emails/pupdate-email");
const { PostscriptEditor } = await import("./postscript-editor");

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
    createElement(PostscriptEditor, {
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
    createElement(PostscriptEditor, {
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

test("keeps the editor preview and sent email plain text in agreement", async () => {
  const postscript = [
    "Thanks for helping **Biscuit** feel *safe*.",
    "",
    "[See the adoption calendar](https://pawcast.test/events)",
    "",
    "## This weekend",
    "",
    "- Bring a friend",
    "- Share Biscuit's story",
    "",
    "We hope to see you there.",
  ].join("\n");
  const { container } = render(
    createElement(PostscriptEditor, {
      classNames,
      defaultValue: postscript,
      id: "postscript",
      maxLength: 2000,
      name: "pinnedPostscript",
    }),
  );

  const previewText = await waitFor(() => {
    const preview = container.querySelector<HTMLElement>(".preview p");
    assert.ok(preview?.textContent);
    assert.match(preview.textContent, /Bring a friend/u);
    return preview.textContent;
  });
  const previewBlocks = previewText.split("\n\n");
  assert.deepEqual(previewBlocks, [
    "Thanks for helping Biscuit feel safe.",
    "See the adoption calendar",
    "This weekend",
    "Bring a friend",
    "Share Biscuit's story",
    "We hope to see you there.",
  ]);

  const emailPlainText = await renderEmail(createElement(PupdateEmail, {
    companionName: "Biscuit",
    subject: "A pupdate from Biscuit",
    bodyText: `Here is the latest.\n\n${postscript}`,
    companionUrl: "https://pawcast.test/companions/biscuit",
    origin: "https://pawcast.test",
  }), { plainText: true });
  const normalizedEmail = emailPlainText.toLocaleLowerCase();
  let previousIndex = -1;
  for (const line of previewBlocks) {
    const index = normalizedEmail.indexOf(line.toLocaleLowerCase(), previousIndex + 1);
    assert.ok(index > previousIndex, `Expected email text to contain preview line in order: ${line}`);
    previousIndex = index;
  }
  // React Email appends the link URL after the label; the editor preview
  // intentionally shows only its text, which remains in the same block order.
  assert.match(emailPlainText, /See the adoption calendar https:\/\/pawcast\.test\/events/u);
});

test("does not submit Markdown over the character limit", async () => {
  const { container } = render(
    createElement(PostscriptEditor, {
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
