FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json *.js ./
COPY --chown=node:node public ./public
RUN mkdir -p /home/node/data && chown node:node /home/node/data
USER node
ENV DATA_DIR=/home/node/data PORT=3000 HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "server.js"]

