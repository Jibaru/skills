---
name: elevenlabs-game-audio
description: Generate game voice lines, designed voices, music cues and loops with the ElevenLabs API from Node — a JSON spec of cast and lines, cached raw takes so re-processing never re-bills, diegetic FX chains (tape, radio, phone, TV, door, imitation), loudness-normalized OGG, seamless loops cut to the measured pulse, and stingers split on silence; checked by numbers because the agent cannot listen. Use when the user asks for "voices for my game", "dub the dialogue", "Japanese voice acting", "design a voice", "generate music", "a looping track", "stingers", "ElevenLabs", or when audio generation fails with invalid_unicode, string_too_short, missing_permissions or concurrent_limit_exceeded.
metadata:
  author: Jibaru
  version: 1.0.0
---

# elevenlabs-game-audio

Voice, music and loops for a game from the ElevenLabs API, engine-neutral, with Node 18+ and
ffmpeg. The scripts and every number below come from shipping a Godot horror game, THE ONES:
95 Japanese voice lines from 13 voices, 6 music cues, 6 stingers and a trailer cue. Its
`devtools/` scripts are generalized here.

## Two rules before anything else

**1. Keys never appear in a command, a file you commit, or the chat transcript.** In that
project the user pasted keys into the chat, and the agent then inlined the ElevenLabs key
literally in several `curl` commands, so it now sits in the transcript several times. Do this instead:

- Write it once to `.env` (with the Write tool) and confirm `.env` is in `.gitignore`.
- The scripts read `ELEVENLABS_API_KEY` from the environment or `.env`. In a shell, use
  `set -a; . ./.env; set +a` and refer to `$ELEVENLABS_API_KEY`.
- Before the first commit: `git ls-files | xargs grep -l "<first 6 chars of the key>"` must print nothing.
- If the user pasted a key in the chat, recommend they rotate it.

**2. You cannot hear the result, so verify it by numbers and say so.** Every script prints
something measurable: durations, mean and peak volume, LUFS, trailing silence, the level jump
at a loop seam. Use those to catch broken takes. Then tell the user plainly: "I can't listen;
these numbers are in range, please listen before shipping."

## Setup

```bash
node <skill>/scripts/check_key.mjs        # GET /v1/voices — free, does not spend credits
```

Don't validate a key with `GET /v1/user` or `/v1/user/subscription`. A key restricted to
generation returns `401 missing_permissions` ("user_read") there while TTS, Voice Design and
Music all work. (Some third-party scripts, such as `threejs-audio-generator --validate`, do
exactly that and report a working key as broken.)

**Non-ASCII text goes through Node `fetch`, never `curl` on Windows.** Git Bash's
`curl -d '{"text":"あの夜…"}'` returned
`400 {"type":"invalid_unicode","message":"Request body contains invalid UTF-8 encoding."}`.
The scripts send `JSON.stringify` bodies with `Content-Type: application/json; charset=utf-8`.

## Voice lines

1. Copy `assets/voice_lines.example.json` into the project and fill in the `cast` (one entry per
   voice: `voice` id, credit `name`, `fx`, `settings`) and the `lines` (`KEY: {who, text}`; optional
   per-line `fx`, `out`, `settings`).
2. Dry run: validates the spec and prints how many characters would be billed. No API call.

   ```bash
   node <skill>/scripts/voices.mjs --spec devtools/voice_lines.json --dry
   ```
3. Generate. Only missing lines are sent. Each raw MP3 is cached in `assets/source/voice_raw/`
   (gitignore it), then FX are applied into mono Vorbis `assets/audio/voice/<KEY>.ogg`:

   ```bash
   node <skill>/scripts/voices.mjs --spec devtools/voice_lines.json
   node <skill>/scripts/voices.mjs --spec devtools/voice_lines.json --only INTRO_1,INTRO_2 --force   # regenerate two
   node <skill>/scripts/voices.mjs --spec devtools/voice_lines.json --fx-only                         # new FX, zero cost
   ```
4. Verify: duration, mean and max volume per line, flagging takes that are too short or near-silent:

   ```bash
   node <skill>/scripts/voices.mjs --spec devtools/voice_lines.json --verify
   ```

**Finding voices.** Shared Voice Library voices work in TTS by `voice_id` **without adding them
to the account** (verified with a shared Japanese male voice). Search:
`GET /v1/shared-voices?language=ja&page_size=100&page=N&sort=usage_character_count_1y`, optionally
with `&search=grandma`, `&gender=female`, `&age=old`. The library had almost no elderly Japanese
women, so that role was made with Voice Design (below).

