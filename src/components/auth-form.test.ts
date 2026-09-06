import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

Object.assign(globalThis, {
  HTMLElement: dom.window.HTMLElement,
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
const { cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const { AuthModeTabs } = await import("./auth-mode-tabs");

afterEach(cleanup);

test("marks the selected authentication mode with pressed state and visible text", () => {
  let mode: "sign-in" | "sign-up" = "sign-in";
  const TestButton = ({ tone: _tone, ...props }: import("./felt").FeltButtonProps) => (
    createElement("button", props)
  );
  const renderTabs = () => render(createElement(AuthModeTabs, {
    button: TestButton,
    mode,
    onSelect: (nextMode) => {
      mode = nextMode;
      cleanup();
      renderTabs();
    },
  }));

  renderTabs();
  const signIn = screen.getByRole("button", { name: /sign in/i });
  const signUp = screen.getByRole("button", { name: /sign up/i });

  assert.equal(screen.getByRole("group", { name: "Authentication mode" }).tagName, "DIV");
  assert.equal(signIn.getAttribute("aria-pressed"), "true");
  assert.equal(signUp.getAttribute("aria-pressed"), "false");
  assert.equal(screen.getByText("Current mode").parentElement, signIn);

  fireEvent.click(signUp);

  const selectedSignIn = screen.getByRole("button", { name: /sign in/i });
  const selectedSignUp = screen.getByRole("button", { name: /sign up/i });
  assert.equal(selectedSignIn.getAttribute("aria-pressed"), "false");
  assert.equal(selectedSignUp.getAttribute("aria-pressed"), "true");
  assert.equal(screen.getByText("Current mode").parentElement, selectedSignUp);
});
