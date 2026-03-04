import { useRef, useState, useLayoutEffect } from "react";

export function useDialogContainer() {
  const ref = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (ref.current) {
      const dialog = ref.current.closest('[role="dialog"]');
      if (dialog instanceof HTMLElement) {
        setContainer(dialog);
      }
    }
  });

  return { ref, container };
}
