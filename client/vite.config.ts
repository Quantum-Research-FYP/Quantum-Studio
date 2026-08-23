import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // ── Vendor: React core ──────────────────────────────────────────
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }

            // ── Vendor: KaTeX (large math rendering library) ────────────────
            if (id.includes('node_modules/katex')) {
              return 'vendor-katex';
            }

            // ── Vendor: Charting (recharts, d3, victory, etc.) ──────────────
            if (
              id.includes('node_modules/recharts') ||
              id.includes('node_modules/d3') ||
              id.includes('node_modules/victory')
            ) {
              return 'vendor-charts';
            }

            // ── Vendor: Monaco / CodeMirror editor ──────────────────────────
            if (
              id.includes('node_modules/monaco-editor') ||
              id.includes('node_modules/@monaco-editor') ||
              id.includes('node_modules/codemirror') ||
              id.includes('node_modules/@codemirror')
            ) {
              return 'vendor-editor';
            }

            // ── Vendor: remaining third-party packages ──────────────────────
            if (id.includes('node_modules/')) {
              return 'vendor-misc';
            }

            // ── Feature chunks (mirroring lazy page boundaries) ────────────
            if (id.includes('/pages/IdePage') || id.includes('/ide/')) {
              return 'chunk-ide';
            }
            if (
              id.includes('/pages/CircuitBuilderPage') ||
              id.includes('/components/circuit-builder/') ||
              id.includes('/circuit/')
            ) {
              return 'chunk-circuit';
            }
            if (id.includes('/pages/ResultsPage')) {
              return 'chunk-results';
            }
            if (id.includes('/pages/SettingsPage')) {
              return 'chunk-settings';
            }
            if (
              id.includes('/pages/ExperimentsPage') ||
              id.includes('/pages/TemplatesPage') ||
              id.includes('/pages/SharedExperimentPage')
            ) {
              return 'chunk-experiments';
            }
          },
        },
      },
    },
  };
});
