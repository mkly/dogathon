import type { UIMessage } from "ai";

/** Joins the text parts of a chat message; safe to import from client components. */
export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
      part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n");
}
