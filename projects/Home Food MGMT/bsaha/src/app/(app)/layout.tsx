import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/session";
import { TabBar, type Tab } from "@/components/TabBar";
import { t } from "@/lib/i18n/dict";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await currentPerson();
  if (!me) redirect("/");

  const tabs: Tab[] = [];
  if (me.role === "grocery") {
    // The grocery person lives on the list.
    tabs.push({ href: "/grocery", label: t(me.lang, "grocery") }, { href: "/today", label: t(me.lang, "today") });
  } else {
    tabs.push({ href: "/today", label: t(me.lang, "today") }, { href: "/menu", label: t(me.lang, "menu") });
    // The cook plans the week and shops from it; the family votes on tomorrow. Admins reach the plan from Today.
    if (me.role === "cook") tabs.push({ href: "/week", label: t(me.lang, "week") }, { href: "/grocery", label: t(me.lang, "grocery") });
    else tabs.push({ href: "/tomorrow", label: t(me.lang, "tomorrow") });
    if (me.isAdmin) tabs.push({ href: "/library", label: t(me.lang, "library") });
    if (me.isAdmin) tabs.push({ href: "/people", label: t(me.lang, "people") });
  }
  tabs.push({ href: "/me", label: t(me.lang, "me") });

  return (
    <>
      <TabBar tabs={tabs} appName={t(me.lang, "appName")} />
      {/* Phone: one narrow column with room for the bottom bar. Laptop: full width beside the sidebar. */}
      <div className="min-h-dvh max-w-md mx-auto px-5 pt-8 pad-tabs lg:max-w-none lg:mx-0 lg:ms-60 lg:px-10 lg:pb-16 lg:pt-10">
        <div className="lg:max-w-6xl lg:mx-auto">{children}</div>
      </div>
    </>
  );
}
