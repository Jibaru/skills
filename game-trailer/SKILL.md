---
name: game-trailer
description: Plan, record, edit and encode a game trailer or teaser — spoiler-free shot list, recording with Godot Movie Maker (scripted director scene), Three.js canvas capture or OBS, web encode with loudness normalization, review through contact sheets and stills, and the derivatives (landing loop, poster, OG image, itch/Steam screenshots). Use when the user says "make a trailer", "teaser", "record gameplay video", "cinematic", "trailer for the landing page/itch/Steam", or when a trailer needs re-cutting.
metadata:
  author: Jibaru
  version: 1.0.0
---

# game-trailer

A trailer is a scripted scene, recorded offline, reviewed as stills and contact sheets, then encoded once.
Everything here comes from shipping **THE ONES** (Godot 4.7.2 first-person horror, private source repo
`crafter-games/the-ones`, public trailer at https://theones.crafter.run). The director script is
`scripts/trailer.gd` and the scene is `scenes/trailer.tscn` in that project.

## Rule 0: suggest, don't show

This rule is mandatory for horror and mystery, and the default for any narrative game. THE ONES' first
trailer showed the creature close up, the grey alien in a found-footage clip, and the giants. The user:
"creo que el trailer no debería mostrar cosas, estás haciendo spoiler, siento que es muy obvio" ("I don't
think the trailer should show things; you're spoiling it, it feels very obvious"). It was rebuilt
spoiler-free.

1. **Write a spoiler list first**, from `GDD.md` and the story: every creature, reveal, twist, ending and
   set-piece. Nothing on that list appears in full, in the trailer **or** in any still derived from it.
2. Allowed treatments:
   - **Cut one frame before the reveal.** In THE ONES, the found-footage clip is played with
     `_signs_clip(4.75)` (its full length is 10.5 s), then a gasp and static over black.
   - **Scale by sound only.** A giant becomes a distant horn plus three footsteps that shake the frame over
     black (tween the CanvasLayer `offset`).
   - **Silhouettes.** These must be the **real** in-game model's silhouette (the shoji shot uses the actual
     creature rendered into the paper shader), never a stand-in.
   - **Empty aftermath.** A flashlight on an empty dike that flickers off and on: still nothing there.
   - **Diegetic lines that imply.** "No abras. Aunque sea mi voz." ("Don't open. Even if it's my voice.")
3. **Show the user the shot list, with a "reveals?" column, before recording anything.** Re-records are
   the expensive part.

## Shot list template

| # | t (s) | shot | camera from → to | audio | reveals? |
| --- | --- | --- | --- | --- | --- |
| 1 | 0–4 | title card "霧山村 — Iwate, 1998" | — | silence → impact | no |
| 2 | 4–12 | sunset over the paddy | (-24,2.4,40) → (-10,1.8,22) | narrator line | no |
| 5 | 40–46 | silhouette behind the shoji | static | dead wife's voice "Haruo… soy yo" | silhouette only (real model) |

The structure that shipped (81 s), from `trailer.gd` `_run()`:

1. place card
2. sunset paddy + narrator
3. the house at night, shoji lit in fog
4. three lights in the sky (two go out)
5. cult lantern procession on the dike
6. silhouette behind the shoji
7. found-footage clip, cut before the reveal
8. black + knocking + "No abras"
9. flickering flashlight on an empty dike
10. sound-only giant over black
11. title, then download card

Music: 1 s of silence → impact → drone → single note. Each voice line is followed by a held beat.

## Recording in Godot (Movie Maker)

```bash
godot --path . --write-movie build/trailer/trailer.avi --fixed-fps 30 --resolution 1280x720 res://scenes/trailer.tscn
```

- **It renders offline.** Timers and tweens run on game time, so heavy scenes still record smoothly. It needs
  a window and a GPU: not `--headless`. The output is MJPEG AVI + PCM, roughly 2.4 MB/s at 720p30.
- **End the director with `get_tree().quit()`.** Killing the process leaves a broken AVI. Wrap the run
  in `timeout 1500` and grep only `SCRIPT ERROR`.
- **Exclude the trailer from exports.** THE ONES' `export_presets.cfg` has
  `exclude_filter="playtest/*, scenes/trailer.tscn, scripts/trailer.gd, devtools/*, assets/source/*, tools/*, scenes/*_preview.tscn, …"`.
- **Game code that touches the window must step aside while recording.** `scripts/settings.gd:170`:
  `if DisplayServer.get_name() == "headless" or Engine.get_write_movie_path() != "":` returns before changing
  window mode or size.
- **One Godot process at a time.** Recording while a playtest suite or export runs runs out of memory.

### Director scene skeleton

`scenes/trailer.tscn` is a single `Node` with the script. The skeleton below is condensed from
`scripts/trailer.gd` (363 lines, real code):

```gdscript
extends Node

var main: Node
var cam: Camera3D
var layer: CanvasLayer
var fade: ColorRect
var props: Array[Node] = []

func _ready() -> void:
	main = (load("res://scenes/explore.tscn") as PackedScene).instantiate()
	add_child(main)
	await get_tree().process_frame
	await get_tree().process_frame          # let the world build
	main.hud.visible = false
	main.player.frozen = true
	cam = Camera3D.new()
	cam.fov = 55.0
	cam.far = 900.0
	main.world.add_child(cam)
	cam.make_current()
	_build_ui()                             # CanvasLayer (layer 50): black bars at 10%/90%, fade rect, title/sub/subtitle labels
	var score := AudioStreamPlayer.new()
	score.stream = load("res://assets/audio/music/trailer_cue.ogg")
	add_child(score)
	await _run()
	get_tree().quit()

func _shot(from: Vector3, look_from: Vector3, to: Vector3, look_to: Vector3, t: float) -> void:
	cam.global_position = from
	cam.look_at(look_from)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(cam, "global_position", to, t).set_trans(Tween.TRANS_SINE)
	tw.tween_method(func(p: Vector3) -> void:
		if is_instance_valid(cam):
			cam.look_at(p), look_from, look_to, t).set_trans(Tween.TRANS_SINE)

func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout

func _fade_to(a: float, t: float) -> void:
	var tw := create_tween()
	tw.tween_property(fade, "modulate:a", a, t)
	await tw.finished

func _clear_props() -> void:
	for p in props:
		if is_instance_valid(p):
			p.queue_free()
	props.clear()

# _run(): per shot → set world state (main.world.set_daylight(0.62) / set_night()), spawn props into
# `props`, _shot(...), await _fade_to(0.0, …), _say(voice_key, subtitle), await _wait(…),
# await _fade_to(1.0, …), _clear_props()
```

The real file also has `_say(key, text)` (plays `res://assets/audio/voice/<key>.ogg` and fades a subtitle),
`_play_sfx(path, db)`, `_card(title, sub, hold, big)`, and a found-footage insert drawn into a full-screen
`TextureRect` over a black `ColorRect`, so the previous shot can't show through.

**Reuse the game's own systems through public hooks** (`world.set_night()`, `ShojiShadow.walk()`,
`NewsClipSigns`) instead of copying logic. Fast-forward long animations by setting their internal time.

