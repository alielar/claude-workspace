import { redirect } from "next/navigation";
import { DB_CONFIGURED } from "@/db";
import { listPeople } from "@/lib/people";
import { currentPerson } from "@/lib/session";
import { choosePerson } from "./actions";
import { t } from "@/lib/i18n/dict";

export const dynamic = "force-dynamic";

/** First letter of the name, skipping the Arabic article so "الطباخة" shows "ط". */
const initial = (name: string) => name.replace(/^ال/, "").slice(0, 1).toUpperCase();

/** Tap your name. Shown in all three languages because nobody is signed in yet. */
export default async function WhoAreYou() {
  if (!DB_CONFIGURED && process.env.NODE_ENV === "production") {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 text-center text-muted">
        <p>{t("en", "dbMissing")}</p>
      </main>
    );
  }
  const me = await currentPerson();
  if (me) redirect("/today");

  const all = (await listPeople()).filter((p) => !p.isAway);
  const family = all.filter((p) => p.role === "family");
  const cooks = all.filter((p) => p.role === "cook");

  return (
    <main className="min-h-dvh px-5 py-10 max-w-md mx-auto">
      <h1 className="text-4xl font-extrabold tracking-tight">Bsaha</h1>
      <p className="mt-3 text-lg text-muted leading-snug">
        {t("en", "tapYourName")}
        <br />
        {t("fr", "tapYourName")}
        <br />
        <span dir="rtl" className="inline-block" style={{ fontFamily: "var(--font-arabic)" }}>
          {t("ar", "tapYourName")}
        </span>
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3">
        {family.map((p) => (
          <form key={p.id} action={choosePerson}>
            <input type="hidden" name="id" value={p.id} />
            <button className="tile w-full aspect-square flex flex-col items-center justify-center gap-3 p-4">
              <span className="w-16 h-16 rounded-full bg-accent-soft text-accent text-3xl font-extrabold flex items-center justify-center">
                {initial(p.name)}
              </span>
              <span className="text-xl font-bold">{p.name}</span>
            </button>
          </form>
        ))}
      </div>

      {cooks.length > 0 && (
        <div className="mt-6 grid gap-3">
          {cooks.map((p) => (
            <form key={p.id} action={choosePerson}>
              <input type="hidden" name="id" value={p.id} />
              <button className="tile w-full flex items-center gap-4 p-4" dir="rtl">
                <span className="w-14 h-14 rounded-full bg-accent text-accent-ink text-2xl font-extrabold flex items-center justify-center">
                  {initial(p.name)}
                </span>
                <span className="text-xl font-bold" style={{ fontFamily: "var(--font-arabic)" }}>
                  {p.name}
                </span>
              </button>
            </form>
          ))}
        </div>
      )}
    </main>
  );
}
