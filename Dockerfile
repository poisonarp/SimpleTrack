# Use official Node.js image as base
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json
COPY package.json ./

# Install all dependencies (including devDependencies for development)
RUN npm install && npx vite --version

# Copy all app files
COPY . .

# Expose port 3000
EXPOSE 3000

# Start the app on port 3000
CMD ["npm", "run", "dev", "--", "--port", "3000", "--host"]