### Recording pitfalls

- **UI under `--resolution`** with `stretch/mode="canvas_items"` and a 1920×1080 base lives in the virtual
  canvas: a full-screen clip came out small and offset. Lay out from
  `get_viewport().get_visible_rect().size` every frame. `_signs_clip` recomputes position and size inside its loop.
- **Framing giant or distant things.** The 220 m creature was out of frame three times. Copy a framing
  already proven in a playtest screenshot, and aim higher to clear the cinema bars. Distant flyers must
  really be far away, or they cover the hero shot.
- **Don't bake a URL or platform list into the end card until both are final.** THE ONES' shipped
  `trailer.mp4` still ends on "Descárgalo gratis · Windows / crafter-games.github.io/the-ones-game", recorded
  before the custom domain (theones.crafter.run) and the macOS build existed. The source
  (`trailer.gd` line 171) still has that card. Keep the end card to title + "free download", or record
  it last.

### Other engines

- **Three.js / web canvas:** record in the browser with `canvas.captureStream(30)` + `MediaRecorder`
  (WebM), driven by a scripted camera path, or render frames deterministically and `ffmpeg -framerate 30 -i f%05d.png`.
- **Any engine:** OBS at the target resolution, with a fixed seed and a scripted or debug camera. Trim and
  assemble in ffmpeg.

