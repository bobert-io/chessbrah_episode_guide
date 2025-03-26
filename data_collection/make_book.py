import chess
import pandas as pd
import chess_prj
import rapidfuzz
import numpy as np
import PIL
import PIL.Image
import PIL.ImageDraw
import os
import os.path
import matplotlib.pyplot as plt
import tempfile
import subprocess
import json
import tqdm
import io
import collections

dfs = chess_prj.make_dfs(
    "/data/chess_prj/games/",
    "/data/chess_prj/ocr/",
    CDIST_THRESHOLD=80,
    last4_agree=True,
)
final_df = dfs['final_df']

fen_counter = collections.Counter()
for idx, row in tqdm.tqdm(final_df.iterrows()):
    pgn = row["pgn"]
    game = chess.pgn.read_game(io.StringIO(pgn))
    board = game.board()
    for move in game.mainline_moves():
        board.push(move)
        fen = board.fen()
        fen_counter[fen] += 1


book = {
    "series": {},
    "games": {},
    "White": {},
    "Black": {},
}

TTL_PAST_UNIQUE = 6
for idx, row in tqdm.tqdm(final_df.iterrows()):
    TTL = float("inf")

    book["games"][str(row["game_id"])] = [
        row["vs_str"],
        row["yt_link"],
        row["player_start_elo"],
    ]
    book["series"].setdefault(row["series_name"], []).append(row['game_id'])

    pgn = row["pgn"]
    game = chess.pgn.read_game(io.StringIO(pgn))
    board = game.board()
    fen = board.fen()
    node = book[row["player_color"]]

    for move in game.mainline_moves():
        move_uci = move.uci()
        board.push(move)
        fen = board.fen()
        if fen_counter[fen] < 2:
            TTL = min(TTL_PAST_UNIQUE, TTL - 1)
        if TTL == 0:
            break
        node.setdefault("game_ids", []).append(row["game_id"])
        node = node.setdefault(move_uci, {})

with open("/data/chess_prj/book.json", "wt") as fp:
    json.dump(book, fp)
