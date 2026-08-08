import { memo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { StoryboardBlocking2D, StoryboardBlockingBox2D } from "../../../lib/project";
import { normalizeStoryboardBlocking2D } from "../../../lib/storyboard-blocking-2d";
import { cn } from "../../../lib/utils";

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 562.5;

interface StoryboardBlocking2DPreviewProps {
  layout: StoryboardBlocking2D;
  editable?: boolean;
  className?: string;
  onLayoutChange?: (layout: StoryboardBlocking2D) => void;
}

interface DragState {
  pointerId: number;
  boxId: string;
  startX: number;
  startY: number;
  startBoxX: number;
  startBoxY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function renderShape(
  box: StoryboardBlockingBox2D,
  width: number,
  height: number,
  selected: boolean,
): ReactNode {
  const stroke = selected ? "#ffffff" : "#0f172a";
  const strokeWidth = selected ? 3 : 2;
  const fillOpacity = box.depth === "foreground" ? 0.32 : box.depth === "midground" ? 0.24 : 0.18;

  if (box.shape === "person") {
    const cx = width / 2;
    const headR = Math.max(width, height) * 0.11;
    const headCy = Math.max(headR + 2, height * 0.2);
    const bodyTop = headCy + headR + 4;
    const bodyBottom = height * 0.7;
    const armY = bodyTop + (bodyBottom - bodyTop) * 0.35;
    const legY = height - 4;
    const shoulder = width * 0.24;
    const legSpread = width * 0.18;
    return (
      <g>
        <circle cx={cx} cy={headCy} r={headR} fill={box.color} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />
        <line x1={cx} y1={bodyTop} x2={cx} y2={bodyBottom} stroke={stroke} strokeWidth={strokeWidth} />
        <line x1={cx - shoulder} y1={armY} x2={cx + shoulder} y2={armY} stroke={stroke} strokeWidth={strokeWidth} />
        <line x1={cx} y1={bodyBottom} x2={cx - legSpread} y2={legY} stroke={stroke} strokeWidth={strokeWidth} />
        <line x1={cx} y1={bodyBottom} x2={cx + legSpread} y2={legY} stroke={stroke} strokeWidth={strokeWidth} />
      </g>
    );
  }

  if (box.shape === "table") {
    const topH = Math.max(8, height * 0.24);
    const legInset = width * 0.2;
    return (
      <g>
        <rect x={0} y={height * 0.18} width={width} height={topH} rx={4} fill={box.color} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />
        <line x1={legInset} y1={height * 0.18 + topH} x2={legInset} y2={height - 4} stroke={stroke} strokeWidth={strokeWidth} />
        <line x1={width - legInset} y1={height * 0.18 + topH} x2={width - legInset} y2={height - 4} stroke={stroke} strokeWidth={strokeWidth} />
      </g>
    );
  }

  if (box.shape === "door") {
    return (
      <g>
        <rect x={width * 0.18} y={height * 0.06} width={width * 0.64} height={height * 0.88} rx={10} fill={box.color} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />
        <circle cx={width * 0.7} cy={height * 0.54} r={Math.max(3, width * 0.03)} fill={stroke} />
      </g>
    );
  }

  if (box.shape === "window") {
    return (
      <g>
        <rect x={width * 0.12} y={height * 0.12} width={width * 0.76} height={height * 0.76} fill={box.color} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />
        <line x1={width * 0.5} y1={height * 0.12} x2={width * 0.5} y2={height * 0.88} stroke={stroke} strokeWidth={strokeWidth} />
        <line x1={width * 0.12} y1={height * 0.5} x2={width * 0.88} y2={height * 0.5} stroke={stroke} strokeWidth={strokeWidth} />
      </g>
    );
  }

  if (box.shape === "vehicle") {
    return (
      <g>
        <rect x={width * 0.12} y={height * 0.42} width={width * 0.76} height={height * 0.34} rx={8} fill={box.color} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />
        <path d={`M ${width * 0.25} ${height * 0.42} L ${width * 0.42} ${height * 0.22} L ${width * 0.68} ${height * 0.22} L ${width * 0.8} ${height * 0.42} Z`} fill={box.color} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />
        <circle cx={width * 0.3} cy={height * 0.8} r={Math.max(6, width * 0.08)} fill="#111827" stroke={stroke} strokeWidth={strokeWidth} />
        <circle cx={width * 0.7} cy={height * 0.8} r={Math.max(6, width * 0.08)} fill="#111827" stroke={stroke} strokeWidth={strokeWidth} />
      </g>
    );
  }

  if (box.shape === "prop") {
    return (
      <g>
        <ellipse
          cx={width * 0.5}
          cy={height * 0.54}
          rx={width * 0.34}
          ry={height * 0.3}
          fill={box.color}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </g>
    );
  }

  return (
    <rect
      x={0}
      y={0}
      width={width}
      height={height}
      fill={box.color}
      fillOpacity={fillOpacity}
      stroke={stroke}
      strokeWidth={strokeWidth}
      rx={8}
    />
  );
}

export const StoryboardBlocking2DPreview = memo(function StoryboardBlocking2DPreview({
  layout,
  editable = false,
  className,
  onLayoutChange,
}: StoryboardBlocking2DPreviewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(layout.boxes[0]?.id ?? null);

  function startDrag(
    event: ReactPointerEvent<SVGElement>,
    boxId: string,
    boxX: number,
    boxY: number,
  ): void {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedBoxId(boxId);
    setDragState({
      pointerId: event.pointerId,
      boxId,
      startX: event.clientX,
      startY: event.clientY,
      startBoxX: boxX,
      startBoxY: boxY,
    });
  }

  function handleMove(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!editable || !dragState || event.pointerId !== dragState.pointerId) return;
    const svg = svgRef.current;
    if (!svg || !onLayoutChange) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaX = (event.clientX - dragState.startX) / rect.width;
    const deltaY = (event.clientY - dragState.startY) / rect.height;

    const next = normalizeStoryboardBlocking2D({
      ...layout,
      boxes: layout.boxes.map((box) =>
        box.id === dragState.boxId
          ? {
              ...box,
              x: clamp(dragState.startBoxX + deltaX, box.width / 2, 1 - box.width / 2),
              y: clamp(dragState.startBoxY + deltaY, box.height / 2, 1 - box.height / 2),
            }
          : box,
      ),
    });
    onLayoutChange(next);
  }

  function endDrag(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    setDragState(null);
  }

  return (
    <div className={cn("h-full w-full", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}`}
        className="h-full w-full touch-none select-none"
        onPointerMove={handleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <rect
          x={0}
          y={0}
          width={VIEWPORT_WIDTH}
          height={VIEWPORT_HEIGHT}
          fill={layout.backgroundColor}
        />
        <line
          x1={VIEWPORT_WIDTH / 3}
          y1={0}
          x2={VIEWPORT_WIDTH / 3}
          y2={VIEWPORT_HEIGHT}
          stroke="#ffffff"
          strokeOpacity={0.08}
        />
        <line
          x1={(VIEWPORT_WIDTH * 2) / 3}
          y1={0}
          x2={(VIEWPORT_WIDTH * 2) / 3}
          y2={VIEWPORT_HEIGHT}
          stroke="#ffffff"
          strokeOpacity={0.08}
        />
        {layout.boxes.map((box) => {
          const width = box.width * VIEWPORT_WIDTH;
          const height = box.height * VIEWPORT_HEIGHT;
          const x = box.x * VIEWPORT_WIDTH - width / 2;
          const y = box.y * VIEWPORT_HEIGHT - height / 2;
          const isSelected = box.id === selectedBoxId;
          return (
            <g
              key={box.id}
              transform={`translate(${x} ${y})`}
              onPointerDown={(event) => startDrag(event, box.id, box.x, box.y)}
            >
              {renderShape(box, width, height, isSelected)}
              <rect x={0} y={0} width={width} height={height} fill="#000000" fillOpacity={0} />
              <text
                x={10}
                y={22}
                fill="#ffffff"
                fontSize={16}
                fontWeight={700}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {box.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});
