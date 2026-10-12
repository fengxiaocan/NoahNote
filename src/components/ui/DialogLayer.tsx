import { useEffect, useRef, type ReactNode } from "react";

interface DialogLayerProps {
  children: ReactNode;
  onClose: () => void;
  className?: string;
  closeOnBackdrop?: boolean;
  focusKey?: unknown;
}

const focusableSelector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])";
const dialogStack: Array<{ id: symbol; element: HTMLDivElement }> = [];
let originalBodyOverflow: string | null = null;

export function DialogLayer({ children, onClose, className = "", closeOnBackdrop = true, focusKey }: DialogLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const layerId = Symbol("dialog-layer");
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialogStack.length === 0) originalBodyOverflow = document.body.style.overflow;
    dialogStack.push({ id: layerId, element: layer });
    document.body.style.overflow = "hidden";

    const focusable = () => Array.from(layer.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.getClientRects().length > 0);
    const focusTarget = layer.querySelector<HTMLElement>("[autofocus]") ?? focusable()[0];
    focusTarget?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1]?.id !== layerId) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const candidates = focusable();
      if (!candidates.length) {
        event.preventDefault();
        return;
      }
      const first = candidates[0];
      const last = candidates[candidates.length - 1];
      if (!layer.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      const stackIndex = dialogStack.findIndex(({ id }) => id === layerId);
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1);
      if (dialogStack.length === 0) {
        document.body.style.overflow = originalBodyOverflow ?? "";
        originalBodyOverflow = null;
      }
      const nextLayer = dialogStack[dialogStack.length - 1]?.element;
      if (previousFocus?.isConnected && (!nextLayer || nextLayer.contains(previousFocus))) previousFocus.focus();
    };
  }, [focusKey]);

  return <div ref={layerRef} className={["modal-backdrop", className].filter(Boolean).join(" ")} role="presentation" onMouseDown={(event) => {
    if (closeOnBackdrop && event.target === event.currentTarget) onCloseRef.current();
  }}>{children}</div>;
}
