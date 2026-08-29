/**
 * <Icon name="..." /> — the small set of icons the shell needs.
 * Each icon is a named import so unused ones never ship.
 */

import {
  Sun, Newspaper, Settings, Dumbbell, ListChecks,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  today:    Sun,
  news:     Newspaper,
  settings: Settings,
  train:    Dumbbell,
  todo:     ListChecks,
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
