import clsx from "clsx";
import { togglePersonFlag } from "@/app/actions";

/** One admin switch for a person flag. A form so it works without any client JavaScript. */
export function Toggle({
  id,
  field,
  value,
  label,
  disabled,
}: {
  id: number;
  field: "isAdmin" | "isAway" | "isChild" | "simpleUi";
  value: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <form action={togglePersonFlag} className="contents">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={value ? "0" : "1"} />
      <button
        disabled={disabled}
        className={clsx(
          "chip py-1.5 px-3 text-sm border",
          value ? "bg-accent text-accent-ink border-accent" : "bg-card text-muted border-line",
          disabled && "opacity-50",
        )}
      >
        {label}
      </button>
    </form>
  );
}
