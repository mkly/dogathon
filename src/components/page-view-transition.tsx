import { type ReactNode, ViewTransition } from "react";

export function PageViewTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      default="none"
      enter={{
        "nav-back": "nav-back",
        "nav-forward": "nav-forward",
        default: "content-reveal",
      }}
      exit={{
        "nav-back": "nav-back",
        "nav-forward": "nav-forward",
        default: "none",
      }}
    >
      {children}
    </ViewTransition>
  );
}

export function SuspenseReveal({ children }: { children: ReactNode }) {
  return (
    <ViewTransition default="none" enter="content-reveal">
      {children}
    </ViewTransition>
  );
}

export function SuspenseFallback({ children }: { children: ReactNode }) {
  return (
    <ViewTransition default="none" exit="content-fallback">
      {children}
    </ViewTransition>
  );
}
