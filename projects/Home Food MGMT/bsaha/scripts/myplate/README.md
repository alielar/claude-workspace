# USDA MyPlate Kitchen import

The library is the USDA MyPlate Kitchen collection (about 1,100 recipes, public domain),
taken from the Internet Archive copy of myplate.gov after USDA retired the site in January 2026.

Pipeline, run from the `bsaha` folder:

1. `python3 scripts/myplate/crawl.py <workdir>` downloads every archived recipe page into `<workdir>/pages/`.
   The archive throttles hard; 3 workers is the polite maximum.
2. `python3 scripts/myplate/parse.py <workdir>` turns the pages into `data/myplate/raw.json`
   (name, description, ingredients, directions, nutrition table, food groups, rating, image URL)
   and `data/myplate/categories.json` from the archived course listings when they exist.
3. `python3 scripts/myplate/photos.py <workdir>` downloads the original USDA photo of each recipe,
   resizes it to 900 px wide into `public/dishes/<slug>.jpg` and writes `data/myplate/photos.json`.
   Then `./scripts/make-thumbs.sh`.
4. `npx tsx --env-file=.env.local scripts/myplate/translate-free.ts` asks a free-tier model (Gemini, or any OpenAI-compatible API such as Groq or Mistral) for the French and Darija
   names, metric ingredients in three languages, Darija and French recipes, tags and categories.
   Resumable: one file per recipe in `data/myplate/translated/`. `translate.ts` is the paid Claude fallback.
5. `python3 scripts/myplate/merge.py` combines everything into `data/dishes/myplate.json`, which the seed reads.

## Free-licence photos for recipes USDA never photographed
`data/myplate/no-photo.json` lists the 132 recipes whose only USDA image was the site logo. `photos-free.py` finds a
CC0 / CC BY / CC BY-SA / public-domain photo for each on Openverse (Flickr etc.) then Wikimedia Commons, using the
plain dish name in `data/myplate/photo-queries.json` (a `slug#2` key is a second-choice search). A photo is accepted
only when every word of the query appears in its title and nothing suggests pork, alcohol, raw ingredients or
non-food; the result is logged in `photos-free-review.json` and credited on the dish page. Rerun a slug with
`python3 scripts/myplate/photos-free.py <slug>` after changing its query; then `./scripts/make-thumbs.sh` and `merge.py`.
