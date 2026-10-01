/**
 * <Icon name="..." /> · the small set of icons the shell needs.
 * Each icon is a named import so unused ones never ship.
 */

import {
  Sun, Newspaper, Settings, Target, ListChecks, Sparkles, HeartPulse,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  today:    Sun,
  news:     Newspaper,
  settings: Settings,
  train:    Target, // body and mind both, not a dumbbell (Ali 2026-09-30)
  todo:     ListChecks,
  alai:     Sparkles,
  health:   HeartPulse,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 16, strokeWidth = 1.8, className, style }: IconProps) {
  const LIcon = ICONS[name];
  return <LIcon size={size} strokeWidth={strokeWidth} className={className} style={style} />;
}
