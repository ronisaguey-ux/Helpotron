"use client";;
/**
 * @author: @dorianbaffier
 * @description: Liquid Glass Card - Optimized with Shadcn UI
 * @version: 2.0.0
 * @date: 2025-10-11
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { cva } from "class-variance-authority";
import {
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  Pause,
  Play,
} from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Constants for better maintainability
const GLASS_SHADOW_LIGHT =
  "shadow-[0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3px_rgba(0,0,0,0.9),inset_-3px_-3px_0.5px_-3px_rgba(0,0,0,0.85),inset_1px_1px_1px_-0.5px_rgba(0,0,0,0.6),inset_-1px_-1px_1px_-0.5px_rgba(0,0,0,0.6),inset_0_0_6px_6px_rgba(0,0,0,0.12),inset_0_0_2px_2px_rgba(0,0,0,0.06),0_0_12px_rgba(255,255,255,0.15)]";

const GLASS_SHADOW_DARK =
  "dark:shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.15)]";

const GLASS_SHADOW = `${GLASS_SHADOW_LIGHT} ${GLASS_SHADOW_DARK}`;

const DEFAULT_GLASS_FILTER_SCALE = 30;
const BUTTON_GLASS_FILTER_SCALE = 70;

const GlassFilter = React.memo(({
  id,
  scale = DEFAULT_GLASS_FILTER_SCALE
}) => (
  <svg aria-hidden="true" className="hidden" focusable={false}>
    <title>Glass Effect Filter</title>
    <defs>
      <filter
        colorInterpolationFilters="sRGB"
        height="200%"
        id={id}
        width="200%"
        x="-50%"
        y="-50%">
        <feTurbulence
          baseFrequency="0.05 0.05"
          numOctaves="1"
          result="turbulence"
          seed="1"
          type="fractalNoise" />
        <feGaussianBlur in="turbulence" result="blurredNoise" stdDeviation="2" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="blurredNoise"
          result="displaced"
          scale={scale}
          xChannelSelector="R"
          yChannelSelector="B" />
        <feGaussianBlur in="displaced" result="finalBlur" stdDeviation="4" />
        <feComposite in="finalBlur" in2="finalBlur" operator="over" />
      </filter>
    </defs>
  </svg>
));
GlassFilter.displayName = "GlassFilter";

// Liquid Button - extends shadcn Button with glass effect
const liquidButtonVariants = cva(
  "relative transition-transform duration-200 motion-reduce:transition-none",
  {
    variants: {
      liquidVariant: {
        default:
          "active:scale-[0.97] motion-reduce:active:scale-100 motion-reduce:hover:scale-100 [@media(hover:hover)]:hover:scale-105",
        none: "",
      },
    },
    defaultVariants: {
      liquidVariant: "default",
    },
  }
);

function LiquidButton({
  className,
  liquidVariant = "default",
  children,
  ...props
}) {
  const filterId = React.useId();

  return (
    <>
      <Button
        className={cn(liquidButtonVariants({ liquidVariant }), className)}
        {...props}>
        <div
          className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", GLASS_SHADOW)} />
        <div
          className="pointer-events-none absolute inset-0 isolate -z-10 overflow-hidden rounded-[inherit]"
          style={{ backdropFilter: `url("#${filterId}")` }} />
        <span className="relative z-10">{children}</span>
      </Button>
      <GlassFilter id={filterId} scale={BUTTON_GLASS_FILTER_SCALE} />
    </>
  );
}

// Liquid Glass Card - extends shadcn Card with glass effect
const liquidGlassCardVariants = cva("group relative overflow-hidden bg-background/20 backdrop-blur-[2px]", {
  variants: {
    glassSize: {
      sm: "p-4",
      default: "p-6",
      lg: "p-8",
    },
  },
  defaultVariants: {
    glassSize: "default",
  },
});

function LiquidGlassCard({
  className,
  glassSize,
  glassEffect = true,
  children,
  ...props
}) {
  const filterId = React.useId();

  return (
    <Card
      className={cn(liquidGlassCardVariants({ glassSize }), className)}
      {...props}>
      <div
        className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", GLASS_SHADOW)} />

      {glassEffect && (
        <>
          <div
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
            style={{ backdropFilter: `url("#${filterId}")` }} />
          <GlassFilter id={filterId} scale={DEFAULT_GLASS_FILTER_SCALE} />
        </>
      )}

      <div className="relative z-10">{children}</div>

      <div
        className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-gradient-to-r from-transparent via-black/5 to-transparent opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 motion-reduce:transition-none dark:via-white/5" />
    </Card>
  );
}

// Demo: Music Player Card
const TOTAL_DURATION = 45;
const VOLUME_BAR_COUNT = 8;
const SEEK_JUMP_SECONDS = 5;
const TIMER_INTERVAL_MS = 1000;
const STATIC_BAR_HEIGHT = "6px";
const MIN_TIME = 0;
const BAR_DELAY_INCREMENT = 0.1;
const PROGRESS_PERCENTAGE_MULTIPLIER = 100;

const formatTime = timeInSeconds => {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const VolumeBars = React.memo(({
  isPlaying
}) => {
  const bars = Array.from({ length: VOLUME_BAR_COUNT }, (_, i) => ({
    id: `bar-${i}`,
    delay: i * BAR_DELAY_INCREMENT,
  }));

  return (
    <div className="pointer-events-none flex h-8 w-10 items-end gap-0.5">
      {bars.map((bar) => (
        <div
          className={cn(
            "w-[3px] rounded-sm",
            isPlaying && "animate-bounce-music motion-reduce:animate-none"
          )}
          key={bar.id}
          style={{
            height: isPlaying ? undefined : STATIC_BAR_HEIGHT,
            animationDelay: `${bar.delay}s`,
            background: "linear-gradient(to top, #FF2E55, #FF6B88)",
          }} />
      ))}
    </div>
  );
});
VolumeBars.displayName = "VolumeBars";

const ProgressBar = React.memo(({
  currentTime,
  totalDuration,
  onSeek
}) => {
  const progress =
    (currentTime / totalDuration) * PROGRESS_PERCENTAGE_MULTIPLIER;

  const handleClick = (e) => {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const newTime = Math.min(Math.max(MIN_TIME, percent * totalDuration), totalDuration);
    onSeek(newTime);
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        onSeek(Math.min(currentTime + SEEK_JUMP_SECONDS, totalDuration));
        break;
      case "ArrowLeft":
        e.preventDefault();
        onSeek(Math.max(currentTime - SEEK_JUMP_SECONDS, MIN_TIME));
        break;
      case "Home":
        e.preventDefault();
        onSeek(MIN_TIME);
        break;
      case "End":
        e.preventDefault();
        onSeek(totalDuration);
        break;
      default:
        break;
    }
  };

  return (
    <>
      <div
        className="flex justify-between font-medium text-xs text-zinc-500 dark:text-zinc-400">
        <span className="tabular-nums">{formatTime(currentTime)}</span>
        <span className="tabular-nums">{formatTime(totalDuration)}</span>
      </div>
      <div
        aria-label="Seek progress bar"
        aria-valuemax={totalDuration}
        aria-valuemin={MIN_TIME}
        aria-valuenow={currentTime}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(totalDuration)}`}
        className="relative z-10 h-1 w-full cursor-pointer overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="slider"
        tabIndex={0}>
        <div
          className="h-full bg-gradient-to-r from-[#FF2E55] to-[#FF6B88] transition-all duration-200"
          style={{ width: `${progress}%` }} />
      </div>
    </>
  );
});
ProgressBar.displayName = "ProgressBar";

export { LiquidButton, LiquidGlassCard };
export default LiquidGlassCard;
