set -x
set -e

python3 fetch_games.py

# Extremely dirty hack because systemplayer had its name changed on chess.com to systematic
rm /data/chess_prj/games/systemplayer.json
cat /data/chess_prj/games/systematic.json | sed 's/systematic/systemplayer/g' > /data/chess_prj/games/systemplayer.json # This is probably all kinds of wrong somehow -- but good nuff

python3 -c "import pandas as pd; open('/data/chess_prj/playlists.txt','wt').write('\n'.join(pd.read_csv('/data/chess_prj/data_sources.csv').playlist.tolist())+'\n')"
./yt_dlp_fetch.sh || true
./take_screenshots.sh
python3 ./go_ocr.py
python3 ./make_book.py
