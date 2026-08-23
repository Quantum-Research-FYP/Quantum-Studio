import type { Outcome } from '../../api/simulations';

interface ResultsTableProps {
  outcomes: Outcome[];
  maxDisplay?: number;
}

export default function ResultsTable({ outcomes, maxDisplay }: ResultsTableProps) {
  const displayed =
    maxDisplay && outcomes.length > maxDisplay ? outcomes.slice(0, maxDisplay) : outcomes;

  const truncated = maxDisplay ? outcomes.length > maxDisplay : false;

  return (
    <div className="counts-table-wrapper">
      <table className="counts-table" aria-label="Simulation measurement results">
        <thead>
          <tr>
            <th scope="col">Outcome</th>
            <th scope="col" className="counts-table__num">
              Count
            </th>
            <th scope="col" className="counts-table__num">
              Probability
            </th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((outcome) => (
            <tr key={outcome.bitstring}>
              <td>
                <code>{outcome.bitstring}</code>
              </td>
              <td className="counts-table__num">{outcome.count.toLocaleString()}</td>
              <td className="counts-table__num">{outcome.probability.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="counts-table__truncation">
          Showing top {maxDisplay} of {outcomes.length} outcomes
        </p>
      )}
    </div>
  );
}
