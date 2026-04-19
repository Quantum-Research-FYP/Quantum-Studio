import CircuitCanvas from '../components/circuit-builder/CircuitCanvas';
import GatePalette from '../components/circuit-builder/GatePalette';
import WireList from '../components/circuit-builder/WireList';
import UndoRedoControls from '../components/circuit-builder/UndoRedoControls';
import CodePanel from '../components/circuit-builder/CodePanel';
import ValidationSummaryPanel from '../components/circuit-builder/ValidationSummaryPanel';
import ExportControls from '../components/circuit-builder/ExportControls';

/**
 * CircuitBuilderPage is the top-level page for the visual quantum circuit editor.
 * It composes all builder sub-components into a cohesive layout:
 * - Toolbar: wire controls, undo/redo, export actions
 * - Main area: gate palette (left), circuit canvas (center), code + validation (right)
 */
export default function CircuitBuilderPage() {
  return (
    <div className="builder">
      <div className="builder__toolbar">
        <WireList />
        <UndoRedoControls />
        <ExportControls />
      </div>

      <div className="builder__workspace">
        <GatePalette />

        <div className="builder__center">
          <CircuitCanvas />
        </div>

        <div className="builder__sidebar">
          <CodePanel />
          <ValidationSummaryPanel />
        </div>
      </div>
    </div>
  );
}
