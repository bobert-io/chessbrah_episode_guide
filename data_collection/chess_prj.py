import PIL
from urllib.parse import urlparse, parse_qs
import PIL.Image
import PIL.ImageDraw
import re
import tqdm
import numpy as np
import rapidfuzz
import pandas as pd
import json
import glob
import os
import io
import datetime
import chess.pgn


def get_yt_video_id(xs):
    return os.path.basename(xs)[39 : 39 + 11]


def get_yt_playlist_id(xs):
    return os.path.basename(xs)[:34]


def grab_screenshot(video_path: str, time_offset: float) -> PIL.Image.Image:
    """
    Capture a screenshot from the video at the specified time offset (in seconds)
    using ffmpeg. The screenshot is saved to a temporary PNG file and then loaded
    into a PIL Image, which is returned.

    Args:
        video_path (str): Path to the input video file.
        time_offset (float): Time offset in seconds where the screenshot will be captured.

    Returns:
        Image.Image: The captured frame as a PIL Image.
    """
    # Create a temporary file to hold the screenshot.
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_filename = tmp.name

    try:
        # Build the ffmpeg command:
        # -ss sets the time offset for seeking,
        # -i specifies the input file,
        # -frames:v 1 tells ffmpeg to capture a single frame,
        # -q:v 2 sets a good quality for the image,
        # -y overwrites the output file if it exists.
        cmd = [
            "ffmpeg",
            "-ss",
            str(time_offset),
            "-i",
            video_path,
            "-frames:v",
            "1",
            "-q:v",
            "2",
            "-y",
            tmp_filename,
        ]
        subprocess.run(
            cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
        )

        # Load the image using PIL.
        image = PIL.Image.open(tmp_filename)
        image.load()  # Load the image into memory.
    finally:
        # Clean up the temporary file.
        os.remove(tmp_filename)

    return image


def agg_bboxes(series):
    points_list = series.to_list()
    points_arr = np.array(points_list).reshape(-1, 2)
    xs = points_arr[:, 0]
    ys = points_arr[:, 1]
    right = int(xs.max())
    left = int(xs.min())
    top = int(ys.min())
    bottom = int(ys.max())
    return [[left, top], [right, top], [right, bottom], [left, bottom]]


def make_games_df(json_dir):
    json_fnames = glob.glob(os.path.join(json_dir, "*.json"))
    strptime_fstring = "%Y.%m.%d %H:%M:%S"
    games_dict = {
        "gm_username": [],
        "game_url": [],
        "time_class": [],
        "start_datetime_posix": [],
        "end_datetime_posix": [],
        "year": [],
        "month": [],
        "player_color": [],
        "opponent_end_elo": [],
        "opponent": [],
        "player_end_elo": [],
        "pgn": [],
        "game_id": [],
    }

    starting_fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'


    # json_fname = json_fnames[0]
    for json_fname in json_fnames:
        gm_username = os.path.splitext(os.path.basename(json_fname))[0]
        print(f"{gm_username=}")
        with open(json_fname, "r") as fp:
            games = json.load(fp)
        for game in games:
            if game["initial_setup"] not in [None, '', starting_fen]:
                continue
            assert game["rules"] == "chess"

            headers = chess.pgn.read_headers(io.StringIO(game["pgn"]))

            assert (headers["White"] == gm_username) != (
                headers["Black"] == gm_username
            )

            if headers["White"] == gm_username:
                games_dict["player_color"].append("White")
                games_dict["player_end_elo"].append(int(headers["WhiteElo"]))
                games_dict["opponent_end_elo"].append(int(headers["BlackElo"]))
                games_dict["opponent"].append(headers["Black"])
            else:
                games_dict["player_color"].append("Black")
                games_dict["player_end_elo"].append(int(headers["BlackElo"]))
                games_dict["opponent_end_elo"].append(int(headers["WhiteElo"]))
                games_dict["opponent"].append(headers["White"])

            games_dict["gm_username"].append(gm_username)
            games_dict["game_url"].append(game["url"])
            games_dict["game_id"].append(int(game["url"].split("/")[-1]))
            games_dict["time_class"].append(game["time_class"])

            start_datetime = datetime.datetime.strptime(
                f"{headers['UTCDate']} {headers['StartTime']}", strptime_fstring
            )
            end_datetime = datetime.datetime.strptime(
                f"{headers['EndDate']} {headers['EndTime']}", strptime_fstring
            )

            games_dict["start_datetime_posix"].append(int(start_datetime.timestamp()))
            games_dict["end_datetime_posix"].append(int(end_datetime.timestamp()))

            games_dict["year"].append(start_datetime.year)
            games_dict["month"].append(start_datetime.month)

            games_dict["pgn"].append(game["pgn"])

    games_df = pd.DataFrame(games_dict)
    xx = []
    for time_class, time_class_group in games_df.groupby("time_class"):
        xx.append(
            pd.merge_asof(
                left=time_class_group.sort_values(
                    ["start_datetime_posix", "gm_username", "time_class"]
                ),
                right=time_class_group[
                    [
                        "end_datetime_posix",
                        "gm_username",
                        "time_class",
                        "player_end_elo",
                    ]
                ]
                .rename(columns={"player_end_elo": "player_start_elo"})
                .sort_values("end_datetime_posix"),
                by=[
                    "gm_username",
                    "time_class",
                ],  # Ensures merging happens only within the same user and time class
                left_on="start_datetime_posix",
                right_on="end_datetime_posix",
                direction="backward",
                suffixes=["", "_junk"],
            ).drop(
                columns=["end_datetime_posix_junk"]
            )  # Drop the unnecessary extra column
        )
    games_df = pd.concat(xx, ignore_index=True)

    games_df["player_start_elo"] = (
        games_df["player_start_elo"].fillna(400).astype("int")
    )

    games_df["player_elo_gain"] = (
        games_df["player_end_elo"] - games_df["player_start_elo"]
    )
    games_df["estimated_opponent_start_elo"] = (
        games_df["opponent_end_elo"] + games_df["player_elo_gain"]
    )

    games_df["player_str"] = games_df.apply(
        lambda row: f"{row['gm_username']} ({int(row['player_start_elo'])})", axis=1
    )
    games_df["opponent_str"] = games_df.apply(
        lambda row: f"{row['opponent']} ({int(row['estimated_opponent_start_elo'])})",
        axis=1,
    )

    games_df["player_str"] = games_df["player_str"].astype("category")
    games_df["opponent_str"] = games_df["opponent_str"].astype("category")

    return games_df


