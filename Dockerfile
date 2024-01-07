# syntax=docker/dockerfile:1

FROM node:20-alpine as development
LABEL stage=development

ENV NODE_ENV=development

RUN apk add dumb-init

USER node

WORKDIR /usr/src/app

COPY --chown=node:node package*.json .

RUN npm install

COPY --chown=node:node . .

RUN npm run build

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

FROM node:20-alpine as production
LABEL stage=production

ENV NODE_ENV=production

RUN apk add dumb-init

USER node

WORKDIR /usr/src/app

COPY --chown=node:node package*.json .

RUN npm ci --omit=dev

COPY --chown=node:node --from=development /usr/src/app/.prod.env .env
COPY --chown=node:node --from=development /usr/src/app/dist ./dist

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "dist/app.js"]