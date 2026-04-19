import { useState, useCallback } from 'react';
import { getExportUrl } from '../../api/simulations';

interface ExportButtonsProps {
  jobId: string;
  chartVisible: boolean;
  chartSvgId?: string;
}

/**
 * Download a server-generated export artifact (JSON or CSV).
 * Uses fetch so the session cookie is sent automatically.
 */
async function downloadServerExport(jobId: string, format: 'json' | 'csv'): Promise<void> {
  const url = getExportUrl(jobId, format);
  const res = await fetch(url, { credentials: 'include' });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { error?: string } | null)?.error ?? 'Export failed.');
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `results-${jobId}.${format}`;
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Render the SVG chart to a PNG and trigger download.
 * Inlines computed styles so the exported image matches on-screen colors.
 */
async function downloadChartPng(jobId: string, svgId: string): Promise<void> {
  const svgEl = document.getElementById(svgId) as SVGSVGElement | null;
  if (!svgEl) throw new Error('Chart not found.');

  // Clone the SVG so we can inline styles without mutating the DOM
  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  // Inline computed styles on all elements so they render correctly in the image
  inlineStyles(svgEl, clone);

  // Ensure minimum export dimensions
  const viewBox = svgEl.viewBox.baseVal;
  const width = Math.max(viewBox.width, 800);
  const height = viewBox.height * (width / viewBox.width);

  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('Canvas context unavailable.'));
        return;
      }

      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(svgUrl);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG export failed.'));
          return;
        }
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `chart-${jobId}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        resolve();
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Failed to render chart image.'));
    };

    img.src = svgUrl;
  });
}

/** Copy computed styles from the source SVG tree to the cloned tree. */
function inlineStyles(source: Element, target: Element): void {
  const computed = window.getComputedStyle(source);
  const styleProps = ['fill', 'font-family', 'font-size', 'font-weight', 'opacity'];
  let styleStr = '';
  for (const prop of styleProps) {
    const val = computed.getPropertyValue(prop);
    if (val) styleStr += `${prop}:${val};`;
  }
  if (styleStr) (target as HTMLElement).setAttribute('style', styleStr);

  const sourceChildren = source.children;
  const targetChildren = target.children;
  for (let i = 0; i < sourceChildren.length; i++) {
    if (targetChildren[i]) {
      inlineStyles(sourceChildren[i], targetChildren[i]);
    }
  }
}

export default function ExportButtons({
  jobId,
  chartVisible,
  chartSvgId = 'probability-bar-chart',
}: ExportButtonsProps) {
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null,
  );

  const handleExport = useCallback(
    async (action: () => Promise<void>, label: string) => {
      setStatus(null);
      try {
        await action();
        setStatus({ message: `${label} downloaded.`, type: 'success' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Export failed.';
        setStatus({ message: msg, type: 'error' });
      }
    },
    [],
  );

  return (
    <div className="export-bar" role="group" aria-label="Export results">
      <button
        type="button"
        className="btn btn--ghost export-bar__btn"
        onClick={() => handleExport(() => downloadServerExport(jobId, 'json'), 'JSON')}
      >
        Download JSON
      </button>
      <button
        type="button"
        className="btn btn--ghost export-bar__btn"
        onClick={() => handleExport(() => downloadServerExport(jobId, 'csv'), 'CSV')}
      >
        Download CSV
      </button>
      <button
        type="button"
        className="btn btn--ghost export-bar__btn"
        disabled={!chartVisible}
        title={chartVisible ? 'Download chart as PNG image' : 'Show the chart to enable PNG export'}
        onClick={() => handleExport(() => downloadChartPng(jobId, chartSvgId), 'Chart PNG')}
      >
        Download chart (PNG)
      </button>
      {status && (
        <span
          className={`export-bar__status ${status.type === 'success' ? 'export-bar__status--success' : 'export-bar__status--error'}`}
          role="status"
          aria-live="polite"
        >
          {status.message}
        </span>
      )}
    </div>
  );
}
