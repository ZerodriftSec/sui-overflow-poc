import { useCallback, useEffect, useState } from "react";

interface UsePanelResizeOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  edge: "left" | "right";
}

export function usePanelResize({
  initialWidth,
  minWidth,
  maxWidth,
  edge,
}: UsePanelResizeOptions) {
  const [width, setWidth] = useState(initialWidth);
  const [resizing, setResizing] = useState(false);

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = width;
      setResizing(true);

      function handleMouseMove(moveEvent: MouseEvent) {
        const delta = moveEvent.clientX - startX;
        const nextWidth =
          edge === "left" ? startWidth - delta : startWidth + delta;
        setWidth(Math.min(maxWidth, Math.max(minWidth, nextWidth)));
      }

      function handleMouseUp() {
        setResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [edge, maxWidth, minWidth, width],
  );

  useEffect(() => {
    if (!resizing) return;
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizing]);

  return { width, resizing, startResize };
}
