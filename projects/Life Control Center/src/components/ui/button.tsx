import { cn } from "@/lib/utils";
import { type CSSProperties, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
type Size    = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: CSSProperties;
}

const variantClass: Record<Variant, string> = {
  primary:  "btn btn-primary",
  secondary:"btn btn-secondary",
  ghost:    "btn btn-ghost",
  danger:   "btn btn-danger",
  success:  "btn",
  outline:  "btn btn-ghost",
};

const sizeStyles: Record<Size, CSSProperties> = {
  sm: { padding: "5px 12px", fontSize: 12, minHeight: 30, borderRadius: 6 },
  md: { padding: "8px 16px", fontSize: 13, minHeight: 36, borderRadius: 8 },
  lg: { padding: "10px 20px", fontSize: 14, minHeight: 42, borderRadius: 8 },
};

const successStyle: CSSProperties = {
  background: "var(--success-glow)",
  color: "var(--success)",
  border: "1px solid rgba(16,185,129,0.2)",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className,
  style,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(variantClass[variant], className)}
      style={{
        ...sizeStyles[size],
        ...(variant === "success" ? successStyle : {}),
        ...style,
      }}
    >
      {loading ? (
        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : icon}
      {children}
    </button>
  );
}
