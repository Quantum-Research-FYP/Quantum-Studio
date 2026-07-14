import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */
const IconAtom = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    <ellipse cx="12" cy="12" rx="10" ry="4" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-60 12 12)" />
  </svg>
);

const IconCreate = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9,22 9,12 15,12 15,22" />
  </svg>
);

const IconBuilder = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <rect x="7" y="7" width="10" height="10" rx="1" />
    <path d="M10 7V4m4 3V4m-4 13v3m4-3v3M7 10H4m3 4H4m13-4h3m-3 4h3" />
  </svg>
);

const IconCode = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const IconRun = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
);

const IconResults = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <path d="M18 20V10M12 20V4M6 20v-6" />
  </svg>
);

const IconExperiments = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3h6M9 3v8.5L5.5 19.5a1 1 0 00.9 1.5h11.2a1 1 0 00.9-1.5L15 11.5V3" />
    <path d="M6.5 16h11" />
  </svg>
);

const IconTemplates = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

const IconSettings = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const IconLogout = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);

const IconSun = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const IconMoon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

const IconChevronLeft = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const IconChevronRight = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Nav structure                                                        */
/* ------------------------------------------------------------------ */
const NAV_GROUPS = [
  {
    label: 'Build',
    items: [
      { to: '/create', label: 'Create', Icon: IconCreate },
      { to: '/builder', label: 'Builder', Icon: IconBuilder },
      { to: '/ide', label: 'IDE', Icon: IconCode },
    ],
  },
  {
    label: 'Execute',
    items: [
      { to: '/results', label: 'Run History', Icon: IconResults },
    ],
  },
  {
    label: 'Library',
    items: [
      { to: '/experiments', label: 'Experiments', Icon: IconExperiments },
      { to: '/templates', label: 'Templates', Icon: IconTemplates },
    ],
  },
  {
    label: 'Account',
    items: [{ to: '/settings', label: 'Settings', Icon: IconSettings }],
  },
] as const;

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */
export default function Header() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/create');
  };

  const initials = user?.email ? user.email[0].toUpperCase() : '?';

  return (
    <aside className={`app-sidebar ${isCollapsed ? 'app-sidebar--collapsed' : ''}`}>
      {/* Brand & Toggle */}
      <div className="app-sidebar__header">
        <Link to="/create" className="app-sidebar__brand">
          <div className="app-sidebar__logo">
            <IconAtom />
          </div>
          <div className="app-sidebar__brand-text">
            <span className="app-sidebar__brand-name">Quantum</span>
            <span className="app-sidebar__brand-sub">Studio</span>
          </div>
        </Link>
        <button 
          className="app-sidebar__collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="app-sidebar__nav" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="nav-group">
            <span className="nav-group__label">{group.label}</span>
            <ul role="list" className="nav-group__items">
              {group.items.map(({ to, label, Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `sidebar-nav-link${isActive ? ' sidebar-nav-link--active' : ''}`
                    }
                  >
                    <span className="sidebar-nav-link__icon">
                      <Icon />
                    </span>
                    <span className="sidebar-nav-link__label">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Theme toggle */}
      <div className="sidebar-theme-row">
        <button
          type="button"
          className="sidebar-theme-btn"
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="sidebar-theme-btn__icon">
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </span>
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>

      {/* Footer — user info or auth links */}
      <div className="app-sidebar__footer">
        {loading ? null : user ? (
          <div className="sidebar-user">
            <div className="sidebar-user__avatar">{initials}</div>
            <div className="sidebar-user__info">
              <span className="sidebar-user__email">{user.email}</span>
              <span className="sidebar-user__role">Researcher</span>
            </div>
            <button
              type="button"
              className="sidebar-user__logout"
              onClick={handleLogout}
              title="Log out"
            >
              <IconLogout />
            </button>
          </div>
        ) : (
          <div className="sidebar-auth">
            <Link to="/login" className="btn btn--ghost btn--full">
              Log in
            </Link>
            <Link to="/signup" className="btn btn--primary btn--full">
              Sign up
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
