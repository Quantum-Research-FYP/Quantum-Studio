import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Header';
import Seo from './Seo';

const ROUTE_SEO: Record<string, { title: string; description: string; noIndex?: boolean }> = {
  '/builder': {
    title: 'Online Quantum Circuit Builder — Quantum Experiment Studio',
    description: 'Build and simulate quantum circuits online with drag-and-drop gates, Qiskit code generation, Bloch spheres, and measurement results.',
  },
  '/ide': {
    title: 'Online Quantum IDE — Quantum Experiment Studio',
    description: 'Write and run quantum programs in a browser-based IDE with circuit visualization and local quantum simulation.',
  },
  '/login': { title: 'Log In — Quantum Experiment Studio', description: 'Log in to Quantum Experiment Studio.', noIndex: true },
  '/signup': { title: 'Create Account — Quantum Experiment Studio', description: 'Create a Quantum Experiment Studio account.', noIndex: true },
  '/results': { title: 'Run History — Quantum Experiment Studio', description: 'Review saved quantum circuit executions.', noIndex: true },
  '/experiments': { title: 'My Experiments — Quantum Experiment Studio', description: 'Manage saved quantum experiments.', noIndex: true },
  '/settings': { title: 'Settings — Quantum Experiment Studio', description: 'Manage your Quantum Experiment Studio account.', noIndex: true },
};

export default function AppShell() {
  const location = useLocation();
  const noPaddingRoutes = ['/', '/ide', '/create'];
  const isNoPadding = noPaddingRoutes.includes(location.pathname);
  const seo = ROUTE_SEO[location.pathname];
  const shouldNoIndex = location.pathname.startsWith('/shared/') || location.pathname === '/simulation-results' || location.pathname === '/auth/callback';

  return (
    <div className="app-shell">
      {seo && <Seo {...seo} path={location.pathname} />}
      {shouldNoIndex && (
        <Seo
          title="Quantum Experiment Studio"
          description="Quantum Experiment Studio application page."
          path={location.pathname}
          noIndex
        />
      )}
      <Sidebar />
      <main className={`app-main ${isNoPadding ? 'app-main--no-padding' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
