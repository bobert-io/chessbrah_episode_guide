docker build -t chess_prj . 

docker run --gpus all -v /data/chess_prj/:/data/chess_prj/ chess_prj 
