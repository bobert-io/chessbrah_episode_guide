set -e
docker build -t chess_prj . 

#docker run  -it --gpus all -v /data/chess_prj/:/data/chess_prj/  -v /prj:/prj chess_prj bash 
docker run  -it -v /data/chess_prj/:/data/chess_prj/  -v /prj:/prj chess_prj bash 


