from braket.circuits import Circuit
from braket.devices import LocalSimulator

circuit = Circuit().h(0).cnot(0, 1)
device = LocalSimulator()
result = device.run(circuit, shots=1024).result()
print(result.measurement_counts)
