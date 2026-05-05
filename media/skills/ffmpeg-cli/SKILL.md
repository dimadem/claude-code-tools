---
name: ffmpeg-cli
description: Run ffmpeg from the shell for transcoding, trimming, muxing, filtering, or extracting audio/video. Use whenever the user asks to invoke "ffmpeg" or to convert/cut/concat/extract/mux media.
---

Binary: locate with `which ffmpeg` (typical paths: `/opt/homebrew/bin/ffmpeg` on macOS Homebrew, `/usr/bin/ffmpeg` on Linux, varies on Windows). Confirm version with `ffmpeg -version` — many of the newer HW filters need 8.0+. Companion: `ffprobe` for inspection.

# Mental model

Every call is a graph: `inputs → -map → filters (-vf / -af / -filter_complex) → codecs (-c:v / -c:a) → output`. Two rules that bite:

- **Argument order matters.** Flags before `-i` apply to that input (e.g. `-ss` before `-i` = fast but inaccurate seek; after `-i` = accurate but decodes from start). Flags before the output filename apply to the output.
- **`-c copy` vs re-encode.** Stream-copying is near-instant and lossless but disallows filters/conversion. Any `-vf` / `-af` / pixel-format change forces re-encoding.

# Minimal command

```sh
ffmpeg -i input.mp4 output.mkv                            # remux by container change
ffmpeg -i in.mp4 -c:v libx264 -crf 20 -c:a aac out.mp4    # transcode (cross-platform)
```

# Pick the right knobs

Add only what the task needs:

- `-c:v / -c:a <codec>` — `copy` to remux; SW (cross-platform): `libx264` / `libx265` / `libsvtav1` / `libvpx-vp9` / `aac` / `libopus` / `libmp3lame` / `flac` / `alac`. HW encoders are platform-specific — see "Platform notes" below.
- Quality knob depends on encoder: libx264/x265/svtav1 use `-crf` (≈18 / ≈23 / ≈30); libvpx-vp9 uses `-crf` with `-b:v 0`; HW encoders take a quality scale (`-q:v`, `-cq`, …) — check `ffmpeg -h encoder=<name>`.
- `-preset` — speed/quality tradeoff for SW encoders only (`slow` / `medium` / `fast`; svtav1 takes a number).
- `-vf` / `-af` / `-filter_complex` — filter graph; use `_complex` only for multi-input or multi-output graphs.
- `-map` — explicit stream selection; required for multi-input muxing or to drop streams.
- `-ss` / `-t` / `-to` — seek and duration; remember the before/after `-i` rule.
- `-hwaccel <api>` — hardware decode (orthogonal to encoder choice; `<api>` is platform-specific).
- `-tag:v hvc1` — required for HEVC playback in Apple ecosystem (default tag is `hev1`).
- `-movflags +faststart` — moves moov atom to file start for web/streaming.
- `-pix_fmt yuv420p` — compatibility for non-pro players (use `yuv420p10le` for 10-bit).
- `-vn` / `-an` / `-sn` — drop video / audio / subtitle stream.
- `-y` / `-n` — overwrite / never overwrite (safer in batch loops).

For everything else (full flag list, per-encoder/per-filter options, container quirks) read it locally:

```sh
ffmpeg -h encoder=<name>             # e.g. libx264, hevc_nvenc, hevc_videotoolbox
ffmpeg -h filter=<name>              # e.g. scale, tonemap, concat, palettegen
ffmpeg -encoders | grep -i <kw>      # what's compiled in on this machine
ffmpeg -hwaccels                     # which HW APIs the build supports
ffmpeg -formats   | grep -i <kw>
ffprobe -show_streams -i file.mp4    # inspect codecs, pix_fmt, duration
```

# Long-running calls

Re-encoding large files or SW codecs (libx265, libsvtav1, libvpx-vp9) takes minutes-to-hours. Don't block the chat:

- **Default — fire and forget**: invoke through `Bash` with `run_in_background: true`. Redirect both streams to a log (`ffmpeg ... > /tmp/ffmpeg.log 2>&1`) — ffmpeg writes its progress bar to stderr. The harness notifies on exit; check the log and the output file then.
- **Live progress through `Monitor`**: pass `-progress pipe:1 -nostats` and pipe stdout into `Monitor`. That emits clean `key=value` lines (`frame`, `out_time_ms`, `speed`, `progress=continue|end`) at each status interval, instead of the `\r`-overwriting stderr bar that's unreadable as notifications.

Don't force `-hwaccel`, `-preset`, or specific encoders unless the task actually requires them — let the codec/container defaults stand.

# Platform notes

Always confirm what's actually available with `ffmpeg -encoders` and `ffmpeg -hwaccels` — the list depends on how the binary was built, not just the OS.

- **macOS (Apple Silicon / Intel).** HW encode: `hevc_videotoolbox`, `h264_videotoolbox`, `prores_videotoolbox` (use `-q:v 1–100`, 65–85 sweet spot; add `-allow_sw true` for SW fallback and `-tag:v hvc1` for HEVC). Native audio: `aac_at`, `alac_at` (AudioToolbox). HW decode: `-hwaccel videotoolbox`. Metal GPU filters in 8.0+: `scale_vt`, `yadif_videotoolbox`, `transpose_vt`.
- **Linux.** HW encode depends on GPU: NVIDIA → `h264_nvenc` / `hevc_nvenc` / `av1_nvenc` (`-cq` for quality, `-preset p1…p7`); Intel → `h264_qsv` / `hevc_qsv` / `av1_qsv`; Intel/AMD via VAAPI → `h264_vaapi` / `hevc_vaapi` (needs `-vaapi_device /dev/dri/renderD128` and `format=nv12,hwupload` in `-vf`). HW decode: `-hwaccel cuda` / `-hwaccel qsv` / `-hwaccel vaapi`. No system AAC encoder — use built-in `aac` or `libfdk_aac` if compiled (non-free).
- **Windows.** HW encode: NVIDIA → NVENC (same as Linux); AMD → `h264_amf` / `hevc_amf` / `av1_amf`; Intel → QSV (same as Linux). HW decode: `-hwaccel d3d11va` (modern), `-hwaccel dxva2` (legacy), or `-hwaccel cuda` / `-hwaccel qsv`. Audio: built-in `aac` or `libfdk_aac`. Watch for backslashes in paths — quote them or use forward slashes.