def make_ocr_df(ocr_dir):
    ocr_rows = []
    for ocr_txt_fname in tqdm.tqdm(
        glob.glob(os.path.join(ocr_dir, "*.done")), desc="reading ocr txt files"
    ):
        for line in open(ocr_txt_fname, "rt", encoding="utf8"):
            if not line:
                continue
            time_txt, json_txt = line.split(maxsplit=1)
            json_obj = json.loads(json_txt)
            assert len(json_obj) == 1
            json_obj = json_obj[0]
            if json_obj is None:
                continue
            for paddle_record in json_obj:
                bbox, (ocr_str, score) = paddle_record
                ocr_rows.append(
                    dict(
                        time=float(time_txt),
                        fname=ocr_txt_fname,
                        bbox=bbox,
                        ocr_str=ocr_str,
                        score=score,
                    )
                )

    ocr_df = pd.DataFrame(ocr_rows)
    ocr_df["ocr_str"] = ocr_df["ocr_str"].astype("category")
    return ocr_df


def extract_last4_digits(s):
    digits = re.sub(r"\D", "", s)[-4:]
    return int(digits) if digits else 0


def enforce_last4_agree(M, xs, ys):
    xs = np.array([extract_last4_digits(x) for x in xs])
    ys = np.array([extract_last4_digits(y) for y in ys])
    mask = xs[:, None] == ys[None, :]
    return M * mask


def make_ocr_match_dfs(games_df, ocr_df, CDIST_THRESHOLD, last4_agree):
    ocr_str_category = ocr_df["ocr_str"].dtype

    player_str_category = games_df.player_str.dtype
    player_ocr_matrix = rapidfuzz.process.cdist(
        ocr_str_category.categories.to_list(), player_str_category.categories.to_list()
    )
    if last4_agree:
        player_ocr_matrix = enforce_last4_agree(
            player_ocr_matrix,
            ocr_str_category.categories.to_list(),
            player_str_category.categories.to_list(),
        )
    player_ocr_match_df = (
        pd.DataFrame(
            {
                "ocr_str_player": ocr_str_category.categories,
                "player_str": pd.Categorical.from_codes(
                    player_ocr_matrix.argmax(axis=1), dtype=player_str_category
                ),
                "player_ocr_score": player_ocr_matrix.max(axis=1),
            }
        )
        .query(f"player_ocr_score >= {CDIST_THRESHOLD}")
        .reset_index(drop=True)
    )

    opponent_str_category = games_df.opponent_str.dtype
    opponent_ocr_matrix = rapidfuzz.process.cdist(
        ocr_str_category.categories.to_list(),
        opponent_str_category.categories.to_list(),
    )
    if last4_agree:
        opponent_ocr_matrix = enforce_last4_agree(
            opponent_ocr_matrix,
            ocr_str_category.categories.to_list(),
            opponent_str_category.categories.to_list(),
        )
    opponent_ocr_match_df = (
        pd.DataFrame(
            {
                "ocr_str_opponent": ocr_str_category.categories,
                "opponent_str": pd.Categorical.from_codes(
                    opponent_ocr_matrix.argmax(axis=1), dtype=opponent_str_category
                ),
                "opponent_ocr_score": opponent_ocr_matrix.max(axis=1),
            }
        )
        .query(f"opponent_ocr_score >= {CDIST_THRESHOLD}")
        .reset_index(drop=True)
    )
    return player_ocr_match_df, opponent_ocr_match_df


