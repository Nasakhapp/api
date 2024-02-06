# Fetching the minified node image on apline linux
FROM node:slim

# Declaring env
ENV NODE_ENV production

# Setting up the work directory
WORKDIR /nasakh-docker

# Copying all the files in our project
COPY . .

# Installing dependencies
RUN yarn

# Installing pm2 globally
RUN yarn install pm2 -g


# Installing pm2 globally
RUN yarn build

# Starting our application


EXPOSE 4000

CMD ["yarn", "start"]
