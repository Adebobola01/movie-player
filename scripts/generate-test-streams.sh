#!/usr/bin/env bash
# Generates a local HLS test stream with a 360p/720p/1080p ladder and a
# WebVTT subtitle track, written to public/streams/ (served by `npm run dev`).
# Requires ffmpeg.
set -euo pipefail

OUT="$(dirname "$0")/../public/streams"
DURATION="${DURATION:-60}"

command -v ffmpeg >/dev/null || { echo "ffmpeg is required (e.g. sudo apt install ffmpeg)"; exit 1; }

rm -rf "$OUT" && mkdir -p "$OUT"

# Synthetic source: test pattern with a running timestamp, plus a tone.
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=${DURATION}" \
  -f lavfi -i "sine=frequency=440:duration=${DURATION}" \
  -filter_complex "[0:v]drawtext=text='%{pts\\:hms}':fontsize=64:fontcolor=white:box=1:boxcolor=black@0.6:x=40:y=40,split=3[v1][v2][v3]; \
    [v1]scale=-2:360[v360]; [v2]scale=-2:720[v720]; [v3]scale=-2:1080[v1080]" \
  -map "[v360]" -map "[v720]" -map "[v1080]" -map 1:a -map 1:a -map 1:a \
  -c:v libx264 -preset veryfast -g 60 -keyint_min 60 -sc_threshold 0 \
  -b:v:0 800k  -maxrate:v:0 856k  -bufsize:v:0 1200k \
  -b:v:1 2800k -maxrate:v:1 2996k -bufsize:v:1 4200k \
  -b:v:2 5000k -maxrate:v:2 5350k -bufsize:v:2 7500k \
  -c:a aac -b:a 128k -ac 2 \
  -f hls -hls_time 4 -hls_playlist_type vod \
  -hls_segment_filename "$OUT/%v/seg_%03d.ts" \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0,name:360p v:1,a:1,name:720p v:2,a:2,name:1080p" \
  "$OUT/%v/index.m3u8"

# Sidecar subtitles for testing subtitle loading.
{
  echo "WEBVTT"
  echo
  for ((i = 0; i < DURATION; i += 5)); do
    printf '%02d:%02d.000 --> %02d:%02d.000\nSubtitle cue at %d seconds\n\n' \
      $((i / 60)) $((i % 60)) $(((i + 4) / 60)) $(((i + 4) % 60)) "$i"
  done
} > "$OUT/en.vtt"

echo "Test stream written to $OUT/master.m3u8"
