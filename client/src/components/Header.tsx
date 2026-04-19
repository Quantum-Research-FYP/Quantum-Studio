import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/create', label: 'Create' },
  { to: '/run', label: 'Run' },
  { to: '/results', label: 'Results' },
  { to: '/experiments', label: 'Experiments' },
  { to: '/templates', label: 'Templates' },
] as const;

export default function Header() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/create');
  };

  return (
    <header className="app-header">
      <Link to="/create" className="app-header__brand">
        Quantum Studio
      </Link>

      <nav aria-label="Main navigation">
        <ul className="app-header__nav" role="list">
          {NAV_ITEMS.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="app-header__actions">
        {loading ? null : user ? (
          <>
            <span className="user-email">{user.email}</span>
            <button type="button" className="btn btn--ghost" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn--ghost">
              Log in
            </Link>
            <Link to="/signup" className="btn btn--primary">
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
