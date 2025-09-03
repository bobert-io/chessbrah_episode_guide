AWS_REGION="us-east-1"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)


REPO="chess-prj"
TAG="latest"
REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMG_URI=${REGISTRY}/${REPO}:${TAG}
aws ecr get-login-password --region us-east-1  | docker login --username AWS --password-stdin $IMG_URI

docker build -t $REPO . 
docker tag ${REPO}:${TAG} $IMG_URI
docker push $IMG_URI

