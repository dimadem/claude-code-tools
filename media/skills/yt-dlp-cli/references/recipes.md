# yt-dlp recipes

Flag syntax verified against yt-dlp 2026.07.04. Add `--print after_move:filepath` to any download whose output path is needed downstream.

## Video

```sh
yt-dlp -f "bv*[height<=1080]+ba/b" -o "%(title)s.%(ext)s" "URL"        # cap at 1080p
yt-dlp -t mp4 "URL"                                                    # H.264/AAC mp4, Apple-safe
yt-dlp -f "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/b[ext=mp4]" "URL"        # explicit H.264 + AAC
yt-dlp -S "res:720,fps,codec:av01" "URL"                               # ≤720p, then fps, then AV1
yt-dlp -f "b[filesize<50M]/bv*[filesize<50M]+ba" "URL"                 # size-bounded
```

"Requested format not available" → run `-F "URL"` first; the site may publish nothing matching the filter.

## Audio

```sh
yt-dlp -t mp3 "URL"                                    # preset: best audio → mp3
yt-dlp -x --audio-format opus --audio-quality 0 "URL"  # best-quality opus
yt-dlp -x --audio-format m4a --embed-thumbnail --embed-metadata "URL"   # tagged m4a with cover
yt-dlp -f "ba[ext=m4a]" "URL"                          # native stream, no re-encode
```

`--audio-quality`: 0 (best) … 10 (worst), default 5; a bitrate string like `192K` forces CBR.

## Deterministic output

```sh
yt-dlp -P /target/dir -o "%(id)s.%(ext)s" --print after_move:filepath --no-progress "URL"
yt-dlp -P "temp:/fast/scratch" -P "home:/archive" \
  -o "%(channel)s/%(upload_date>%Y-%m-%d)s - %(title)s.%(ext)s" "URL"
yt-dlp --exec after_move:'ffprobe -v error -show_entries format=duration -of csv=p=0 %(filepath)q' "URL"
```

## Playlists & channels

```sh
yt-dlp -I 1:10 "PLAYLIST_URL"                                       # first 10 entries
yt-dlp --no-playlist "URL"                                          # single video from a playlist URL
yt-dlp -o "%(playlist_index)03d - %(title)s.%(ext)s" "PLAYLIST_URL" # ordered numbering
yt-dlp -a urls.txt -i -P /target/dir                                # batch file, skip failures

# channel sync — rerun anytime, fetches only new uploads
yt-dlp --download-archive archive.txt --break-on-existing --lazy-playlist \
  -o "%(upload_date>%Y-%m-%d)s - %(title)s.%(ext)s" "CHANNEL_URL"
```

## Sections & chapters

```sh
yt-dlp --download-sections "*1:30-4:00" --force-keyframes-at-cuts "URL"   # exact range
yt-dlp --download-sections "*10:15-inf" "URL"                             # point to end
yt-dlp --download-sections "intro" "URL"                                  # chapters by regex
yt-dlp --split-chapters -o "chapter:%(section_number)02d - %(section_title)s.%(ext)s" "URL"
yt-dlp --sponsorblock-remove default "URL"                                # drop sponsor segments
```

Without `--force-keyframes-at-cuts` boundaries snap to keyframes and drift by seconds.

## Subtitles

```sh
yt-dlp --list-subs "URL"                                              # what exists
yt-dlp --write-subs --sub-langs "en,ru" --convert-subs srt "URL"      # sidecar .srt
yt-dlp --write-auto-subs --sub-langs "en.*" --convert-subs srt --skip-download "URL"   # transcript only
yt-dlp --embed-subs --sub-langs "en" -t mkv "URL"                     # muxed in
```

## Auth & blocked content

```sh
yt-dlp --cookies-from-browser firefox "URL"           # lock-free profile, safest default
yt-dlp --cookies-from-browser "chrome:Profile 1" "URL"
yt-dlp --cookies cookies.txt "URL"                    # Netscape jar
yt-dlp --proxy socks5://127.0.0.1:1080 "URL"
yt-dlp --impersonate chrome "URL"                     # needs curl_cffi
```

## Inspect without downloading

```sh
yt-dlp -F "URL"                                                     # format table
yt-dlp -j "URL" | jq '{title, duration, uploader, formats: (.formats | length)}'
yt-dlp --print "%(title)s | %(duration_string)s | %(upload_date)s" "URL"
yt-dlp --flat-playlist -j "PLAYLIST_URL" | jq -r '.url'             # entry URLs, no per-entry resolve
```

## Rate limiting

```sh
yt-dlp -r 2M -N 4 "URL"                                              # 2 MB/s cap, 4 fragments
yt-dlp -t sleep "CHANNEL_URL"                                        # preset: polite bulk pacing
yt-dlp --sleep-interval 10 --max-sleep-interval 30 -a urls.txt
```

## Failure recovery

```sh
yt-dlp -U                                # stale extractors are the usual cause
yt-dlp --update-to nightly               # unreleased extractor fixes
yt-dlp --update-to stable@2026.01.15     # pin after a regression
yt-dlp -v "URL" 2>&1 | tail -40          # verbose traceback
```
