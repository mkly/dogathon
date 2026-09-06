import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

Object.assign(globalThis, {
  Element: dom.window.Element,
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
const { CheckInChatView } = await import("./check-in-chat-view.tsx");

const residents = [
  { id: "one", name: "Biscuit", photoUrls: [] },
  { id: "two", name: "Mabel", photoUrls: [] },
  { id: "three", name: "Scout", photoUrls: [] },
];
const classNames = {
  chatFrame: "chat-frame",
  companionChip: "companion-chip",
  companionPicker: "companion-picker",
};

afterEach(cleanup);

function renderView(currentResidents = residents) {
  return render(createElement(CheckInChatView, {
    classNames,
    emptyState: createElement("p", null, "No companions are available."),
    renderPhoto: () => null,
    renderSession: (resident) => createElement("p", null, `Checking in with ${resident.name}`),
    residents: currentResidents,
  }));
}

test("moves companion selection and focus with radio group keyboard controls", () => {
  renderView();
  const biscuit = screen.getByRole("radio", { name: "Biscuit" });
  const mabel = screen.getByRole("radio", { name: "Mabel" });
  const scout = screen.getByRole("radio", { name: "Scout" });

  assert.equal(biscuit.tabIndex, 0);
  assert.equal(mabel.tabIndex, -1);

  biscuit.focus();
  fireEvent.keyDown(biscuit, { key: "ArrowLeft" });
  assert.equal(scout.getAttribute("aria-checked"), "true");
  assert.equal(scout.tabIndex, 0);
  assert.equal(document.activeElement, scout);

  fireEvent.keyDown(scout, { key: "Home" });
  assert.equal(document.activeElement, biscuit);
  fireEvent.keyDown(biscuit, { key: "End" });
  assert.equal(document.activeElement, scout);
  fireEvent.keyDown(scout, { key: "ArrowRight" });
  assert.equal(document.activeElement, biscuit);
});

test("renders the empty state when there are no residents", () => {
  renderView([]);

  assert.equal(screen.getByText("No companions are available.").tagName, "P");
  assert.equal(screen.queryByRole("radiogroup"), null);
});
