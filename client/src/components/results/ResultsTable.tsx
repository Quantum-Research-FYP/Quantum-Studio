import type { Outcome } from '../../api/simulations';

interface ResultsTableProps {
  outcomes: Outcome[];
  maxDisplay?: number;
  compact?: boolean;
}

export default function ResultsTable({ outcomes, maxDisplay, compact = false }: ResultsTableProps) {
  const displayed =
    maxDisplay && outcomes.length > maxDisplay ? outcomes.slice(0, maxDisplay) : outcomes;

  const truncated = maxDisplay ? outcomes.length > maxDisplay : false;

  return (
    <div 
      className="premium-table-wrapper"
      style={{
        background: 'var(--color-surface-2)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--color-border)',
        borderRadius: compact ? '8px' : '16px',
        padding: compact ? '12px' : '24px',
        overflow: 'hidden'
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table 
          className="counts-table premium-counts-table" 
          aria-label="Simulation measurement results"
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left', padding: compact ? '8px 10px' : '12px 16px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: compact ? '0.75rem' : '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outcome</th>
              <th scope="col" style={{ textAlign: 'right', padding: compact ? '8px 10px' : '12px 16px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: compact ? '0.75rem' : '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Count</th>
              <th scope="col" style={{ textAlign: 'right', padding: compact ? '8px 10px' : '12px 16px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: compact ? '0.75rem' : '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Probability</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((outcome, idx) => (
              <tr 
                key={outcome.bitstring}
                className="premium-table-row"
                style={{
                  borderBottom: idx === displayed.length - 1 ? 'none' : '1px solid var(--color-border)',
                  transition: 'background 0.2s ease',
                  fontSize: compact ? '0.8125rem' : '1rem'
                }}
              >
                <td style={{ padding: compact ? '8px 10px' : '12px 16px' }}>
                  <code style={{ 
                    background: 'var(--color-surface-3)', 
                    padding: compact ? '2px 6px' : '4px 8px', 
                    borderRadius: '6px',
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {outcome.bitstring}
                  </code>
                </td>
                <td style={{ padding: compact ? '8px 10px' : '12px 16px', textAlign: 'right', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                  {outcome.count.toLocaleString()}
                </td>
                <td style={{ padding: compact ? '8px 10px' : '12px 16px', textAlign: 'right', color: 'var(--color-primary)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                  {(outcome.probability * 100).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <p 
          style={{
            textAlign: 'center',
            marginTop: compact ? '8px' : '16px',
            color: 'var(--color-text-subtle)',
            fontSize: compact ? '0.75rem' : '0.8125rem',
            fontStyle: 'italic',
            marginBottom: 0
          }}
        >
          Showing top {maxDisplay} of {outcomes.length} outcomes
        </p>
      )}
    </div>
  );
}
