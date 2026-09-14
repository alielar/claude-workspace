import { redirect } from "next/navigation";
import { LANGS } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { listPeople } from "@/lib/people";
import { LANG_LABEL, t } from "@/lib/i18n/dict";
import { Toggle } from "@/components/Toggle";
import { addPerson, deletePerson, renamePerson, setPersonLanguage } from "@/app/actions";

export default async function People() {
  const me = (await currentPerson())!;
  if (!me.isAdmin) redirect("/today");
  const all = await listPeople();
  const L = me.lang;

  return (
    <main>
      <h1 className="text-3xl font-extrabold">{t(L, "people")}</h1>

      <ul className="mt-6 grid gap-3">
        {all.map((p) => (
          <li key={p.id} className="tile p-4">
            <form action={renamePerson} className="flex gap-2">
              <input type="hidden" name="id" value={p.id} />
              <input
                name="name"
                defaultValue={p.name}
                className="input text-lg font-bold"
                dir={p.role === "cook" ? "rtl" : undefined}
                maxLength={40}
              />
              <button className="btn-soft shrink-0">{t(L, "save")}</button>
            </form>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip bg-accent-soft text-accent py-1.5 px-3 text-sm">
                {t(L, p.role === "cook" ? "cook" : "family")}
              </span>
              <Toggle id={p.id} field="isAdmin" value={p.isAdmin} label={t(L, "admin")} disabled={p.id === me.id} />
              <Toggle id={p.id} field="isAway" value={p.isAway} label={t(L, "away")} />
              {p.role === "family" && (
                <>
                  <Toggle id={p.id} field="isChild" value={p.isChild} label={t(L, "childView")} />
                  <Toggle id={p.id} field="simpleUi" value={p.simpleUi} label={t(L, "simpleScreen")} />
                </>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted me-1">{t(L, "language")}</span>
              {LANGS.map((lang) => (
                <form key={lang} action={setPersonLanguage} className="contents">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="lang" value={lang} />
                  <button
                    className={
                      "chip py-1.5 px-3 text-sm border " +
                      (p.lang === lang ? "bg-ink text-bg border-ink" : "bg-card text-muted border-line")
                    }
                  >
                    {LANG_LABEL[lang]}
                  </button>
                </form>
              ))}
              {p.id !== me.id && (
                <form action={deletePerson} className="ms-auto">
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-sm text-muted underline">{t(L, "delete")}</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form action={addPerson} className="tile mt-6 p-4 grid gap-3">
        <h2 className="text-lg font-bold">{t(L, "addPerson")}</h2>
        <input name="name" placeholder={t(L, "name")} className="input" maxLength={40} required />
        <div className="flex gap-2">
          <label className="flex-1 tile px-4 py-3 flex items-center gap-2 font-semibold">
            <input type="radio" name="role" value="family" defaultChecked className="accent-accent" />
            {t(L, "family")}
          </label>
          <label className="flex-1 tile px-4 py-3 flex items-center gap-2 font-semibold">
            <input type="radio" name="role" value="cook" className="accent-accent" />
            {t(L, "cook")}
          </label>
        </div>
        <button className="btn-accent">{t(L, "save")}</button>
      </form>
    </main>
  );
}
