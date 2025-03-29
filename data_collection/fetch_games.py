import requests
import json
import os
import pandas as pd
import time
import glob
import datetime

current_year = datetime.datetime.utcnow().year
current_month = datetime.datetime.utcnow().month

data_sources_df = pd.read_csv("/data/chess_prj/data_sources.csv")

CHESSCOM_JSON_FOLDER = "/data/chess_prj/games/"

headers = {"User-Agent": "bob@bobert.io"}
usernames = data_sources_df.gm_username.unique()

# Gather the archives. Avoid downloaind archives as much as possible because earlier archives are better.
# The reason is that people change usernames and we lose the ability to find their games.
for username in usernames:
    print(username)
    resp = requests.get(
        f"https://api.chess.com/pub/player/{username}/games/archives", headers=headers
    )
    assert resp.status_code == 200
    archive_urls = json.loads(resp.text)["archives"]
    for archive_url in archive_urls:
        print(archive_url)
        archive_year = int(archive_url.split("/")[7])
        archive_month = int(archive_url.split("/")[8])

        PART_fname = os.path.join(
            CHESSCOM_JSON_FOLDER,
            "archives",
            f"{username}_{archive_year:04}{archive_month:02}.PART.json",
        )
        DONE_fname = os.path.join(
            CHESSCOM_JSON_FOLDER,
            "archives",
            f"{username}_{archive_year:04}{archive_month:02}.DONE.json",
        )

        if os.path.exists(DONE_fname):
            continue
        resp = requests.get(archive_url, headers=headers)
        assert resp.status_code == 200

        if (archive_year < current_year) or (
            archive_year == current_year and archive_month < current_month
        ):
            # The archive is certainly in the past. save as DONE and delete the WIP if it exists
            output_fname = DONE_fname
            try:
                os.remove(PART_fname)
            except FileNotFoundError:
                pass
        else:
            # The archive is not nessicarily final. save as WIP.
            output_fname = PART_fname
        with open(output_fname, "wt", encoding="utf8") as fp:
            fp.write(resp.text)


# Now make the final outputs
for username in usernames:
    print(username)
    archive_fnames = glob.glob(
        os.path.join(CHESSCOM_JSON_FOLDER, "archives", f"{username}*.json")
    )
    games = []
    for archive_fname in archive_fnames:
        with open(archive_fname, "rt", encoding="utf8") as fp:
            data = json.load(fp)
        games.extend(data["games"])
    with open(
        os.path.join(CHESSCOM_JSON_FOLDER, f"{username}.json"), "wt", encoding="utf8"
    ) as fp:
        json.dump(games, fp)
