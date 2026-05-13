import { cn } from "@/lib/utils";
import { type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          {label}
        </label>
      )}
      <input
        {...props}
        className={cn("input", error && "border-danger", className)}
        style={{ borderColor: error ? "var(--danger)" : undefined }}
      />
      {error && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>
      )}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          {label}
        </label>
      )}
      <textarea
        {...props}
        className={cn("input resize-none", className)}
        style={{ minHeight: 80 }}
      />
    </div>
  );
}
