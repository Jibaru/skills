# Choosing a model (characters, creatures, hero props)

A model choice is a design decision: the user picks, and you make the choice well-informed and cheap.
In THE ONES, a numbered contact sheet let the user answer in one line ("M3, M2, M13 y G7… G1 y G3"),
while picking alone produced models the user rejected ("el alien no da tanto miedo… busca más y yo me
encargaré de elegir": the alien isn't scary enough, search more and I'll choose).

## The procedure

1. **Search wide.** Run 15–30 queries: synonyms, breeds or species, styles, and "rigged", "animated",
   "game ready". Use `--animated` for characters and leave it off for props. Run one request per
   licence (the script does this). Deduplicate by uid.

   ```bash
   node <skill>/scripts/sketchfab.mjs search "shiba inu" "akita" "labrador" "german shepherd" "husky" \
     "stray dog" "mongrel" "wolf" "hound" --animated --out cands.json
   ```

2. **Rank by usefulness, not likes.** Clip count decided the dog (107 vs 1). Also weigh the face
   budget (props under ~10k, characters under ~60k for a game), GLB size, and texture resolution.
   Drop `REUPLOAD`, `IP?` and `CHECK-DESCRIPTION` rows unless you've read the page.
3. **Show a numbered contact sheet.** Use `sheet cands.json --top 12`, then Read `review/sheet.jpg`
   yourself before showing it. For bigger picks also build a catalog HTML: dark cards with thumbnail,
   author, licence badge, faces, rig/clips, a 1–2 line honest assessment and the viewer link (so the
   user can rotate the model). Star your top 3, mark paid options "DE PAGO $X", and give stable codes
   (M1…, G1…) so the user can answer by code. Ask the user to pick.
4. **Download only the 2 finalists.** Inspect them headless (`references/godot-import.md`, C1), then
   look at them **in the engine under the game's real lighting**: a preview scene plus playtest
   screenshots, by day and under the flashlight.
5. **Clean up after the pick.** Run `assets.mjs remove <ref>` for each loser (files + row + rebuilt
   `CREDITS.md`), grep scripts and scenes for leftover paths, then `assets.mjs audit`.

**Exception:** when the user hands over the decision ("busca uno mejor… has un research": find a
better one, do the research), do the research and make the pick yourself, but still show comparison
sheets of the finalists and the integrated result.

**Prefer a realistic model with many game animations plus a recolour shader** over a worse model in
the right colour. The dog brief asked for a black dog. The winner was a cream Labrador with 107
clips, recoloured in a shader (`references/godot-import.md`, C4).

## Worked example: replacing the dog (THE ONES, v0.7.3)

1. **Baseline.** Read `scripts/actors/kuro.gd` (`MODEL`, the `CLIPS` table, `ROOT_BONE`,
   `HIDE_MESHES`). Run the preview playtest to screenshot the current dog: a pitbull recoloured black
   that looked plastic.
2. **Search.** About 25 queries in two rounds (shiba, akita, kai ken, japanese dog, labrador, german
   shepherd, husky, jindo, dingo, stray, mongrel, wolf, hound, coyote…), each run across the by,
   by-sa and cc0 licences, downloadable, `-likeCount`, `count 24`. Deduplicated by uid, kept
   `animationCount > 0`. Most of the top results by likes were off-topic.
3. **Contact sheet.** 12 uids as 400×225 thumbnails with yellow numbers, `xstack` 4×3. It failed
   twice before working: fontconfig (fixed with `fontfile=`), then a missing last line (fixed in the
   `while read` loop). See the pitfalls table in `references/sketchfab.md`.
4. **Two finalists.**
   - "Labrador dog no description (serioulsy)" by Dream Dixie Works: CC BY 4.0, 38,144 faces, **107
     clips**, 48 MB, uid `42c8f95d9a83481f93e84d706ca03729`.
   - "Labrador Dog" by kenchoo: 52,772 faces, 1 clip.
5. **Headless inspection.** 116 bones, root `Reference_01_7`, 2 meshes (Coat plus untextured
   whiskers). Clip lengths and loop modes, including zero-length `*_pose_01` clips.
6. **Wiring verbs to clips.** In `kuro.gd`'s `CLIPS` (`{public_name: [clip, speed, loop]}`):

   | Verb | Clip |
   | --- | --- |
   | idle | `labrador_idle_one_off_smell_air_01` (an 11 s one-off used as a looping idle) |
   | walk | `labrador_walk_fwd_01` |
   | sit | `labrador_idle_to_idle_sit_01` |
   | bark | `labrador_idle_bark_04_warning` |
   | growl | `labrador_idle_to_aggressive_pose_01` |

   The old names (`standing`, `play_dead`) were kept as aliases, so no caller broke.
7. **Recolour.** Dumped the texture (`glb_textures.mjs`) and wrote `shaders/dog_coat.gdshader`. It
   took 5 iterations: blotchy → sRGB thresholds → RGB debug mask → high-pass hair → less specular and
   sheen. Each was checked with close-up playtest screenshots by day and under the flashlight.
8. **In the world.** Ran the yard playtest and every scene with the dog. Two runs "failed" only
   because of the default 60 s playtest timeout, and passed with 600 s.
9. **Cleanup.** Deleted the losing Labrador, the old pitbull and their credit rows, then rebuilt the
   credits. The old `dog_shiba` was **missed**, and it still ships today. `assets.mjs audit` now
   reports it as a credited asset nothing references.
10. **Ship and report.** The search breadth, the filters, the winner and why, what the shader
    keeps, the new animations, and the credit row.

## Catalog brief template (for a subagent doing the search)

> Search Sketchfab (and Poly Haven / Poly Pizza / itch.io free packs) for **<what>**. Licences
> allowed: CC0, CC BY, CC BY-SA only. Never Free Standard/Standard, NC or ND. Run at least 15
> queries (list them in the report). For each of the best 12, collect: thumbnail, name, author,
> licence (slug + URL from `info`), faces, rig yes/no, clip count and names of the useful ones, GLB
> size, and one honest line on quality and fit. Flag reuploads, IP and description red flags. Build
> `review/sheet.jpg` (numbered) and `review/catalog.html` (cards with stable codes M1…M12, viewer
> link, top 3 starred). Don't download anything except the 2 finalists if asked. Don't commit. Use
> one Godot process at a time. Scratch files go in the scratchpad, never the project root.
