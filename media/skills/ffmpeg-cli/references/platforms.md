# Platform notes: hardware encode & decode

Availability follows the build, not the OS:

```sh
ffmpeg -encoders | grep -iE "videotoolbox|nvenc|qsv|vaapi|amf"
ffmpeg -hwaccels
```

HW encoders trade quality-per-bit for speed and ignore `-crf`. SW when size matters, HW when wall-clock matters.

## macOS

| Item | Value |
|---|---|
| Video encode | `hevc_videotoolbox`, `h264_videotoolbox`, `prores_videotoolbox` |
| Quality | `-q:v 1–100` (65–85 usable) where constant quality is supported, else `-b:v 8M` |
| Fallback | `-allow_sw true` permits software encode instead of failing |
| HEVC tag | `-tag:v hvc1` — Apple players reject `hev1` |
| Audio | `aac_at`, `alac_at`, `pcm_alaw_at`, `pcm_mulaw_at`, `ilbc_at` (AudioToolbox) |
| Decode | `-hwaccel videotoolbox` |
| Metal filters (8.0+) | `scale_vt`, `yadif_videotoolbox`, `transpose_vt` |

```sh
ffmpeg -i in.mp4 -c:v hevc_videotoolbox -q:v 70 -tag:v hvc1 -c:a copy out.mp4
ffmpeg -hwaccel videotoolbox -i in.mp4 -c:v h264_videotoolbox -b:v 8M -c:a aac out.mp4
```

Homebrew's build has no libass and no libfdk_aac.

## Linux

| Vendor | Encoders | Quality | Decode |
|---|---|---|---|
| NVIDIA | `h264_nvenc`, `hevc_nvenc`, `av1_nvenc` | `-cq 19–28`, `-preset p1…p7` | `-hwaccel cuda` |
| Intel | `h264_qsv`, `hevc_qsv`, `av1_qsv` | `-global_quality` | `-hwaccel qsv` |
| Intel/AMD (VAAPI) | `h264_vaapi`, `hevc_vaapi` | `-qp` | `-hwaccel vaapi` |

```sh
ffmpeg -i in.mp4 -c:v hevc_nvenc -cq 24 -preset p5 -c:a aac out.mp4
ffmpeg -vaapi_device /dev/dri/renderD128 -i in.mp4 -vf 'format=nv12,hwupload' -c:v h264_vaapi out.mp4
```

VAAPI requires `-vaapi_device` plus `format=nv12,hwupload` in `-vf`. No system AAC encoder — use built-in `aac` or `libfdk_aac` where compiled in (non-free).

## Windows

| Vendor | Encoders | Quality |
|---|---|---|
| NVIDIA | NVENC, as on Linux | `-cq`, `-preset p1…p7` |
| AMD | `h264_amf`, `hevc_amf`, `av1_amf` | `-quality`, `-qp_i` / `-qp_p` |
| Intel | QSV, as on Linux | `-global_quality` |

Decode: `-hwaccel d3d11va` (modern), `-hwaccel dxva2` (legacy), `-hwaccel cuda` / `-hwaccel qsv`. Audio: built-in `aac` or `libfdk_aac`. Paths: quote them or use forward slashes — backslashes escape inside filter graphs.
