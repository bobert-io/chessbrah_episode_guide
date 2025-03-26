FROM nvidia/cuda:12.2.2-cudnn8-devel-ubuntu22.04
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    wget \
    apt-file \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libjpeg-dev \
    libpng-dev \
    libtiff-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/* &&\ 
    python3 -m venv /opt/venv &&\
    /opt/venv/bin/pip install --no-cache-dir yt-dlp &&\
    apt-file update &&\
    pip3 install --upgrade pip && \
    pip3 install paddlepaddle-gpu==2.6.2 && \
    pip3 install paddleocr opencv-python && \
    pip3 install ipython  chess rapidfuzz

RUN pip3 install pandas jupyterlab ipython
RUN pip3 install matplotlib
RUN pip3 install pillow

WORKDIR /app

ARG USERNAME=chess_prj
ARG UID=1000
ARG GID=1000

# Create group and user
RUN groupadd --gid $GID $USERNAME && \
    useradd --uid $UID --gid $GID --create-home --shell /bin/bash $USERNAME &&\
    groupadd wheel && usermod -aG wheel $USERNAME 

USER $USERNAME

RUN python3 -c "from paddleocr import PaddleOCR ; PaddleOCR(use_angle_cls=False, lang='en')"

COPY script.sh /app/
COPY fetch_games.py /app
COPY yt_dlp_fetch.sh /app
COPY take_screenshots.sh /app
COPY go_ocr.py /app
COPY make_book.py /app
COPY chess_prj.py /app

CMD ["/usr/bin/bash", "script.sh"]
