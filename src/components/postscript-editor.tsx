"use client";

import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type { Editor } from "@tiptap/core";
import { useEffect, useId, useMemo, useState } from "react";

export type PostscriptEditorClassNames = {
  counter: string;
  counterOverLimit: string;
  editorContent: string;
  editorSurface: string;
  loading: string;
  preview: string;
  root: string;
  toolbar: string;
  toolbarButton: string;
};

type PostscriptEditorProps = {
  classNames: PostscriptEditorClassNames;
  defaultValue: string;
  disabled?: boolean;
  id: string;
  labelledBy?: string;
  maxLength: number;
  name: string;
  onValidityChange?: (overLimit: boolean) => void;
  placeholder?: string;
};

const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2] },
    link: false,
  }),
  Link.configure({
    openOnClick: false,
    protocols: ["mailto"],
  }),
  Markdown,
];

export function PostscriptEditor({
  classNames,
  defaultValue,
  disabled = false,
  id,
  labelledBy,
  maxLength,
  name,
  onValidityChange,
  placeholder,
}: PostscriptEditorProps) {
  const previewId = useId();
  // Keep the extension list identity stable: useEditor compares extensions
  // element by element and re-applies every option when one differs.
  const extensions = useMemo(
    () => [
      ...editorExtensions,
      Placeholder.configure({ placeholder: placeholder ?? "Write an email postscript…" }),
    ],
    [placeholder],
  );
  const [markdown, setMarkdown] = useState(defaultValue);
  const [plainText, setPlainText] = useState("");

  const syncContent = (editorInstance: Editor) => {
    setMarkdown(editorInstance.getMarkdown());
    setPlainText(
      editorInstance
        .getText({ blockSeparator: "\n\n" })
        .replace(/\n{3,}/gu, "\n\n"),
    );
  };

  const editor = useEditor({
    content: defaultValue,
    contentType: "markdown",
    editable: !disabled,
    editorProps: {
      attributes: {
        // Prefer the visible field label so the accessible name matches it.
        ...(labelledBy
          ? { "aria-labelledby": labelledBy }
          : { "aria-label": "Postscript content" }),
        class: classNames.editorSurface,
        id,
      },
    },
    extensions,
    immediatelyRender: false,
    onCreate: ({ editor: editorInstance }) => syncContent(editorInstance),
    onUpdate: ({ editor: editorInstance }) => syncContent(editorInstance),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      canRedo: currentEditor?.can().chain().focus().redo().run() ?? false,
      canUndo: currentEditor?.can().chain().focus().undo().run() ?? false,
      heading: currentEditor?.isActive("heading", { level: 2 }) ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      link: currentEditor?.isActive("link") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
    }),
  });

  const overLimit = markdown.length > maxLength;

  useEffect(() => {
    onValidityChange?.(overLimit);
  }, [onValidityChange, overLimit]);

  const setLink = () => {
    if (!editor) return;
    const currentHref = (editor.getAttributes("link").href as string | undefined) ?? "https://";
    const enteredHref = window.prompt(
      "Enter an http, https, or mailto URL. Leave blank to remove the link.",
      currentHref,
    );
    if (enteredHref === null) return;
    const href = enteredHref.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^(https?:\/\/|mailto:)/i.test(href)) {
      window.alert("Links must start with http://, https://, or mailto:.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  const toolbarDisabled = disabled || !editor;

  return (
    <div className={classNames.root}>
      <div aria-label="Postscript formatting" className={classNames.toolbar} role="toolbar">
        <button
          aria-label="Bold"
          aria-pressed={toolbarState?.bold ?? false}
          className={classNames.toolbarButton}
          disabled={toolbarDisabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          type="button"
        >
          <strong>B</strong>
        </button>
        <button
          aria-label="Italic"
          aria-pressed={toolbarState?.italic ?? false}
          className={classNames.toolbarButton}
          disabled={toolbarDisabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          type="button"
        >
          <em>I</em>
        </button>
        <button
          aria-label="Heading level 2"
          aria-pressed={toolbarState?.heading ?? false}
          className={classNames.toolbarButton}
          disabled={toolbarDisabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          type="button"
        >
          H2
        </button>
        <button
          aria-label="Bullet list"
          aria-pressed={toolbarState?.bulletList ?? false}
          className={classNames.toolbarButton}
          disabled={toolbarDisabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          type="button"
        >
          • List
        </button>
        <button
          aria-label="Ordered list"
          aria-pressed={toolbarState?.orderedList ?? false}
          className={classNames.toolbarButton}
          disabled={toolbarDisabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          type="button"
        >
          1. List
        </button>
        <button
          aria-label="Set or remove link"
          aria-pressed={toolbarState?.link ?? false}
          className={classNames.toolbarButton}
          disabled={toolbarDisabled}
          onClick={setLink}
          type="button"
        >
          Link
        </button>
        <button
          aria-label="Undo"
          className={classNames.toolbarButton}
          disabled={toolbarDisabled || !toolbarState?.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
          type="button"
        >
          Undo
        </button>
        <button
          aria-label="Redo"
          className={classNames.toolbarButton}
          disabled={toolbarDisabled || !toolbarState?.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
          type="button"
        >
          Redo
        </button>
      </div>

      <div className={classNames.editorContent}>
        {editor ? <EditorContent editor={editor} /> : <p className={classNames.loading}>Loading editor…</p>}
      </div>
      <input disabled={overLimit} name={name} type="hidden" value={markdown} />
      <p
        className={`${classNames.counter} ${overLimit ? classNames.counterOverLimit : ""}`}
        role={overLimit ? "alert" : undefined}
      >
        {markdown.length} / {maxLength} characters
      </p>

      <section aria-labelledby={previewId} aria-live="polite" className={classNames.preview}>
        <h3 id={previewId}>Plain-text version</h3>
        <p>{plainText || "Nothing here yet."}</p>
      </section>
    </div>
  );
}
