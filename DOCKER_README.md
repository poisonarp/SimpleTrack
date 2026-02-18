# Docker Installation

## Build and Run with Docker

1. Build the Docker image:
   ```sh
   docker build -t simpletrack .
   ```
2. Run the container:
   ```sh
   docker run -p 3000:3000 simpletrack
   ```

## Using Docker Compose

1. Start with Docker Compose:
   ```sh
   docker-compose up --build
   ```

## Notes
- The app will be available at http://localhost:3000
- Adjust ports in Dockerfile and docker-compose.yml if needed.
- For production, update the CMD in Dockerfile to use a production server (e.g., `npm run build` and serve with `serve` or similar).
