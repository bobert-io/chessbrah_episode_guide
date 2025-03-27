set -x
set -e

python3 fetch_games.py
python3 -c "import pandas as pd; open('/data/chess_prj/playlists.txt','wt').write('\n'.join(pd.read_csv('/data/chess_prj/data_sources.csv').playlist.tolist())+'\n')"
./yt_dlp_fetch.sh || true
./take_screenshots.sh
python3 ./go_ocr.py
python3 ./make_book.py
