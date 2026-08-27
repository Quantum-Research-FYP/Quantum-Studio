from spinqit import Circuit, get_basic_simulator, get_compiler, BasicSimulatorConfig
from spinqit import H, CX

circ = Circuit()
q = circ.allocateQubits(2)
circ << (H, q[0])
circ << (CX, (q[0], q[1]))

comp = get_compiler("native")
engine = get_basic_simulator()

exe = comp.compile(circ, 0)

config = BasicSimulatorConfig()
config.configure_shots(1024)
result = engine.execute(exe, config)
print(result.counts)
