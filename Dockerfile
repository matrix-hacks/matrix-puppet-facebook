FROM node:8-alpine

WORKDIR /usr/src/app

ARG NODE_ENV
ENV NODE_ENV $NODE_ENV

COPY . .

RUN npm install

EXPOSE 8090
CMD [ "npm", "start" ]
