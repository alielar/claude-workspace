"use client";

import { cn } from "@/lib/utils";
import { type CSSProperties } from "react";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  style?: CSSProperties;
  /** "pill" = rounded pill group, "underline" = underline style */
  variant?: "pill" | "underline";
  accentColor?: string;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
  style,
  variant = "pill",
  accentColor = "var(--accent-primary)",
}: TabsProps) {
  if (variant === "underline") {
    return (
      <div
        className={cn("flex items-center gap-0", className)}
        style={{ borderBottom: "1px solid var(--border-subtle)", ...style }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative"
              style={{ color: isActive ? accentColor : "var(--text-tertiary)" }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isActive ? `${accentColor}18` : "var(--bg-elevated-2)",
                    color: isActive ? accentColor : "var(--text-tertiary)",
                  }}
                >
                  {tab.count}
                </span>
              )}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: accentColor }}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // pill variant (default)
  return (
    <div
      className={cn("flex items-center gap-1 p-1 rounded-lg", className)}
      style={{ background: "var(--bg-elevated-2)", ...style }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="flex items-center gap-1.5 flex-1 justify-center py-1.5 px-3 rounded-md text-[13px] font-medium transition-all"
            style={{
              background: isActive ? "var(--bg-elevated)" : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
              boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className="text-[10px] px-1 rounded"
                style={{ color: isActive ? accentColor : "var(--text-tertiary)" }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
