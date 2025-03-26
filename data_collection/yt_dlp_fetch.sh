#!/bin/bash

# File containing playlist URLs (one per line)
playlist_file="/data/chess_prj/playlists.txt"

while IFS= read -r playlist; do
    yt-dlp -o "/data/chess_prj/videos/%(playlist_id)s_____%(id)s_____%(title)s.%(ext)s" \
        --download-archive /data/chess_prj/yt_dlp_archive.txt \
        --merge-output-format mp4 \
        "$playlist"
done < "$playlist_file"