## Review: stills and contact sheets, never full re-records

Iterate framing on **stills**. Re-recording 80 s to check one shot is what cost about ten re-records in THE
ONES. These commands were tested on the shipped `trailer.mp4` (1600×900, 81.1 s):

```bash
V=build/trailer/trailer.avi            # or the encoded mp4
# whole-trailer contact sheet: one frame every 3 s, 6x5 grid, then Read the PNG
ffmpeg -hide_banner -loglevel error -y -i "$V" -vf "fps=1/3,scale=320:180,tile=6x5" -frames:v 1 sheet.png
# only the shots you care about, side by side
for t in 20 40 64; do ffmpeg -hide_banner -loglevel error -y -ss $t -i "$V" -frames:v 1 -vf scale=640:360 b$t.png; done
ffmpeg -hide_banner -loglevel error -y -i b20.png -i b40.png -i b64.png -filter_complex hstack=3 bsheet.png
# a time window at 1 fps
ffmpeg -hide_banner -loglevel error -y -i "$V" -vf "fps=1,select='between(t,30,42)',scale=320:180,tile=6x2" -frames:v 1 window.png
```

**Pick still times from the contact sheet.** A trailer is full of fades, and a timestamp picked blind often
lands on black (`-ss 60` gave a 771-byte all-black PNG in the test). A still under a few KB is black.

**Numbered labels on Windows.** ffmpeg there has no fontconfig, so `drawtext` without `fontfile=` prints
`Fontconfig error: Cannot load default config file` and draws nothing. A drive-letter path breaks the
filter parser (`No option name near '/Users/…'`) because `:` separates options. Copy a TTF next to the
images and use a relative `fontfile=` (verified):

```bash
cp assets/fonts/CourierPrime-Bold.ttf f.ttf
ffmpeg -y -loglevel error -i b20.png -vf "drawtext=fontfile=f.ttf:text='1':fontcolor=yellow:fontsize=34:x=8:y=6:box=1:boxcolor=black@0.6" n1.png
rm f.ttf
```

## Encode for the web

```bash
ffmpeg -y -i build/trailer/trailer.avi -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -af "loudnorm=I=-15:TP=-1.5" -movflags +faststart trailer.mp4
```

At 720p, CRF 22 gave ~54 MB for 74 s, and CRF 26 gives 13–17 MB, which is fine as a landing background (the
shipped 81 s, 1600×900 file is 12.7 MB). `+faststart` lets the page start playing before the download finishes.

## Audio: you can't hear it, so measure it and say so

- Use a dedicated music cue playing from t=0. Generated music rarely obeys "silence, then a hit", so cut it by hand.
  Duck the music under voice lines.
- Measure loudness instead of guessing (tested on the shipped trailer: I = -14.3 LUFS, true peak -1.0 dBFS):

  ```bash
  ffmpeg -hide_banner -nostats -i trailer.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|LRA|Peak):"
  ```
- **Always tell the user: "I can't hear audio. Listen before you share it."**

## Derivatives, once the cut is final

- **Landing loop + `poster.jpg`**: a non-spoiler frame. See the `game-landing-page` skill.
- **`og.jpg` (1200×630)**: built from the poster, with the title drawn with `fontfile=` (in `game-landing-page`).
- **Stills without the cinema bars**: with bars at 10%/90% (as `_build_ui` draws them),
  `-vf "crop=iw:ih*0.8:0:ih*0.1"` works at any resolution (1600×900 → 1600×720, verified). A fixed
  `crop=1280:540:0:90` is only right for one size and cuts into the picture at 720p.
- **itch.io**: cover 630×500 plus 3–5 screenshots. Its trailer field takes a **YouTube/Vimeo URL**, not an mp4.
- **Steam**: see the `steam-publish` skill for sizes. Re-check every still against the spoiler list.

## Done means

- [ ] A spoiler list exists, and the shot list with its "reveals?" column was approved before recording.
- [ ] A contact sheet of the final cut was read, and no spoiler-list item is visible in full.
- [ ] The end card has no URL or platform list that isn't final.
- [ ] Encoded with faststart, and loudness measured (about -15 LUFS integrated, peaks ≤ -1 dBFS).
- [ ] The user was told to listen to it.
- [ ] The trailer scene and script are excluded from game exports.
