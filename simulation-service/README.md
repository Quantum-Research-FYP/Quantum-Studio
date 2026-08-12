# Quantum Simulation Service

This is the backend simulation service for Quantum Studio, responsible for simulating quantum circuits and applying noise models like amplitude damping, phase damping, readout errors, and thermal relaxation. It uses **FastAPI** to expose a REST API and **Qiskit Aer** to run the simulations.

## Prerequisites

- Python 3.12 or higher
- pip (Python package installer)

## Local Development

### 1. Set up a virtual environment (Recommended)

First, create a virtual environment in the `simulation-service` directory:

```bash
python3 -m venv .venv
```

Activate the virtual environment:

- On macOS and Linux:
  ```bash
  source .venv/bin/activate
  ```
- On Windows:
  ```bash
  .venv\Scripts\activate
  ```

### 2. Install Dependencies

With the virtual environment activated, install the required packages:

```bash
pip install -r requirements.txt
```

### 3. Run the Service

Start the FastAPI server using Uvicorn. The `--reload` flag enables auto-reloading whenever you make changes to the code.

```bash
uvicorn main:app --port 8000 --reload
```

The service will be available at `http://localhost:8000`. You can view the automatically generated API documentation by visiting `http://localhost:8000/docs` in your browser.

The service accepts cross-origin browser requests by default so integrations such as Moodle plugins can call `/simulate` without failing the CORS preflight. If you want to restrict that later, set `CORS_ALLOW_ORIGINS` to a comma-separated list of allowed origins before starting the server.

## Running with Docker

Alternatively, you can run the service using Docker. 

Build the Docker image:

```bash
docker build -t quantum-simulation-service .
```

Run the container:

```bash
docker run -p 8000:8000 quantum-simulation-service
```
