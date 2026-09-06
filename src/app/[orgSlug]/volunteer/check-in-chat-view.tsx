"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useRef, useState } from "react";

export type CheckInResident = {
  id: string;
  name: string;
  photoUrls: string[];
};

type CheckInChatViewProps = {
  classNames: {
    chatFrame: string;
    companionChip: string;
    companionPicker: string;
  };
  emptyState: ReactNode;
  renderPhoto: (resident: CheckInResident) => ReactNode;
  renderSession: (resident: CheckInResident) => ReactNode;
  residents: CheckInResident[];
};

export function CheckInChatView({
  classNames,
  emptyState,
  renderPhoto,
  renderSession,
  residents,
}: CheckInChatViewProps) {
  const [residentId, setResidentId] = useState(residents[0]?.id ?? "");
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = residents.findIndex((resident) => resident.id === residentId);

  if (residents.length === 0) return emptyState;

  const activeIndex = selectedIndex === -1 ? 0 : selectedIndex;
  const selectedResident = residents[activeIndex];

  function selectAndFocus(index: number) {
    setResidentId(residents[index].id);
    chipRefs.current[index]?.focus();
  }

  function handlePickerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let nextIndex: number | undefined;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (activeIndex - 1 + residents.length) % residents.length;
        break;
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (activeIndex + 1) % residents.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = residents.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectAndFocus(nextIndex);
  }

  return (
    <div className={classNames.chatFrame}>
      <div aria-label="Choose a companion" className={classNames.companionPicker} role="radiogroup">
        {residents.map((resident, index) => {
          const selected = index === activeIndex;
          return (
            <button
              aria-checked={selected}
              className={classNames.companionChip}
              key={resident.id}
              onClick={() => setResidentId(resident.id)}
              onKeyDown={handlePickerKeyDown}
              ref={(element) => {
                chipRefs.current[index] = element;
              }}
              role="radio"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {renderPhoto(resident)}
              <span>{resident.name}</span>
            </button>
          );
        })}
      </div>

      {renderSession(selectedResident)}
    </div>
  );
}