**Settings that worked** (`eleven_multilingual_v2`; `similarity_boost` 0.8 and
`use_speaker_boost` true throughout):

| Role | stability | style |
| --- | --- | --- |
| Acted dialogue | 0.40–0.55 | 0.20–0.45 |
| News anchor, cult chant, formal | 0.70–0.75 | 0.10 |
| "Something imitating a person" (same voice id as the real character) | 0.95 | 0 |

**FX presets** (`voices.mjs`, extendable in the spec's `fx` map). Each one ends in `loudnorm`
so different voices land at the same level:

| fx | Use | Chain |
| --- | --- | --- |
| `clean` | in the room | `loudnorm=I=-18:TP=-2` |
| `narration` | inner voice, narrator | `aecho=0.8:0.4:60:0.08,loudnorm=I=-18:TP=-2` |
| `tape` | cassette, answering machine | `highpass=f=180,lowpass=f=4200,vibrato=f=0.6:d=0.12,acompressor,aecho=0.6:0.3:25:0.1,loudnorm=I=-20:TP=-3` |
| `radio` | radio broadcast | `highpass=f=450,lowpass=f=2800,acrusher=bits=10:mix=0.25,acompressor=threshold=-20dB:ratio=6,loudnorm=I=-19:TP=-3` |
| `phone` | phone call | `highpass=f=350,lowpass=f=3200,acompressor,loudnorm=I=-20:TP=-3` |
| `tv` | TV news | `highpass=f=120,lowpass=f=6000,aecho=0.7:0.3:18:0.15,loudnorm=I=-20:TP=-3` |
| `door` | through a door | `lowpass=f=1600,aecho=0.7:0.5:30\|60:0.25\|0.1,loudnorm=I=-21:TP=-3` |
| `mimic` | a familiar voice that's slightly wrong | `asetrate=44100*0.94,aresample=44100,atempo=1.04,lowpass=f=1500,aecho=0.8:0.6:14\|28:0.35\|0.25,loudnorm=I=-21:TP=-3` |

**Cost.** TTS bills by characters. The dry run and the final report print the count (74 lines
were about 2,025 characters). The raw cache means changing FX or loudness never re-bills, and
`--force` should always come with `--only`.

**Game side.** Map the subtitle key to the file (`assets/audio/voice/<KEY>.ogg`), play it when
the line shows, and hold the subtitle until the audio ends. Subtitles come from the localization
table, so voice lines can stay in the setting's language while the UI is translated.

## Designed voices (Voice Design)

```bash
# 1. Design: writes 3 previews + a JSON (ids, seconds, mean dB). Stops there.
node <skill>/scripts/voice_design.mjs design --name Grandma \
  --description "An 82-year-old grandmother from rural northern Japan. Frail, slightly hoarse, breathy, slow gentle speech, warm but quietly ominous. Native Japanese speaker." \
  --text-file sample_ja.txt --out review/voices/
# 2. The USER listens and picks. Then save that one to the account:
node <skill>/scripts/voice_design.mjs save --name Grandma --description "..." --generated-id <id>
```

- The sample text must be **100–1000 characters**. Shorter returns `422 string_too_short`.
- The original pipeline auto-saved preview 0. An agent can't judge a voice, so the script
  keeps all three and makes saving a separate, human-chosen step.

## Music

1. Copy `assets/music_cues.example.json`. One shared `style` string is prefixed to every cue so
   the score sounds like one composer. Include negative constraints ("no vocals, no choir, no drum
   kit"). For beds and layers, ask for "constant intensity, no ending, suitable for seamless looping".
2. Generate. At most **2 requests in flight**: a third returned `429 concurrent_limit_exceeded`
   on the plan used. The script queues the cues and retries that 429.

   ```bash
   node <skill>/scripts/music_gen.mjs --cues devtools/music_cues.json --dry
   node <skill>/scripts/music_gen.mjs --cues devtools/music_cues.json
   ```
3. Master. Raw generated music comes out hot (−11 to −15 LUFS, true peaks up to +1 dBFS) and
   often trails into silence (one 125 s bed was silent after 122 s):

   ```bash
   node <skill>/scripts/music_analyze.mjs check raw/dread_bed.mp3                  # LUFS, peak, silence
   node <skill>/scripts/music_analyze.mjs pulse raw/dread_bed.mp3 --from 5 --to 60 # base period
   node <skill>/scripts/music_master.mjs loop raw/dread_bed.mp3 assets/audio/music/dread_bed.ogg \
     --start 5 --length 102.85 --xfade 5 --lufs -20                                 # 17 × 6.05 s
   node <skill>/scripts/music_analyze.mjs check assets/audio/music/dread_bed.ogg --loop
   node <skill>/scripts/music_master.mjs normalize raw/main_theme.mp3 assets/audio/music/main_theme.ogg --to 90 --fade-out 6 --lufs -20
   node <skill>/scripts/music_master.mjs split raw/stingers.mp3 assets/audio/music/ --prefix sting_ --lufs -18
   ```

- **Loops:** make the length a whole multiple of the measured pulse. The seam is an
  equal-power crossfade of the tail over the head (`afade curve=qsin`), normalized with a two-pass
  linear `loudnorm`. `check --loop` reports the level jump at the seam (over about 3 dB is audible).
- **`pulse`** prints a **base period**: the shortest lag that scores within 10% of the best.
  The raw top-scored lag is often 2–6× the beat, since multiples correlate almost as well. It
  needs percussive low-end onsets. On a beatless drone it says so, and you choose the length by
  phrase. Sustained pure low tones close in pitch to the kick can still push it to a multiple, so
  treat it as a candidate and confirm the seam with `check --loop`.
- **Stingers:** ask for one long file of separate hits "separated by about two seconds of total
  silence", then `split` on silence. The output is numbered (`sting_01`…). The user listens
  and renames them.
- **Timestamps in a prompt are ignored.** "0–13 s piano … 56–58 s silence … 58 s slam" did not
  produce that structure. Build structured cues such as a trailer (build → silence → hit →
  tail) by cutting and mixing generated pieces with ffmpeg `atrim`/`adelay`/`amix`.

## Licensing and credits

- Paid ElevenLabs plans allow commercial use of the output. The free tier requires attribution and
  doesn't allow commercial use. Confirm the user's plan before shipping.
- Credit one row per voice, listing its files, for example `"license": "ElevenLabs (commercial use with
  paid plan)"`. Generated audio is **not** "attribution required" in the CC sense. If you use the
  `game-assets` credits, add the rows to `credits.json` and rebuild.

## What was verified

| Thing | Status |
| --- | --- |
| TTS `POST /v1/text-to-speech/{voice}` + `eleven_multilingual_v2` + `language_code: "ja"` | verified in the source project (95 lines). Whether `language_code` changes the output wasn't verified; it's accepted without error |
| Shared library voice by id without adding it | verified in the source project |
| Voice Design `POST /v1/text-to-voice/design` (100–1000 chars) + save `POST /v1/text-to-voice` | verified in the source project; limits match the current API reference |
| Music `POST /v1/music` (`music_length_ms` 3000–600000, `force_instrumental`) | verified in the source project; the API reference also lists `model_id` (`music_v1` default) and `composition_plan` |
| 2-concurrent music limit | observed on one plan; not in the API reference |
| `/v1/user` 401 on restricted keys | verified in the source project |
| `GET /v1/voices` as a free key check (`check_key.mjs`) | not run live while writing this skill |
| SFX `POST /v1/sound-generation` (`text`, `duration_seconds` 0.5–30, `prompt_influence`, `loop`) | from the API reference only; never used (Freesound CC0 covered every effect) |
| Every script's offline path (spec validation, dry runs, all 8 FX chains, verify flags, loop/cut/split/normalize, pulse, check) | tested with ffmpeg-generated audio while writing this skill |

## Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `400 invalid_unicode` | non-ASCII through `curl` on Windows | use the scripts (Node `fetch`, utf-8 header) |
| `422 string_too_short` | Voice Design sample under 100 characters | longer sample text |
| `401 missing_permissions` (`user_read`) | restricted key on a `/v1/user*` endpoint | check with `check_key.mjs`, or just generate |
| `429 concurrent_limit_exceeded` | more than 2 music requests in flight | `music_gen.mjs` queues; don't parallelize by hand |
| a voice line ends early or is silent | truncated take | `voices.mjs --verify`, then `--only KEY --force` |
| `loudnorm produced no measurement` | input has no audio stream, or is empty | check the file with `ffprobe` |
