import React, { useRef } from 'react';
import html2pdf from 'html2pdf.js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import type { AnalyzeResponse } from '../../api/simulations';

interface PerformanceAnalysisPanelProps {
  data: AnalyzeResponse;
  onClose: () => void;
}

export function PerformanceAnalysisPanel({ data, onClose }: PerformanceAnalysisPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = () => {
    if (!panelRef.current) return;
    const element = panelRef.current;
    
    // Temporarily hide the close and download buttons
    const noPrintElements = element.querySelectorAll('.no-print');
    noPrintElements.forEach(el => (el as HTMLElement).style.display = 'none');

    const opt = {
      margin:       10,
      filename:     'quantum-performance-analysis.pdf',
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      // Restore buttons
      noPrintElements.forEach(el => (el as HTMLElement).style.display = '');
    });
  };

  // 1. Prepare Error Budget Data for Pie Chart
  const errorBudgetArray = Object.entries(data.errorBudget).map(([name, value]) => ({
    name,
    value
  }));
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

  // 2. Prepare Distribution Comparison Data (top 15 states by ideal probability)
  const allStates = new Set([...Object.keys(data.idealCounts), ...Object.keys(data.noisyCounts)]);
  const shots = Object.values(data.idealCounts).reduce((a, b) => a + b, 0) || 1000;
  
  let compData = Array.from(allStates).map(state => {
    const idealProb = (data.idealCounts[state] || 0) / shots;
    const noisyProb = (data.noisyCounts[state] || 0) / shots;
    return {
      state,
      Ideal: Number(idealProb.toFixed(4)),
      Noisy: Number(noisyProb.toFixed(4))
    };
  });
  
  // Sort by Ideal probability descending and take top 15
  compData.sort((a, b) => b.Ideal - a.Ideal);
  if (compData.length > 15) {
    compData = compData.slice(0, 15);
  }

  return (
    <div className="analysis-panel" ref={panelRef} style={{ background: '#09090b', padding: '24px', borderRadius: '8px', border: '1px solid #27272a', color: '#e4e4e7', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Performance Analysis Report</h2>
        <div className="no-print" style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleDownloadPdf} className="btn btn--secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Download PDF</button>
          <button onClick={onClose} className="btn btn--primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Close</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {/* Metric Cards */}
        <div style={{ flex: '1 1 200px', background: '#18181b', padding: '16px', borderRadius: '6px', border: '1px solid #27272a' }}>
          <div style={{ fontSize: '0.8rem', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>Baseline Fidelity</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#10b981' }}>{(data.fidelity * 100).toFixed(2)}%</div>
          <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px' }}>Overlap with ideal statevector</div>
        </div>
        
        <div style={{ flex: '1 1 200px', background: '#18181b', padding: '16px', borderRadius: '6px', border: '1px solid #27272a' }}>
          <div style={{ fontSize: '0.8rem', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '8px' }}>Analysis Time</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{Number(data.metadata.durationMs) || 0} ms</div>
          <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px' }}>Backend: {String(data.metadata.backend)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        
        {/* Error Budget Chart */}
        <div style={{ flex: '1 1 400px', background: '#18181b', padding: '20px', borderRadius: '6px', border: '1px solid #27272a', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '0.9rem', color: '#e4e4e7', marginBottom: '16px' }}>Estimated Error Budget Breakdown</h3>
          {errorBudgetArray.length > 0 ? (
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={errorBudgetArray} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={({name, value}) => `${name} (${value}%)`}>
                    {errorBudgetArray.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ background: '#09090b', border: '1px solid #27272a', color: '#e4e4e7' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
              No errors configured or circuit is empty.
            </div>
          )}
        </div>

        {/* Monte Carlo Fidelity Chart */}
        <div style={{ flex: '1 1 400px', background: '#18181b', padding: '20px', borderRadius: '6px', border: '1px solid #27272a', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '0.9rem', color: '#e4e4e7', marginBottom: '16px' }}>Fidelity Decay (Monte Carlo Noise Scaling)</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monteCarloFidelity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="noiseScale" stroke="#a1a1aa" tickFormatter={(val) => `${val}x`} />
                <YAxis domain={[0, 1]} stroke="#a1a1aa" />
                <RechartsTooltip contentStyle={{ background: '#09090b', border: '1px solid #27272a', color: '#e4e4e7' }} formatter={(val: any) => (Number(val) * 100).toFixed(2) + '%'} labelFormatter={(val) => `Noise Scale: ${val}x`} />
                <Legend />
                <Line type="monotone" dataKey="fidelity" stroke="#10b981" strokeWidth={2} name="Fidelity" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution Overlay */}
        <div style={{ flex: '1 1 100%', background: '#18181b', padding: '20px', borderRadius: '6px', border: '1px solid #27272a', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '0.9rem', color: '#e4e4e7', marginBottom: '16px' }}>Probability Distribution (Ideal vs Noisy)</h3>
          <div style={{ height: '350px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="state" stroke="#a1a1aa" />
                <YAxis stroke="#a1a1aa" />
                <RechartsTooltip contentStyle={{ background: '#09090b', border: '1px solid #27272a', color: '#e4e4e7' }} />
                <Legend />
                <Bar dataKey="Ideal" fill="rgba(255,255,255,0.2)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Noisy" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