def make_dfs(json_dir, ocr_dir, CDIST_THRESHOLD, last4_agree):
    # Function to extract playlist ID
    def extract_playlist_id(url):
        query_params = parse_qs(urlparse(url).query)
        return query_params.get('list', [None])[0]  # Extract 'list' parameter

    data_sources_df = pd.read_csv("/data/chess_prj/data_sources.csv")
    data_sources_df['yt_playlist_id'] = data_sources_df['playlist'].apply(extract_playlist_id)

    games_df = make_games_df(json_dir)
    ocr_df = make_ocr_df(ocr_dir)
    CDIST_THRESHOLD = 80
    player_ocr_match_df, opponent_ocr_match_df = make_ocr_match_dfs(
        games_df, ocr_df, CDIST_THRESHOLD, last4_agree
    )

    ocr_trimmed_df = ocr_df[
        (
            ocr_df.ocr_str.isin(player_ocr_match_df.ocr_str_player)
            | ocr_df.ocr_str.isin(opponent_ocr_match_df.ocr_str_opponent)
        )
    ]

    ocr_trimmed_self_merged_df = pd.merge(
        ocr_trimmed_df,
        ocr_trimmed_df,
        on=["time", "fname"],
        suffixes=("_player", "_opponent"),
    )
    ocr_double_merged_df = ocr_trimmed_self_merged_df.merge(player_ocr_match_df).merge(
        opponent_ocr_match_df
    )

    games_and_ocr_df = ocr_double_merged_df.merge(
        games_df, on=["player_str", "opponent_str"]
    )

    games_and_ocr_df = games_and_ocr_df.sort_values(["fname", "time", "game_id"])
    games_and_ocr_df["yt_video_id"] = games_and_ocr_df["fname"].map(get_yt_video_id)
    games_and_ocr_df["yt_playlist_id"] = games_and_ocr_df["fname"].map(get_yt_playlist_id)
    games_and_ocr_df["yt_link"] = (
        "https://youtu.be/"
        + games_and_ocr_df["yt_video_id"]
        + "?t="
        + games_and_ocr_df["time"].astype(int).astype(str)
    )

    agged_bboxes_df = games_and_ocr_df.groupby("game_id").agg(
        agged_bbox_player=pd.NamedAgg(column="bbox_player", aggfunc=agg_bboxes),
        agged_bbox_opponent=pd.NamedAgg(column="bbox_opponent", aggfunc=agg_bboxes),
    )

    final_df = games_and_ocr_df.loc[
        games_and_ocr_df.groupby(["game_id"])["time"].idxmin(), :
    ].reset_index(drop=True)
    final_df["vs_str"] = ""
    final_df.loc[final_df["player_color"] == "White", "vs_str"] = (
        final_df["player_str"].astype("str")
        + " vs "
        + final_df["opponent_str"].astype("str")
    )
    final_df.loc[final_df["player_color"] == "Black", "vs_str"] = (
        final_df["opponent_str"].astype("str")
        + " vs "
        + final_df["player_str"].astype("str")
    )
    final_df = final_df.merge(data_sources_df[['yt_playlist_id','series_name']], on='yt_playlist_id')

    # games_and_ocr_df['ss_fname'] = games_and_ocr_df.apply(lambda row: f"/data/chess_prj/screenshots/{os.path.basename(row['fname'])[:-5]}_{int(row['time'])}.png", axis=1)

    return {
        "data_sources_df": data_sources_df,
        "games_df": games_df,
        "ocr_df": ocr_df,
        "player_ocr_match_df": player_ocr_match_df,
        "opponent_ocr_match_df": opponent_ocr_match_df,
        "ocr_double_merged_df": ocr_double_merged_df,
        "games_and_ocr_df": games_and_ocr_df,
        "ocr_trimmed_df": ocr_trimmed_df,
        "agged_bboxes_df": agged_bboxes_df,
        "final_df": final_df,
    }
