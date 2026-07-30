# ffmpeg recipes

Verified on ffmpeg 8.1.2. Agent-default prefix (`-hide_banner -nostdin -y -loglevel warning -stats`) omitted below — add it to every non-interactive run.

## Remux & stream surgery

```sh
ffmpeg -i in.mp4 -map 0 -c copy out.mkv                  # container change, all streams kept
ffmpeg -i in.mkv -map 0:v:0 -map 0:a:0 -c copy out.mp4   # first video + first audio only
ffmpeg -i in.mp4 -map 0 -map -0:s -c copy out.mp4        # everything except subtitles (negative map)
ffmpeg -i in.mp4 -c copy -movflags +faststart web.mp4    # moov atom to file start
```

## Trimming

```sh
ffmpeg -ss 00:01:30 -i in.mp4 -t 60 -c copy -avoid_negative_ts make_zero cut.mp4   # instant, keyframe-snapped
ffmpeg -ss 00:01:30 -i in.mp4 -t 60 -c:v libx264 -crf 20 -c:a aac cut.mp4          # exact, re-encodes
ffmpeg -i in.mp4 -ss 00:01:30 -to 00:02:30 -c:v libx264 -crf 20 -c:a aac cut.mp4   # -to absolute after -i
ffprobe -v error -select_streams v -skip_frame nokey -show_entries frame=pts_time -of csv=p=0 in.mp4   # keyframes
```

Copy-trim starts at the preceding keyframe → real duration can exceed the request.

## Concat

```sh
# same codec, resolution, timebase → demuxer, no re-encode
printf "file '%s'\n" /abs/a.mp4 /abs/b.mp4 > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4

# mixed sources → filter with normalization
ffmpeg -i a.mp4 -i b.mp4 -filter_complex \
  "[0:v]scale=1920:1080,setsar=1[v0];[1:v]scale=1920:1080,setsar=1[v1];[v0][0:a][v1][1:a]concat=n=2:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 20 -c:a aac out.mp4
```

`-safe 0` required for absolute paths; single quotes in the list escape as `'\''`.

## Resize & crop

```sh
ffmpeg -i in.mp4 -vf scale=-2:720 -c:v libx264 -crf 23 -c:a copy 720p.mp4     # height 720, even width
ffmpeg -i in.mp4 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1" \
  -c:v libx264 -crf 23 letterbox.mp4                                          # fit into exact frame
ffmpeg -i in.mp4 -vf crop=w:h:x:y -c:v libx264 -crf 23 -an crop.mp4           # origin top-left
```

## Compress

```sh
ffmpeg -i in.mp4 -c:v libx264 -crf 26 -preset slow -c:a aac -b:a 128k small.mp4     # H.264
ffmpeg -i in.mp4 -c:v libx265 -crf 28 -preset medium -tag:v hvc1 -c:a aac out.mp4   # HEVC, Apple tag
ffmpeg -i in.mp4 -c:v libsvtav1 -crf 32 -preset 6 -c:a libopus out.mkv              # AV1
```

Raise `-crf` before reaching for bitrate targets.

## Audio

```sh
ffmpeg -i in.mp4 -vn -c:a copy track.m4a                       # extract, no re-encode
ffmpeg -i in.mp4 -vn -c:a libmp3lame -q:a 2 track.mp3          # VBR mp3, q 0 (best) – 9
ffmpeg -i in.mp4 -vn -c:a pcm_s16le -ar 16000 -ac 1 speech.wav # 16 kHz mono for ASR
ffmpeg -i v.mp4 -i a.mp3 -map 0:v -map 1:a -c:v copy -c:a aac -shortest dub.mp4   # replace audio
ffmpeg -i v.mp4 -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
  -map 0:v -map 1:a -c:v copy -c:a aac -shortest silent.mp4                       # add silent track
```

Two-pass loudness (EBU R128) — pass 1 prints `measured_*`, pass 2 consumes them:

```sh
ffmpeg -i in.mp4 -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -
ffmpeg -i in.mp4 -af loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-21.81:measured_TP=-17.69:measured_LRA=0.0:measured_thresh=-31.81:linear=true \
  -c:v copy -c:a aac out.mp4
```

Single-pass `loudnorm` is dynamic and less accurate.

## Frames & GIF

```sh
ffmpeg -ss 00:00:03 -i in.mp4 -frames:v 1 -update 1 thumb.jpg          # single frame at a timestamp
ffmpeg -i in.mp4 -vf fps=1 frame_%03d.png                              # one frame per second
ffmpeg -i in.mp4 -vf "select='eq(pict_type,I)'" -fps_mode vfr key_%03d.png   # keyframes only
ffmpeg -framerate 24 -i frame_%03d.png -c:v libx264 -pix_fmt yuv420p seq.mp4 # sequence → video

# GIF: two-pass palette, single-pass output bands visibly
ffmpeg -i in.mp4 -vf "fps=12,scale=480:-2:flags=lanczos,palettegen" palette.png
ffmpeg -i in.mp4 -i palette.png -lavfi "fps=12,scale=480:-2:flags=lanczos[x];[x][1:v]paletteuse" out.gif
```

## Subtitles

```sh
ffmpeg -i in.mp4 -i subs.srt -map 0 -map 1 -c copy -c:s mov_text out.mp4   # soft-mux, mp4
ffmpeg -i in.mp4 -i subs.srt -map 0 -map 1 -c copy -c:s srt     out.mkv    # soft-mux, mkv
ffmpeg -i in.mkv -map 0:s:0 subs.srt                                       # extract a track
ffmpeg -i in.mp4 -vf subtitles=subs.srt -c:v libx264 -crf 20 burned.mp4    # burn-in, needs libass
```

Check burn-in support first: `ffmpeg -filters | grep subtitles`.

## Speed & framerate

```sh
ffmpeg -i in.mp4 -filter_complex "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0[a]" -map "[v]" -map "[a]" -c:v libx264 fast.mp4   # 2×
ffmpeg -i in.mp4 -filter_complex "[0:v]setpts=2.0*PTS[v];[0:a]atempo=0.5[a]" -map "[v]" -map "[a]" -c:v libx264 slow.mp4   # 0.5×
ffmpeg -i in.mp4 -r 30 -c:v libx264 -crf 20 -c:a copy 30fps.mp4
```

`setpts` multiplier and `atempo` factor are inverses. `atempo` takes 0.5–100 per instance — chain for more (`atempo=2.0,atempo=2.0` = 4×).

## Verify

```sh
ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height \
  -of default=noprint_wrappers=1 out.mp4
ffmpeg -v error -i out.mp4 -f null - && echo "decode OK"    # full decode, errors only
```
