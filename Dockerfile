FROM node:16.13.2

RUN set -x \
    && node -v \
    && npm -v 
    
RUN npm i -g npm@8.19.3

WORKDIR /ducatuscore

# Add source
ADD . .
RUN npm install
RUN npm run bootstrap
RUN npm run compile