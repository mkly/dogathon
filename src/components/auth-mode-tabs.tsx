import type { ComponentType } from "react";

import type { FeltButtonProps } from "./felt";

export type AuthMode = "sign-in" | "sign-up";

type AuthModeTabsProps = {
  button: ComponentType<FeltButtonProps>;
  className?: string;
  mode: AuthMode;
  onSelect: (mode: AuthMode) => void;
};

export function AuthModeTabs({ button: Button, className, mode, onSelect }: AuthModeTabsProps) {
  return (
    <div aria-label="Authentication mode" className={className} role="group">
      {(["sign-in", "sign-up"] as const).map((option) => {
        const selected = mode === option;
        const label = option === "sign-in" ? "Sign in" : "Sign up";

        return (
          <Button
            aria-pressed={selected}
            key={option}
            onClick={() => onSelect(option)}
            tone={selected ? "mustard" : "denim-lt"}
          >
            <span>{label}</span>
            {selected ? <span>Current mode</span> : null}
          </Button>
        );
      })}
    </div>
  );
}
