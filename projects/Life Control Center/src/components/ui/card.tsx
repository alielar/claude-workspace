import { cn } from "@/lib/utils";
import { type CSSProperties } from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  hoverable?: boolean;
  accent?: boolean;
  padding?: "sm" | "md" | "lg" | "none";
  onClick?: () => void;
}

const paddingMap = {
  none: "p-0",
  sm:   "p-3",
  md:   "p-4",
  lg:   "p-5",
};

export function Card({
  children,
  className,
  style,
  hoverable = false,
  accent = false,
  padding = "md",
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        accent ? "card-accent" : "card",
        hoverable && "card-hover",
        paddingMap[padding],
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

/** Compact section header inside a card */
export function CardLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("section-label mb-3", className)}>
      {children}
    </p>
  );
}
