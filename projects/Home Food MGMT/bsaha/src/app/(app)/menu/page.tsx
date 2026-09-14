import { currentPerson } from "@/lib/session";
import { t } from "@/lib/i18n/dict";

export default async function Menu() {
  const me = (await currentPerson())!;
  return (
    <main>
      <h1 className="text-3xl font-extrabold">{t(me.lang, "menu")}</h1>
      <p className="mt-6 text-lg text-muted">{t(me.lang, "menuSoon")}</p>
    </main>
  );
}
