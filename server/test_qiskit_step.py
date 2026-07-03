from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qc = QuantumCircuit(2)
qc.save_statevector(label='step_0')
qc.h(0)
qc.save_statevector(label='step_1')
qc.cx(0, 1)
qc.save_statevector(label='step_2')

sim = AerSimulator()
res = sim.run(qc).result()
print(res.data(0))
