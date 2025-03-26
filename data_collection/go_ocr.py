import paddleocr
import glob
import os.path
import json
import tqdm
import paddle
import re
import shutil
import logging

# Create a file handler
file_handler = logging.FileHandler("/data/chess_prj/paddleocr_logs.txt")
file_handler.setLevel(logging.DEBUG)

# Get PaddleOCR logger
logger = logging.getLogger("ppocr")

# Remove any existing handlers (if necessary)
logger.handlers = []

# Add the file handler
logger.addHandler(file_handler)
logger.propagate = False  # Prevent logs from being printed to console
paddle.set_device("gpu")
ocr = paddleocr.PaddleOCR(lang="en", use_angle_cls=False)
OCR_OUT_DIR = "/data/chess_prj/ocr"

for ss_done_fname in tqdm.tqdm(glob.glob("/data/chess_prj/screenshots/*.done")):
    ocr_done_fname = os.path.join(OCR_OUT_DIR, os.path.basename(ss_done_fname))
    if os.path.exists(ocr_done_fname):
        continue
    else:
        ocr_WIP_fname = ocr_done_fname[:-5] + ".WIP"
        with open(ocr_WIP_fname, "wt", encoding="utf8") as fp:
            png_fnames = glob.glob(ss_done_fname[:-5] + "*.png")
            for png_fname in tqdm.tqdm(png_fnames, desc=ocr_done_fname):
                png_timestamp = int(
                    re.match(".*_(?P<timestamp>\d+).png$", png_fname)["timestamp"]
                )
                ocr_data = ocr.ocr(png_fname, cls=False)
                fp.write(f"{png_timestamp} {json.dumps(ocr_data)}\n")
        shutil.move(ocr_WIP_fname, ocr_done_fname)
