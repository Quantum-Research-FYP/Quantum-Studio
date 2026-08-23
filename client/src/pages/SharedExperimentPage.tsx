import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getSharedExperiment } from '../api/sharing';
import type { SharedExperimentResponse } from '../api/sharing';
import type { CircuitModel } from '../circuit';
import { generateQiskitCode } from '../circuit';
import type { Outcome } from '../api/simulations';
import CircuitCanvas from '../components/circuit-builder/CircuitCanvas';
import CodePanel from '../components/circuit-builder/CodePanel';
import ProbabilityBarChart from '../components/results/ProbabilityBarChart';
import ResultsTable from '../components/results/ResultsTable';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract Outcome[] from the latestResultJson payload (if present and valid). */
function extractOutcomes(resultJson: Record<string, unknown> | null): Outcome[] {
  if (!resultJson) return [];
  const counts = resultJson.counts as Record<string, number> | undefined;
  const shots = resultJson.shots as number | undefined;
  if (!counts || typeof counts !== 'object' || !shots) return [];

  return Object.entries(counts)
    .map(([bitstring, count]) => ({
      bitstring,
      count,
      probability: Math.round((count / shots) * 10000) / 10000,
    }))
    .sort((a, b) => b.probability - a.probability || a.bitstring.localeCompare(b.bitstring));
}

/** Safely cast circuitJson to CircuitModel, returning null if invalid. */
function parseCircuit(circuitJson: Record<string, unknown>): CircuitModel | null {
  if (
    typeof circuitJson.qubits !== 'number' ||
    typeof circuitJson.clbits !== 'number' ||
    !Array.isArray(circuitJson.operations)
  ) {
    return null;
  }
  return circuitJson as unknown as CircuitModel;
}

// No-op handlers for read-only canvas
const EMPTY_ERRORS = new Set<string>();
const noop = () => {};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ViewState = 'loading' | 'not-found' | 'error' | 'loaded';

export default function SharedExperimentPage() {
  const { experimentId } = useParams<{ experimentId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? undefined;

  const [viewState, setViewState] = useState<ViewState>('loading');
  const [experiment, setExperiment] = useState<SharedExperimentResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!experimentId) {
      setViewState('not-found');
      return;
    }

    let cancelled = false;

    async function load() {
      setViewState('loading');
      try {
        const data = await getSharedExperiment(experimentId!, token);
        if (cancelled) return;
        if (!data) {
          setViewState('not-found');
        } else {
          setExperiment(data);
          setViewState('loaded');
        }
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setViewState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [experimentId, token]);

  // ── Loading ─────────────────────────────────────────────────────────────
  if (viewState === 'loading') {
    return (
      <div className="page">
        <p className="page__subtitle">Loading shared experiment…</p>
      </div>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────
  if (viewState === 'not-found') {
    return (
      <div className="page">
        <h1 className="page__title">Not Found</h1>
        <p className="page__subtitle">
          This experiment does not exist or is not available for sharing.
        </p>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────
  if (viewState === 'error') {
    return (
      <div className="page">
        <h1 className="page__title">Error</h1>
        <p className="page__subtitle">{errorMessage}</p>
      </div>
    );
  }

  // ── Loaded ──────────────────────────────────────────────────────────────
  const circuit = parseCircuit(experiment!.circuitJson);
  const outcomes = extractOutcomes(experiment!.latestResultJson);
  const code = circuit ? generateQiskitCode(circuit) : null;

  return (
    <div className="page shared-viewer">
      <header className="shared-viewer__header">
        <h1 className="page__title">{experiment!.name}</h1>
        {experiment!.description && (
          <p className="shared-viewer__description">{experiment!.description}</p>
        )}
        {experiment!.tags && experiment!.tags.length > 0 && (
          <ul className="shared-viewer__tags" aria-label="Tags">
            {experiment!.tags.map((tag) => (
              <li key={tag} className="shared-viewer__tag">
                {tag}
              </li>
            ))}
          </ul>
        )}
        <p className="shared-viewer__meta">
          Shared experiment · Last updated {new Date(experiment!.updatedAt).toLocaleDateString()}
        </p>
        {experiment!.aiAssisted && (
          <div className="shared-viewer__ai-badge" role="note" aria-label="AI-assisted experiment">
            <span className="shared-viewer__ai-label">AI-assisted</span>
            {experiment!.aiProvider && (
              <span className="shared-viewer__ai-provider">
                Generated by {experiment!.aiProvider}
                {experiment!.aiModel ? ` (${experiment!.aiModel})` : ''}
              </span>
            )}
          </div>
        )}
      </header>

      {/* AI provenance details — only shown when owner opted in to share them */}
      {experiment!.aiAssisted && experiment!.aiExplanation && (
        <section className="shared-viewer__section" aria-label="AI explanation">
          <h2 className="shared-viewer__section-title">AI Explanation</h2>
          <p>{experiment!.aiExplanation}</p>
        </section>
      )}
      {experiment!.aiAssisted && experiment!.aiGeneratedCode && (
        <section className="shared-viewer__section" aria-label="AI generated code">
          <h2 className="shared-viewer__section-title">AI Generated Code</h2>
          <pre className="shared-viewer__code">
            <code>{experiment!.aiGeneratedCode}</code>
          </pre>
        </section>
      )}

      {circuit && (
        <section className="shared-viewer__section" aria-label="Circuit">
          <h2 className="shared-viewer__section-title">Circuit</h2>
          <CircuitCanvas
            circuit={circuit}
            selectedGate={null}
            errorOperationIds={EMPTY_ERRORS}
            onPlaceGate={noop}
            onDeleteGate={noop}
          />
        </section>
      )}

      {code && (
        <section className="shared-viewer__section" aria-label="Generated code">
          <h2 className="shared-viewer__section-title">Qiskit Code</h2>
          <CodePanel code={code} framework="qiskit" onFrameworkChange={() => {}} />
        </section>
      )}

      {outcomes.length > 0 && (
        <section className="shared-viewer__section" aria-label="Results">
          <h2 className="shared-viewer__section-title">Results</h2>
          <ProbabilityBarChart outcomes={outcomes} />
          <ResultsTable outcomes={outcomes} />
        </section>
      )}

      {!circuit && (
        <section className="shared-viewer__section">
          <p>Unable to render circuit data for this experiment.</p>
        </section>
      )}
    </div>
  );
}
