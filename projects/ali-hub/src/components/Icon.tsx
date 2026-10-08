/**
 * <Icon name="..." /> · the small set of icons the shell needs.
 * Each icon is a named import so unused ones never ship.
 */

import {
  Sun, Newspaper, Settings, Target, ListChecks, Bot, HeartPulse, LayoutGrid, FileText, Search, Plus, CornerDownLeft,
  List, SquareCheck, Link2, Lock, Cake, ChevronRight, X,
  type LucideIcon, PanelLeftClose, PanelLeftOpen } from "lucide-react";

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
  // Knowledge shapes and the two fixed rows (2026-10-06)
  list:      List,
  checklist: SquareCheck,
  doc:       FileText,
  link:      Link2,
  lock:      Lock,
  cake:      Cake,
  chevron:   ChevronRight,
  close:     X,
  // The sidebar's collapse toggle (2026-10-08)
  railClose: PanelLeftClose,
  railOpen:  PanelLeftOpen,
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
