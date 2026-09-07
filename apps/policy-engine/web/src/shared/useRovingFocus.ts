/** Implements keyboard roving focus for composite controls without changing native tab order. */
import { useRef, type KeyboardEvent, type RefObject } from "react";

/** Implements expected arrow, Home, and End navigation for composite widget controls. */
export function useRovingFocus<T extends string>(props: {
  readonly active: T;
  readonly items: readonly T[];
  readonly onChange: (item: T) => void;
  readonly orientation?: "horizontal" | "vertical";
}): {
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly getItemProps: (item: T) => { readonly tabIndex: 0 | -1; readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void };
} {
  const containerRef = useRef<HTMLElement>(null);
  const orientation = props.orientation ?? "horizontal";

  function focus(item: T): void {
    props.onChange(item);
    Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-roving-value]") ?? [])
      .find((element) => element.dataset.rovingValue === item)?.focus();
  }

  function getItemProps(item: T): { readonly tabIndex: 0 | -1; readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void } {
    return {
      tabIndex: props.active === item ? 0 : -1,
      onKeyDown(event) {
        const currentIndex = props.items.indexOf(item);
        const previousKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
        const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
        let nextIndex: number | undefined;
        if (event.key === previousKey) nextIndex = (currentIndex - 1 + props.items.length) % props.items.length;
        if (event.key === nextKey) nextIndex = (currentIndex + 1) % props.items.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = props.items.length - 1;
        if (nextIndex !== undefined) {
          event.preventDefault();
          const nextItem = props.items[nextIndex];
          if (nextItem !== undefined) focus(nextItem);
        }
      },
    };
  }

  return { containerRef, getItemProps };
}
