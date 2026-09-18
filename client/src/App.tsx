import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import { UserGuideProvider } from './components/UserGuide/UserGuideProvider';
// Eagerly loaded — these are tiny and always needed on first paint
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import NotFoundPage from './pages/NotFoundPage';
import SsoCallbackPage from './pages/SsoCallbackPage';
import LandingPage from './pages/LandingPage';
import ResearchPage from './pages/ResearchPage';

// Lazy-loaded — heavy pages, only fetched when the user navigates to them
const CircuitBuilderPage = lazy(() => import('./pages/CircuitBuilderPage'));
const IdePage = lazy(() => import('./pages/IdePage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const ExperimentsPage = lazy(() => import('./pages/ExperimentsPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const TemplateDetailsPage = lazy(() => import('./pages/TemplateDetailsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SharedExperimentPage = lazy(() => import('./pages/SharedExperimentPage'));

import './styles/variables.css';
import './styles/global.css';
import './App.css';

/** Minimal full-screen spinner shown while a lazy chunk is loading. */
function PageLoader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--color-bg-primary, #0a0a0f)',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: '3px solid rgba(139, 92, 246, 0.2)',
          borderTopColor: '#8b5cf6',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <UserGuideProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<LandingPage />} />
                <Route path="create" element={<LandingPage />} />
                <Route path="builder" element={<CircuitBuilderPage />} />
                <Route path="ide" element={<IdePage />} />
                <Route path="simulation-results" element={<ResultsPage />} />
                <Route path="templates" element={<TemplatesPage />} />
                <Route path="templates/:templateId" element={<TemplateDetailsPage />} />
                <Route path="research" element={<ResearchPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="results" element={<ResultsPage />} />
                  <Route path="experiments" element={<ExperimentsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
                <Route path="shared/:experimentId" element={<SharedExperimentPage />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="signup" element={<SignupPage />} />
                {/* Cross-domain SSO handoff — exchanges a one-time token for a session cookie */}
                <Route path="auth/callback" element={<SsoCallbackPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </UserGuideProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
