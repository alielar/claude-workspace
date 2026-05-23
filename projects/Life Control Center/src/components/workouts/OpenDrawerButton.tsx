"use client";

export default function OpenDrawerButton({
  drawer,
  children,
  style,
}: {
  drawer: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("open-workout-drawer", { detail: drawer }))}
      style={style}
    >
      {children}
    </button>
  );
}
