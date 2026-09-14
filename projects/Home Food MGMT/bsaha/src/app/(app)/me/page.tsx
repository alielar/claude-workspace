import clsx from "clsx";
import { LANGS } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { LANG_LABEL, t } from "@/lib/i18n/dict";
import { setMyLanguage, switchPerson } from "@/app/actions";

export default async function Me() {
  const me = (await currentPerson())!;
  return (
    <main>
      <h1 className="text-3xl font-extrabold">{me.name}</h1>
      <p className="mt-1 text-muted">{t(me.lang, me.role === "cook" ? "cook" : "family")}</p>

      <section className="mt-8">
        <h2 className="text-sm font-bold text-muted uppercase tracking-wide">{t(me.lang, "yourLanguage")}</h2>
        <div className="mt-3 grid gap-2">
          {LANGS.map((lang) => (
            <form key={lang} action={setMyLanguage}>
              <input type="hidden" name="lang" value={lang} />
              <button
                className={clsx(
                  "tile w-full text-start px-5 py-4 text-lg font-bold",
                  lang === me.lang && "border-accent text-accent",
                )}
                dir={lang === "ar" ? "rtl" : "ltr"}
                style={lang === "ar" ? { fontFamily: "var(--font-arabic)" } : undefined}
              >
                {LANG_LABEL[lang]}
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <form action={switchPerson}>
          <button className="btn-ghost w-full">{t(me.lang, "switchPerson")}</button>
        </form>
      </section>
    </main>
  );
}
