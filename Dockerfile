FROM node:10-alpine

WORKDIR /usr/src/app

ARG NODE_ENV
ENV NODE_ENV $NODE_ENV

COPY . .

RUN apk add git ffmpeg
RUN npm install

EXPOSE 8090
CMD [ "npm", "start" ]
