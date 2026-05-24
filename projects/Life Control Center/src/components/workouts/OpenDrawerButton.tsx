"use client";

export default function OpenDrawerButton({
  drawer,
  children,
  style,
  className,
}: {
  drawer: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("open-workout-drawer", { detail: drawer }))}
      className={className}
      style={style}
    >
      {children}
    </button>
  );
}
