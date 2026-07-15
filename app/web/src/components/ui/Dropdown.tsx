import { useEffect, useRef, useState, type ReactNode } from "react";

export interface DropdownItem {
  disabled?: boolean;
  label: string;
  onSelect: () => void;
}

interface DropdownProps {
  items: DropdownItem[];
  label: ReactNode;
}

export function Dropdown({ items, label }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  function move(delta: number) {
    const enabled = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex(({ index }) => index === activeIndex);
    const next = enabled[(current + delta + enabled.length) % enabled.length];
    setActiveIndex(next.index);
  }

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  const firstEnabledIndex = Math.max(
    0,
    items.findIndex((item) => !item.disabled),
  );

  return (
    <div className="ui-dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setActiveIndex(firstEnabledIndex);
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex(firstEnabledIndex);
            setOpen(true);
          }
        }}
      >
        {label} <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div className="ui-dropdown-menu" role="menu">
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              className="ui-dropdown-item"
              disabled={item.disabled}
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => {
                item.onSelect();
                close();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  close();
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  move(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  move(-1);
                } else if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  item.onSelect();
                  close();
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
