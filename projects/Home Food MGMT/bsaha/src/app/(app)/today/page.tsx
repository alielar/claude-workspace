import { currentPerson } from "@/lib/session";
import { t } from "@/lib/i18n/dict";

export default async function Today() {
  const me = (await currentPerson())!;
  return (
    <main>
      <h1 className="text-3xl font-extrabold">
        {t(me.lang, "hello")} {me.name}
      </h1>
      <p className="mt-6 text-lg text-muted">
        {t(me.lang, me.role === "cook" ? "ordersSoon" : "picksSoon")}
      </p>
    </main>
  );
}
