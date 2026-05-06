# OS & runtime 
FROM node:20-alpine 

# sets the working dir inside the container to /app (relative to root /)
WORKDIR /app

# copy package.json and package-lock.json to the working dir (app) in the container
COPY package*.json ./

# instal dependencies (clean install)
RUN npm ci

# copy all files from current dir to working dir (app) in the container
# done after npm ci to avoide re-installing dependencies on every code change (docker cache optimization)
COPY . .

# container listens on port 3001
EXPOSE 3001

# command to run the server when the container starts
CMD ["node", "index.js"]
