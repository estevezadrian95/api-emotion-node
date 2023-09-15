FROM node:18

WORKDIR /app

COPY package.json ./
COPY index.js .
COPY models/ ./models

RUN apt-get update && apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
RUN npm install
EXPOSE 8080

CMD ["node", "index.js"]