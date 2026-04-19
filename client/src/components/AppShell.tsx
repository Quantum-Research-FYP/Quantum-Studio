import { Outlet } from 'react-router-dom';
import Header from './Header';

export default function AppShell() {
  return (
    <>
      <Header />
      <main className="app-main">
        <Outlet />
      </main>
    </>
  );
}
