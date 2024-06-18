# Fetching the minified node image on apline linux
FROM node:20

# Declaring env
ENV NODE_ENV production

# Setting up the work directory
WORKDIR /nasakh-docker

# Copying all the files in our project
COPY . .

# Installing dependencies
RUN yarn

RUN yarn add -D @types/jsonwebtoken @types/express

# Installing pm2 globally
RUN yarn build

# Starting our application


EXPOSE 4000

CMD ["yarn", "start"]
