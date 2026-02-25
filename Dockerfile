# Use official Node.js image as base
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json
COPY package.json ./

# Install all dependencies (including devDependencies for the build step)
RUN npm install

# Copy all app files
COPY . .

# Build the Vite frontend
RUN npm run build

# Expose port 3000
EXPOSE 3000

# Run the Express server (serves built frontend + API routes)
CMD ["node", "server.js"]
