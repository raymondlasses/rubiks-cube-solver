# Rubik's Solver AI 🧊🤖

An advanced, Dockerized Rubik's Cube solver featuring a responsive React frontend, a custom 3D rendering engine, and a Python/FastAPI backend powered by computer vision and the Two-Phase Kociemba algorithm.

## Features
- **Computer Vision Scanning:** Uses OpenCV and K-Means clustering to read cube faces via webcam.
- **Smart Auto-Correction:** Recursively detects and corrects minor scanning anomalies or lighting errors.
- **Custom Color Schemes:** Built-in picker to map custom cube palettes to standard notations.
- **3D Solution Visualizer:** A custom `Three.js` / `@react-three/fiber` engine to animate the solution with adjustable TPS (Turns Per Second).
- **Sub-20 Move Solutions:** Backend powered by the highly optimized Kociemba algorithm.

## Prerequisites
To run this application, you only need one thing installed on your machine:
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Includes Docker Compose)

## Setup & Installation

**1. Clone the repository**
```bash
git clone https://github.com/raymondlasses/rubiks-cube-solver.git
cd rubiks-cube-solver
```

**2. Build and start the containers**
The entire application (frontend, backend, and all dependencies) is containerized. Simply run:
```bash
docker compose up --build
```
*Note: The first build may take a few minutes as Docker downloads the Python 3.12 and Node environments. Subsequent startups will be nearly instantaneous.*

**3. Access the Application**
Once the containers are running and the terminal shows the services are ready, open your browser and navigate to:
- **Frontend UI:** `http://localhost:3000` (or the port specified in your Vite config)
- **Backend API Docs:** `http://localhost:8000/docs`

## Usage
1. Grant camera permissions.
2. Hold your Rubik's Cube in the center grid. The AI will flash green when a face is locked.
3. Follow the on-screen instructions to rotate and scan all 6 faces.
4. If your cube has non-standard colors, use the **Color Scheme Picker** before scanning.
5. Once scanned, the 3D visualizer will generate the optimal solution path.

## Stopping the App
To stop the application, press `Ctrl + C` in the terminal where it's running, or run:
```bash
docker compose down
```
