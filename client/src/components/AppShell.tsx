import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Header';

export default function AppShell() {
  const location = useLocation();
  const noPaddingRoutes = ['/ide', '/create'];
  const isNoPadding = noPaddingRoutes.includes(location.pathname);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className={`app-main ${isNoPadding ? 'app-main--no-padding' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
