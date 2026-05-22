import { Outlet } from 'react-router-dom';
import Sidebar from './Header';

export default function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
