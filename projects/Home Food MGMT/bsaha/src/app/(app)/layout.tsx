import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/session";
import { TabBar, type Tab } from "@/components/TabBar";
import { t } from "@/lib/i18n/dict";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await currentPerson();
  if (!me) redirect("/");

  const tabs: Tab[] = [
    { href: "/today", label: t(me.lang, "today") },
    { href: "/menu", label: t(me.lang, "menu") },
  ];
  if (me.isAdmin) tabs.push({ href: "/people", label: t(me.lang, "people") });
  tabs.push({ href: "/me", label: t(me.lang, "me") });

  return (
    <div className="min-h-dvh max-w-md mx-auto px-5 pt-8 pad-tabs">
      {children}
      <TabBar tabs={tabs} />
    </div>
  );
}
