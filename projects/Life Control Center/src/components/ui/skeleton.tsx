import { cn } from "@/lib/utils";
import { type CSSProperties } from "react";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  /** Fixed height shorthand */
  h?: number | string;
  /** Fixed width shorthand */
  w?: number | string;
}

export function Skeleton({ className, style, h, w }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton", className)}
      style={{
        height: h,
        width: w,
        ...style,
      }}
    />
  );
}

/** Full-card skeleton (common pattern) */
export function CardSkeleton({ height = 120, className }: { height?: number; className?: string }) {
  return (
    <div className={cn("card p-4", className)}>
      <Skeleton h={10} w="40%" className="mb-3" />
      <Skeleton h={height - 60} />
      <Skeleton h={10} w="60%" className="mt-3" />
    </div>
  );
}

/** Row skeleton for lists */
export function RowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-3 flex items-center gap-3">
          <Skeleton h={32} w={32} style={{ borderRadius: 8, flexShrink: 0 }} />
          <div className="flex-1 space-y-2">
            <Skeleton h={10} w="50%" />
            <Skeleton h={8} w="30%" />
          </div>
        </div>
      ))}
    </div>
  );
}
