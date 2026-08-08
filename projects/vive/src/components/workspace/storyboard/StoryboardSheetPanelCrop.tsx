import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  aspectRatioToNumber,
  computeStoryboardPanelCrop,
  estimateStoryboardSheetNaturalSize,
  resolvePanelGridPosition,
} from "../../../lib/storyboard-sheet-layout";
import { cn } from "../../../lib/utils";

interface StoryboardSheetPanelCropProps {
  imageSrc: string;
  panelIndex: number;
  panelCount: number;
  alt: string;
  className?: string;
  panelAspectRatio?: string;
}

function readLoadedNaturalSize(
  img: HTMLImageElement | null,
): { width: number; height: number } | null {
  if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
    return null;
  }

  return { width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * Displays one panel from a multi-panel storyboard contact sheet using CSS
 * positioning (no canvas slicing). Scales the sheet uniformly so the full
 * panel fits inside the viewport, with background masks hiding adjacent panels.
 */
export function StoryboardSheetPanelCrop({
  imageSrc,
  panelIndex,
  panelCount,
  alt,
  className,
  panelAspectRatio = "16:9",
}: StoryboardSheetPanelCropProps) {
  const viewportAspect = aspectRatioToNumber(panelAspectRatio);
  const { col, row, cols, rows } = resolvePanelGridPosition(
    panelIndex,
    panelCount,
  );
  const estimatedSize = useMemo(
    () => estimateStoryboardSheetNaturalSize(panelCount, panelAspectRatio),
    [panelCount, panelAspectRatio],
  );
  const [naturalSize, setNaturalSize] = useState(estimatedSize);
  const imgRef = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    setNaturalSize(readLoadedNaturalSize(imgRef.current) ?? estimatedSize);
  }, [imageSrc, estimatedSize]);

  const cropLayout = useMemo(
    () =>
      computeStoryboardPanelCrop({
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height,
        col,
        row,
        cols,
        rows,
        viewportAspect,
      }),
    [col, cols, naturalSize.height, naturalSize.width, row, rows, viewportAspect],
  );

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <img
        ref={imgRef}
        key={imageSrc}
        src={imageSrc}
        alt={alt}
        draggable={false}
        className="absolute z-0 max-w-none select-none"
        style={cropLayout.image}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) {
            setNaturalSize({ width: naturalWidth, height: naturalHeight });
          }
        }}
      />
      {cropLayout.masks.map((mask, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="pointer-events-none absolute z-10 bg-black"
          style={mask}
        />
      ))}
    </div>
  );
}
