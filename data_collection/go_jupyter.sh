docker build -t chess_prj . 

docker run -p 127.0.0.1:8888:8888  -it --gpus all -v /data/chess_prj/:/data/chess_prj/  -v /prj:/prj chess_prj bash -c "cd /; jupyter lab --ip 0.0.0.0"


