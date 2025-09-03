#FROM nvidia/cuda:12.2.2-cudnn8-devel-ubuntu22.04
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/opt/venv/bin:$PATH"


RUN apt-get update && apt-get install -y \
    neovim \
    git \
    wget \
    apt-file \
    curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/* &&\ 
    apt-file update 

RUN apt-get install libgomp1


#RUN apt-get update && apt-get install -y \
#    neovim \
#    python3 \
#    python3-pip \
#    python3-venv \
#    git \
#    wget \
#    apt-file \
#    libgl1 \
#    libglib2.0-0 \
#    ffmpeg \
#    libsm6 \
#    libxext6 \
#    libxrender-dev \
#    libavcodec-dev \
#    libavformat-dev \
#    libswscale-dev \
#    libjpeg-dev \
#    libpng-dev \
#    libtiff-dev \
#    curl \
#    && apt-get clean && rm -rf /var/lib/apt/lists/* &&\ 
#    python3 -m venv /opt/venv &&\
#    /opt/venv/bin/pip install --no-cache-dir yt-dlp &&\
#    apt-file update 


#    pip3 install --upgrade pip && \
#    pip3 install paddlepaddle-gpu==2.6.2 paddleocr==2.7.2 opencv-python ipython  chess rapidfuzz pandas jupyterlab ipython matplotlib pillow ipdb numpy

WORKDIR /app

ARG USERNAME=chess_prj
ARG UID=1000
ARG GID=1000

# Create group and user
RUN groupadd --gid $GID $USERNAME && \
    useradd --uid $UID --gid $GID --create-home --shell /bin/bash $USERNAME &&\
    groupadd wheel && usermod -aG wheel $USERNAME &&\
    chmod -Rfv a+rwX /app

USER $USERNAME


COPY pyproject.toml /app
WORKDIR /app

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
RUN bash -c "source $HOME/.local/bin/env && uv run python3 -c \"import requests; from paddleocr import PaddleOCR ; PaddleOCR(use_angle_cls=False, lang='en'); print('Goodbye!')\" "

USER root
RUN apt-get install ffmpeg -y
USER $USERNAME

COPY script.sh /app/
COPY fetch_games.py /app
COPY yt_dlp_fetch.sh /app
COPY take_screenshots.sh /app
COPY go_ocr.py /app
COPY make_book.py /app
COPY chess_prj.py /app


CMD ["/usr/bin/bash", "script.sh"]
