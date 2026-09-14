import clsx from "clsx";
import { DISLIKE_TAGS, LANGS } from "@/db/schema";
import { currentSession } from "@/lib/session";
import { LANG_LABEL, t } from "@/lib/i18n/dict";
import { setMyLanguage, switchPerson } from "@/app/actions";
import { toggleDislike } from "@/app/(app)/menu/actions";

export default async function Me() {
  const { person: me, device } = (await currentSession())!;
  return (
    <main>
      <h1 className="text-3xl font-extrabold">{me.name}</h1>
      <p className="mt-1 text-muted">{t(me.lang, me.role === "cook" ? "cook" : me.role === "grocery" ? "grocery" : "family")}</p>

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

      {me.role === "family" && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wide">{t(me.lang, "dislikes")}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {DISLIKE_TAGS.map((tag) => {
              const on = (me.dislikes ?? []).includes(tag);
              return (
                <form key={tag} action={toggleDislike}>
                  <input type="hidden" name="tag" value={tag} />
                  <button
                    className={clsx(
                      "chip py-2 px-4 text-base border",
                      on ? "bg-accent text-accent-ink border-accent" : "bg-card text-muted border-line",
                    )}
                  >
                    {t(me.lang, `tag_${tag}`)}
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-10">
        {device.ownerDevice ? (
          <form action={switchPerson}>
            <button className="btn-ghost w-full">{t(me.lang, "switchPerson")}</button>
          </form>
        ) : (
          <p className="text-sm text-muted text-center">{t(me.lang, "lockedHint")}</p>
        )}
      </section>
    </main>
  );
}
