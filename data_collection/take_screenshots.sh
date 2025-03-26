#!/usr/bin/env bash

set -e

# Customize these paths:
INPUT_DIR="/data/chess_prj/videos/"
OUTPUT_DIR="/data/chess_prj/screenshots/"

# Create output directory if it doesn’t exist
mkdir -p "$OUTPUT_DIR"

# Loop over all MP4 files in the input directory
for input_video in "$INPUT_DIR"/*.mp4; do
    # Get the basename (filename without extension)
    basename="$(basename "$input_video" .mp4)"
    done_file="$OUTPUT_DIR/${basename}.done"

    # If there's a .done file for this video, skip
    if [ -f "$done_file" ]; then
        echo "==> Skipping '$basename' (already completed)"
        continue
    fi

    echo "==> Processing '$basename'..."

    # 1) Extract frames every 5 seconds into temporary PNGs
    #    The filter "select='not(mod(t,5))'" picks frames at t=0,5,10,...
    #    -fps_mode passthrough is the equivalent of the old -vsync 0.
    ffmpeg -y -i "$input_video" \
      -vf "select='not(mod(t,5))'" \
      -vsync 0 \
      "$OUTPUT_DIR/${basename}.temp_%06d.png"

    # Check FFmpeg’s exit status
    if [ $? -ne 0 ]; then
        echo "!! FFmpeg failed on '$basename'. Skipping rename."
        # Do not create the .done file so we re-try next time
        continue
    fi

    # 2) Rename each temp file to include the correct time offset in seconds
    count=0
    for temp_file in "$OUTPUT_DIR/${basename}.temp_"*.png; do
        # offset in seconds = 5 * (frame_index)
        offset=$(( 5 * count ))
        mv "$temp_file" "$OUTPUT_DIR/${basename}_${offset}.png"
        count=$(( count + 1 ))
    done

    # 3) Mark this video as done so we skip it in future runs
    touch "$done_file"

    echo "==> Finished '$basename'."
done

echo "All done!"
