---
name: ffmpeg-cli
description: Run ffmpeg/ffprobe from the shell to transcode, compress, resize, trim, concat, mux, filter, extract audio, grab frames, or build GIFs. Use whenever the user asks to invoke "ffmpeg" or to convert/cut/concat/resize/compress/extract/mux media.
---

Binary: `which ffmpeg` — `/opt/homebrew/bin/ffmpeg` (macOS), `/usr/bin/ffmpeg` (Linux); install `brew install ffmpeg` / `apt install ffmpeg`. Version: `ffmpeg -version`, HW filters need 8.0+. Companion: `ffprobe`. Capabilities follow build flags, not the OS — Homebrew's build has no libass, so `subtitles`/`ass` burn-in filters are absent. Verify with `ffmpeg -encoders` / `-filters` / `-hwaccels`.

# Mental model

```
inputs → -map → filters (-vf / -af / -filter_complex) → codecs (-c:v / -c:a) → output
```

- Flags before `-i` bind to that input; flags before the output filename bind to the output.
- `-ss` before `-i` = fast seek, frame-inexact on re-encode. After `-i` = exact, decodes from start.
- `-c copy` rejects filters and pixel-format changes. Any `-vf` / `-af` forces a re-encode.
- No `-map` = one best stream per type; extra audio tracks, subtitles, attachments are dropped silently. `-map 0` keeps everything.
- Container change alone is not a remux: `-i in.mp4 out.mkv` re-encodes into muxer defaults (h264 → libx264, aac → ac3). Remux = `-c copy`.

# Agent defaults

```sh
ffmpeg -hide_banner -nostdin -y -loglevel warning -stats ...
```

| Flag | Why |
|---|---|
| `-nostdin` | ffmpeg reads stdin; background jobs and shell loops lose input without it |
| `-y` | existing output otherwise prints `Overwrite? [y/N]` and exits `Not overwriting`; `-n` = never clobber |
| `-hide_banner -loglevel warning` | drops build dump and stream listing; keeps logs cheap to read back |
| `-stats` | keeps the progress line at any loglevel |

- Output path must never equal an input path — ffmpeg truncates the file it is reading. Write temp, then move.
- Validate flags on a `-t 5` slice before the full run.

# Minimal command

```sh
ffmpeg -i in.mp4 -map 0 -c copy out.mkv                     # true remux, every stream kept
ffmpeg -i in.mp4 -c:v libx264 -crf 20 -c:a aac out.mp4      # transcode, cross-platform
ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height \
  -of default=noprint_wrappers=1 in.mp4                     # inspect first
```

# Knobs by group

Codecs & quality:
- `-c:v` / `-c:a` — `copy` to remux. SW: `libx264`, `libx265`, `libsvtav1`, `libvpx-vp9`, `aac`, `libopus`, `libmp3lame`, `flac`, `alac`. HW: `references/platforms.md`.
- `-crf N` — libx264 ≈18, libx265 ≈23, libsvtav1 ≈30; libvpx-vp9 needs `-crf N -b:v 0`; HW encoders ignore it.
- `-preset` — SW only: `slow` / `medium` / `fast`; libsvtav1 takes a number.
- `-b:v` / `-b:a` — bitrate target; the only control on HW encoders without constant-quality mode.

Streams & timing:
- `-map 0` all streams · `-map 0:v:0` first video · `-map -0:s` all except subtitles.
- `-ss` / `-t` / `-to` — seek / duration / end point.
- `-vn` / `-an` / `-sn` — drop video / audio / subtitles.
- `-shortest` — end at the shortest input. `-frames:v N` — stop after N frames.

Filters:
- `-vf` / `-af` single-input chain; `-filter_complex` only for multi-input or multi-output graphs.
- `scale=-2:720` — height 720, width auto-rounded even.
- `-pix_fmt yuv420p` — player compatibility (`yuv420p10le` for 10-bit).
- `-fps_mode vfr|cfr|passthrough` — frame duplication policy (`-vsync` is the deprecated spelling).

Delivery:
- `-tag:v hvc1` — required for HEVC in the Apple ecosystem (default `hev1`).
- `-movflags +faststart` — moov atom to file start, for web streaming.
- `-c:s mov_text` (mp4) / `-c:s srt` (mkv) — subtitle codec when muxing text subs.
- `-hwaccel <api>` — HW decode, independent of encoder choice.

# Recipes

- `references/recipes.md` — remux, trim, concat, resize, compress, audio, loudnorm, frames, GIF, subtitles, speed, verification.
- `references/platforms.md` — HW encoder/decoder names and quality flags per OS.

# Read it locally

```sh
ffmpeg -h encoder=<name>             # libx264, hevc_nvenc, hevc_videotoolbox
ffmpeg -h filter=<name>              # scale, concat, palettegen, loudnorm
ffmpeg -encoders | grep -i <kw>      # what this build has
ffmpeg -filters  | grep -i <kw>
ffmpeg -hwaccels
ffprobe -show_streams -i file.mp4     # codecs, pix_fmt, duration, track count
ffprobe -select_streams v -skip_frame nokey -show_entries frame=pts_time -of csv=p=0 file.mp4   # keyframes
```

# Long-running calls

Re-encodes of large files or SW codecs (libx265, libsvtav1, libvpx-vp9) run minutes to hours — never in the foreground.

- Fire-and-forget: `Bash` with `run_in_background: true`, both streams to a log (`ffmpeg ... > /tmp/ffmpeg.log 2>&1`); progress goes to stderr. Check log + output file on the completion notification.
- Live progress: `-progress pipe:1 -nostats` (replaces `-stats`), stdout piped into `Monitor` → `key=value` lines (`frame`, `out_time_us`, `speed`, `progress=continue|end`) instead of the `\r` bar.
- No `-hwaccel`, `-preset`, or explicit encoder unless the task requires it.

# Gotchas

- `-c copy` cannot cut precisely — it snaps to the preceding keyframe. Measured: `-ss 2 -t 2` copy on a 6 s clip with one keyframe at 0.0 → 4.09 s output. Check `ffprobe -skip_frame nokey`; re-encode for exact boundaries.
- Odd dimensions abort yuv420p encodes: `scale=241:-1` → `width not divisible by 2`. Use `-2` on the computed axis.
- `out_time_ms` in `-progress` output is microseconds, identical to `out_time_us`. Divide by 1e6 for seconds.
- Burn-in needs libass; absent in Homebrew's build. Soft-mux instead: `-map 1 -c:s mov_text` (mp4) / `-c:s srt` (mkv).
- HW encoders ignore `-crf` silently and fall back to a default bitrate.
- The concat demuxer requires identical codecs, resolution, and timebase. Mixed sources need the concat filter with `scale` + `setsar` normalization.
