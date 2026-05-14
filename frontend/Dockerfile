# Use Node alpine (lightweight)
FROM node:22-alpine

WORKDIR /app

# Copy package files first (better caching)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# Expose the Vite port
EXPOSE 5173

# Run in Development mode (allows hot-reloading if we mapped volumes, but simple for now)
CMD ["npm", "run", "dev", "--", "--host"]