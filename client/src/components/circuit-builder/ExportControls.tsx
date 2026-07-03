import { useCallback, useState } from 'react';

/**
 * ExportControls provides copy-to-clipboard and download-as-file actions
 * for the generated Qiskit Python code. Disabled when validation errors exist
 * or the circuit has no gates.
 */

interface ExportControlsProps {
  code: string;
  hasErrors: boolean;
  hasGates: boolean;
  framework: string;
}

/** Format current date/time as yyyyMMdd-HHmmss for safe filenames. */
function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

type CopyStatus = 'idle' | 'success' | 'error';

export default function ExportControls({ code, hasErrors, hasGates, framework }: ExportControlsProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const isDisabled = hasErrors || !hasGates;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus('success');
    } catch {
      setCopyStatus('error');
    }
    setTimeout(() => setCopyStatus('idle'), 3000);
  }, [code]);

  const handleDownload = useCallback(() => {
    const ext = framework === 'qasm' ? 'qasm' : 'py';
    const filename = `circuit-${formatTimestamp()}.${ext}`;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [code, framework]);

  const copyTitle = isDisabled
    ? hasErrors
      ? 'Fix validation errors to enable export'
      : 'Add gates to enable export'
    : 'Copy code to clipboard';

  const downloadTitle = isDisabled
    ? hasErrors
      ? 'Fix validation errors to enable export'
      : 'Add gates to enable export'
    : `Download as .${framework === 'qasm' ? 'qasm' : 'py'} file`;

  return (
    <div className="export-controls" aria-label="Export controls">
      <div className="export-controls__group">
        <button
          type="button"
          className="btn btn--ghost export-controls__btn"
          disabled={isDisabled}
          title={copyTitle}
          onClick={handleCopy}
        >
          Copy code
        </button>
        {copyStatus !== 'idle' && (
          <span
            className={`export-controls__status export-controls__status--${copyStatus}`}
            role="status"
            aria-live="assertive"
          >
            {copyStatus === 'success'
              ? 'Copied!'
              : 'Could not copy. Select the code and use Ctrl+C.'}
          </span>
        )}
      </div>
      <button
        type="button"
        className="btn btn--ghost export-controls__btn"
        disabled={isDisabled}
        title={downloadTitle}
        onClick={handleDownload}
      >
        Download .{framework === 'qasm' ? 'qasm' : 'py'}
      </button>
    </div>
  );
}
