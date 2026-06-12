/**
 * <Icon name="..." /> — maps string keys to Lucide icons.
 * All icon names used across the app go through this single component.
 */

import {
  LayoutDashboard, Dumbbell, Newspaper, CheckSquare, BookMarked,
  BookOpen, SmilePlus, Moon, Wallet, PenLine,
  Search, Plus, Play, Flame, Check,
  ChevronRight, ChevronLeft, ChevronDown,
  RefreshCw, Pencil, Trash2, GripVertical, Upload,
  Book, Volume2, X, ArrowRight, ArrowUp, ArrowDown,
  History, Timer, ZoomIn, ZoomOut, FileText, Crosshair,
  Settings, LogOut, MoreHorizontal, Star, Bell,
  Lightbulb, Brain, HeartPulse,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  // Modules
  dashboard: LayoutDashboard,
  workouts:  Dumbbell,
  news:      Newspaper,
  checklist: CheckSquare,
  words:     BookMarked,
  library:   BookOpen,
  mood:      SmilePlus,
  sleep:     Moon,
  finance:   Wallet,
  journal:   PenLine,
  mind:      Brain,
  wellbeing: HeartPulse,

  // Actions
  search:    Search,
  plus:      Plus,
  play:      Play,
  flame:     Flame,
  check:     Check,
  refresh:   RefreshCw,
  edit:      Pencil,
  trash:     Trash2,
  drag:      GripVertical,
  upload:    Upload,
  x:         X,

  // Navigation / chevrons
  chevR:     ChevronRight,
  chevL:     ChevronLeft,
  chevD:     ChevronDown,
  arrowR:    ArrowRight,
  arrowUp:   ArrowUp,
  arrowDown: ArrowDown,

  // Media / content
  book:      Book,
  volume:    Volume2,
  notes:     FileText,
  knowledge: Lightbulb,
  focus:     Crosshair,

  // Misc
  history:   History,
  timer:     Timer,
  zoomIn:    ZoomIn,
  zoomOut:   ZoomOut,
  settings:  Settings,
  logout:    LogOut,
  more:      MoreHorizontal,
  star:      Star,
  bell:      Bell,
};

interface IconProps {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 16, strokeWidth = 1.8, className, style }: IconProps) {
  const LIcon = ICONS[name];
  if (!LIcon) return null;
  return <LIcon size={size} strokeWidth={strokeWidth} className={className} style={style} />;
}
