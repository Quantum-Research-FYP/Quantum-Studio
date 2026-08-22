# Run Simulation Service Commands

This file contains the commands required to run the simulation service for Quantum Studio. The simulation service is located in the `simulation-service` directory.

## Local Development (Python Virtual Environment)

1. Navigate to the simulation service directory:
   ```bash
   cd simulation-service
   ```

2. Activate the virtual environment:
   - On macOS/Linux:
     ```bash
     source .venv/bin/activate
     ```
   - On Windows:
     ```bash
     .venv\Scripts\activate
     ```

3. Run the service using uvicorn:
   ```bash
   uvicorn main:app --port 8000 --reload
   ```

## Docker

If you prefer to use Docker, you can build and run the container:

1. Build the Docker image:
   ```bash
   cd simulation-service
   docker build -t quantum-simulation-service .
   ```

2. Run the Docker container:
   ```bash
   docker run -p 8000:8000 quantum-simulation-service
   ```
