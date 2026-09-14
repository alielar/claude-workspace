import Link from "next/link";
import type { Dish, Lang } from "@/db/schema";
import { dishName } from "@/lib/dishes";

/** Photo-first tile. `simple` drops the subtitle for the children's screen. */
export function DishTile({ dish, lang, simple }: { dish: Dish; lang: Lang; simple?: boolean }) {
  return (
    <Link href={`/menu/${dish.slug}`} className="tile overflow-hidden block">
      <div className="aspect-[4/3] bg-accent-soft relative">
        {dish.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dish.photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-accent text-4xl font-extrabold">
            {dish.nameEn.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className={simple ? "text-lg font-extrabold leading-tight" : "text-base font-bold leading-tight"}>
          {dishName(dish, lang)}
        </div>
        {!simple && lang !== "ar" && <div className="text-sm text-muted mt-0.5">{dish.nameLatin}</div>}
      </div>
    </Link>
  );
}
