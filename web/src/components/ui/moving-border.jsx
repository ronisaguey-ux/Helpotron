// Aceternity UI — Moving Border / MovingBorderButton (08-28 integration)
// Ported from ui.aceternity.com registry (moving-border). Exported as both
// `MovingBorderButton` (JSX-friendly) and `MovingBorder`.
import React from "react";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from "motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

export function MovingBorderButton({
  borderRadius = "1.75rem",
  children,
  as: Component = "button",
  containerClassName,
  borderClassName,
  duration,
  className,
  ...otherProps
}) {
  return (
    <Component
      className={cn(
        "relative h-16 w-40 overflow-hidden bg-transparent p-[1px] text-xl",
        containerClassName,
      )}
      style={{
        borderRadius: borderRadius,
      }}
      {...otherProps}
    >
      <div
        className="absolute inset-0"
        style={{ borderRadius: `calc(${borderRadius} * 0.96)` }}
      >
        <MovingBorder duration={duration} rx="30%" ry="30%">
          <div
            className={cn(
              // Aceternity registry uses an elongated glow track (h-20 w-80);
              // the square w-20 original renders as a hard-clipped blob on the
              // short mobile button (border hump), so keep the registry track.
              "h-20 w-80 bg-[radial-gradient(#0ea5e9_50%,transparent_60%)] opacity-[0.8]",
              borderClassName,
            )}
          />
        </MovingBorder>
      </div>

      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center border border-slate-800 bg-slate-900/[0.8] text-sm text-white antialiased backdrop-blur-xl",
          className,
        )}
        style={{
          borderRadius: `calc(${borderRadius} * 0.96)`,
        }}
      >
        {children}
      </div>
    </Component>
  );
}

export const MovingBorder = ({
  children,
  duration = 3000,
  rx,
  ry,
  ...otherProps
}) => {
  const pathRef = useRef();
  // Mobile perf (08-28): SVGPathElement.getTotalLength() walks the path
  // geometry — calling it on every animation frame is measurable jank on
  // low-end phones. The rect path never changes, so cache the length once
  // the path is laid out and reuse it.
  const lengthRef = useRef(0);
  const progress = useMotionValue(0);

  useAnimationFrame((time) => {
    if (!lengthRef.current) {
      const length = pathRef.current?.getTotalLength?.();
      if (length) {
        lengthRef.current = length;
      } else {
        return; // path not measured yet — retry next frame
      }
    }
    const pxPerMillisecond = lengthRef.current / duration;
    progress.set((time * pxPerMillisecond) % lengthRef.current);
  });

  const x = useTransform(
    progress,
    (val) => pathRef.current?.getPointAtLength(val).x,
  );
  const y = useTransform(
    progress,
    (val) => pathRef.current?.getPointAtLength(val).y,
  );

  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="absolute h-full w-full"
        width="100%"
        height="100%"
        {...otherProps}
      >
        <rect
          fill="none"
          width="100%"
          height="100%"
          rx={rx}
          ry={ry}
          ref={pathRef}
        />
      </svg>
      <motion.div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "inline-block",
          transform,
        }}
      >
        {children}
      </motion.div>
    </>
  );
};
