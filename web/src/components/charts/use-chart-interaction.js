"use client";;
import { localPoint } from "@visx/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { useScheduledTooltip } from "./use-scheduled-tooltip";
import { normalizeYAxisId } from "./y-axis-scales";

export function useChartInteraction(
  {
    xScale,
    yScale,
    yScales,
    data,
    lines,
    margin,
    xAccessor,
    bisectDate,
    canInteract
  }
) {
  const [selection, setSelection] = useState(null);
  const {
    tooltipData,
    setTooltipData,
    scheduleTooltip,
    clearTooltip,
    resetTooltipDedupe,
  } = useScheduledTooltip();

  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const lastHoveredXRef = useRef(null);
  // Tap gesture state (touch): a short, still single-finger touch PINS the
  // tooltip on screen (hover is unavailable on phones — finger-lift would
  // otherwise erase the data instantly). Any drag or long press clears it.
  const tapRef = useRef(null);
  // Browsers replay a compat `mousedown` shortly after every completed tap
  // (React attaches touch listeners passively so preventDefault cannot stop
  // it). Without this guard that phantom mousedown clears the pinned tooltip
  // milliseconds after the finger lifts — the tap pin would never be visible.
  const lastTouchEndRef = useRef(0);

  const resolveTooltipFromX = useCallback(pixelX => {
    const x0 = xScale.invert(pixelX);
    const index = bisectDate(data, x0, 1);
    const d0 = data[index - 1];
    const d1 = data[index];

    if (!d0) {
      return null;
    }

    let d = d0;
    let finalIndex = index - 1;
    if (d1) {
      const d0Time = xAccessor(d0).getTime();
      const d1Time = xAccessor(d1).getTime();
      if (x0.getTime() - d0Time > d1Time - x0.getTime()) {
        d = d1;
        finalIndex = index;
      }
    }

    const yPositions = {};
    for (const line of lines) {
      const value = d[line.dataKey];
      if (typeof value === "number") {
        const axisScale = yScales[normalizeYAxisId(line.yAxisId)] ?? yScale;
        yPositions[line.dataKey] = axisScale(value) ?? 0;
      }
    }

    return {
      point: d,
      index: finalIndex,
      x: xScale(xAccessor(d)) ?? 0,
      yPositions,
    };
  }, [xScale, yScale, yScales, data, lines, xAccessor, bisectDate]);

  const resolveIndexFromX = useCallback(pixelX => {
    const x0 = xScale.invert(pixelX);
    const index = bisectDate(data, x0, 1);
    const d0 = data[index - 1];
    const d1 = data[index];
    if (!d0) {
      return 0;
    }
    if (d1) {
      const d0Time = xAccessor(d0).getTime();
      const d1Time = xAccessor(d1).getTime();
      if (x0.getTime() - d0Time > d1Time - x0.getTime()) {
        return index;
      }
    }
    return index - 1;
  }, [xScale, data, xAccessor, bisectDate]);

  const getChartX = useCallback((event, touchIndex = 0) => {
    let point = null;

    if ("touches" in event) {
      const touch = event.touches[touchIndex];
      if (!touch) {
        return null;
      }
      const svg = event.currentTarget.ownerSVGElement;
      if (!svg) {
        return null;
      }
      point = localPoint(svg, touch);
    } else {
      point = localPoint(event);
    }

    if (!point) {
      return null;
    }
    return point.x - margin.left;
  }, [margin.left]);

  const handleMouseMove = useCallback((event) => {
    const chartX = getChartX(event);
    if (chartX === null) {
      return;
    }

    if (isDraggingRef.current) {
      const startX = Math.min(dragStartXRef.current, chartX);
      const endX = Math.max(dragStartXRef.current, chartX);
      setSelection({
        startX,
        endX,
        startIndex: resolveIndexFromX(startX),
        endIndex: resolveIndexFromX(endX),
        active: true,
      });
      return;
    }

    lastHoveredXRef.current = chartX;
    const tooltip = resolveTooltipFromX(chartX);
    if (tooltip) {
      scheduleTooltip(tooltip);
    }
  }, [getChartX, resolveTooltipFromX, resolveIndexFromX, scheduleTooltip]);

  const handleMouseLeave = useCallback(() => {
    // Browsers synthesize a compat mouseleave shortly after a tap on a chart
    // (pinch of "pointerleave" events in Chromium). Without this guard the
    // phantom leave clears the pinned tooltip ~200ms after mount.
    if (Date.now() - lastTouchEndRef.current < 600) {
      return;
    }
    lastHoveredXRef.current = null;
    clearTooltip();
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    }
    setSelection(null);
  }, [clearTooltip]);

  const handleMouseDown = useCallback((event) => {
    // Ignore the compat mousedown the browser synthesizes ~100ms after a
    // touch tap (it would wipe the pinned tooltip / open a bogus brush).
    if (Date.now() - lastTouchEndRef.current < 600) {
      return;
    }
    const chartX = getChartX(event);
    if (chartX === null) {
      return;
    }
    isDraggingRef.current = true;
    dragStartXRef.current = chartX;
    clearTooltip();
    setSelection(null);
  }, [getChartX, clearTooltip]);

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    }
    setSelection(null);
  }, []);

  const handleTouchStart = useCallback((event) => {
    if (event.touches.length === 1) {
      event.preventDefault();
      const chartX = getChartX(event, 0);
      if (chartX === null) {
        return;
      }
      tapRef.current = { startTime: Date.now(), startX: chartX, moved: false };
      lastHoveredXRef.current = chartX;
      const tooltip = resolveTooltipFromX(chartX);
      if (tooltip) {
        scheduleTooltip(tooltip);
      }
    } else if (event.touches.length === 2) {
      event.preventDefault();
      resetTooltipDedupe();
      clearTooltip();
      const x0 = getChartX(event, 0);
      const x1 = getChartX(event, 1);
      if (x0 === null || x1 === null) {
        return;
      }
      const startX = Math.min(x0, x1);
      const endX = Math.max(x0, x1);
      setSelection({
        startX,
        endX,
        startIndex: resolveIndexFromX(startX),
        endIndex: resolveIndexFromX(endX),
        active: true,
      });
    }
  }, [
    getChartX,
    resolveTooltipFromX,
    resolveIndexFromX,
    scheduleTooltip,
    resetTooltipDedupe,
    clearTooltip,
  ]);

  const handleTouchMove = useCallback((event) => {
    if (event.touches.length === 1) {
      event.preventDefault();
      const chartX = getChartX(event, 0);
      if (chartX === null) {
        return;
      }
      if (
        tapRef.current &&
        Math.abs(chartX - tapRef.current.startX) > 12
      ) {
        tapRef.current.moved = true;
      }
      lastHoveredXRef.current = chartX;
      const tooltip = resolveTooltipFromX(chartX);
      if (tooltip) {
        scheduleTooltip(tooltip);
      }
    } else if (event.touches.length === 2) {
      event.preventDefault();
      const x0 = getChartX(event, 0);
      const x1 = getChartX(event, 1);
      if (x0 === null || x1 === null) {
        return;
      }
      const startX = Math.min(x0, x1);
      const endX = Math.max(x0, x1);
      setSelection({
        startX,
        endX,
        startIndex: resolveIndexFromX(startX),
        endIndex: resolveIndexFromX(endX),
        active: true,
      });
    }
  }, [getChartX, resolveTooltipFromX, resolveIndexFromX, scheduleTooltip]);

  const handleTouchEnd = useCallback(() => {
    lastTouchEndRef.current = Date.now();
    const tap = tapRef.current;
    tapRef.current = null;
    // A short, still single-finger tap PINS the tooltip so a phone user can
    // read it after lifting their finger; a swipe or long press clears it.
    if (tap && !tap.moved && Date.now() - tap.startTime < 550) {
      return;
    }
    clearTooltip();
    setSelection(null);
  }, [clearTooltip]);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  // Re-anchor tooltip/crosshair when x-scale or visible data changes (e.g. brush zoom commit).
  useEffect(() => {
    if (!canInteract || lastHoveredXRef.current === null) {
      return;
    }
    const tooltip = resolveTooltipFromX(lastHoveredXRef.current);
    if (tooltip) {
      scheduleTooltip(tooltip, `${tooltip.index}:${Math.round(tooltip.x)}`);
      return;
    }
    clearTooltip();
  }, [canInteract, clearTooltip, resolveTooltipFromX, scheduleTooltip]);

  const interactionHandlers = canInteract
    ? {
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
        onMouseDown: handleMouseDown,
        onMouseUp: handleMouseUp,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onTouchCancel: handleTouchEnd,
      }
    : {};

  const interactionStyle = {
    cursor: canInteract ? "crosshair" : "default",
    // pan-y keeps vertical page scrolling alive when a finger starts on the
    // chart (touch-action: none was previously trapping whole-page scrolls).
    touchAction: "pan-y",
  };

  return {
    tooltipData,
    setTooltipData,
    selection,
    clearSelection,
    interactionHandlers,
    interactionStyle,
  };
}
