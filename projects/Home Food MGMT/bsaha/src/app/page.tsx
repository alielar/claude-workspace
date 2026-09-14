import { redirect } from "next/navigation";
import { DB_CONFIGURED } from "@/db";
import { listPeople } from "@/lib/people";
import { currentSession } from "@/lib/session";
import { choosePerson } from "./actions";
import { t } from "@/lib/i18n/dict";

export const dynamic = "force-dynamic";

const initial = (name: string) => name.replace(/^ال/, "").slice(0, 1).toUpperCase();
const AR = { fontFamily: "var(--font-arabic)" } as const;

/** Tap your name. A bound device is sent straight to Today, unless it is an owner device switching. */
export default async function WhoAreYou({ searchParams }: { searchParams: Promise<{ switch?: string }> }) {
  if (!DB_CONFIGURED && process.env.NODE_ENV === "production") {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 text-center text-muted">
        <p>{t("en", "dbMissing")}</p>
      </main>
    );
  }
  const session = await currentSession();
  const { switch: sw } = await searchParams;
  if (session && !(session.device.ownerDevice && sw)) redirect("/today");

  const all = (await listPeople()).filter((p) => !p.isAway);
  const family = all.filter((p) => p.role === "family");
  const others = all.filter((p) => p.role !== "family");

  return (
    <main className="min-h-dvh px-5 py-10 max-w-md mx-auto">
      <h1 className="text-4xl font-extrabold tracking-tight">Bsaha</h1>
      {session ? (
        <p className="mt-3 text-lg text-muted">{t(session.person.lang, "switchingAs")}</p>
      ) : (
        <p className="mt-3 text-lg text-muted leading-snug">
          {t("en", "tapYourName")}
          <br />
          {t("fr", "tapYourName")}
          <br />
          <span dir="rtl" className="inline-block" style={AR}>{t("ar", "tapYourName")}</span>
        </p>
      )}

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

      {others.length > 0 && (
        <div className="mt-6 grid gap-3">
          {others.map((p) => (
            <form key={p.id} action={choosePerson}>
              <input type="hidden" name="id" value={p.id} />
              <button className="tile w-full flex items-center gap-4 p-4" dir={p.lang === "ar" ? "rtl" : "ltr"}>
                <span className="w-14 h-14 rounded-full bg-accent text-accent-ink text-2xl font-extrabold flex items-center justify-center">
                  {initial(p.name)}
                </span>
                <span className="text-xl font-bold" style={p.lang === "ar" ? AR : undefined}>{p.name}</span>
                <span className="ms-auto chip bg-accent-soft text-accent py-1 px-3 text-sm">{t(p.lang, p.role === "cook" ? "cook" : "grocery")}</span>
              </button>
            </form>
          ))}
        </div>
      )}
    </main>
  );
}
