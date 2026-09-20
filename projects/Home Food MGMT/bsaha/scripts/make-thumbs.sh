#!/bin/zsh
# Every grid image is served from public/dishes/thumb/. A dish whose thumbnail is missing
# shows a blank tile until you open it, so this regenerates any that are absent.
# Run after adding dish photos: ./scripts/make-thumbs.sh
cd "$(dirname "$0")/.." || exit 1
mkdir -p public/dishes/thumb
made=0
for f in public/dishes/*.jpg; do
  n="${f:t}"
  [ -f "public/dishes/thumb/$n" ] && continue
  sips -s format jpeg -s formatOptions 72 --resampleWidth 420 "$f" --out "public/dishes/thumb/$n" >/dev/null 2>&1 && made=$((made+1))
done
echo "thumbnails created: $made"
echo "full: $(ls public/dishes/*.jpg | wc -l | tr -d ' ')  thumbs: $(ls public/dishes/thumb/*.jpg | wc -l | tr -d ' ')"
