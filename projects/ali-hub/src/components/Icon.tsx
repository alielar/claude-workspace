/**
 * <Icon name="..." /> · the small set of icons the shell needs.
 * Each icon is a named import so unused ones never ship.
 */

import {
  Sun, Newspaper, Settings, Target, ListChecks, Bot, HeartPulse, LayoutGrid, FileText, Search, Plus, CornerDownLeft,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  today:    Sun,
  news:     Newspaper,
  settings: Settings,
  train:    Target, // body and mind both, not a dumbbell (Ali 2026-09-30)
  todo:     ListChecks,
  r2d2:     Bot,    // the droid (ALAI renamed R2-D2, Ali 2026-10-03)
  health:   HeartPulse,
  other:    LayoutGrid,
  knowledge: FileText,
  search:   Search,
  plus:     Plus,
  enter:    CornerDownLeft,
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
