import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import CreatePage from './pages/CreatePage';
import ResultsPage from './pages/ResultsPage';
import ExperimentsPage from './pages/ExperimentsPage';
import TemplatesPage from './pages/TemplatesPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import CircuitBuilderPage from './pages/CircuitBuilderPage';
import IdePage from './pages/IdePage';
import SharedExperimentPage from './pages/SharedExperimentPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import './styles/variables.css';
import './styles/global.css';
import './App.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/create" replace />} />
            <Route path="create" element={<CreatePage />} />
            <Route path="builder" element={<CircuitBuilderPage />} />
            <Route path="ide" element={<IdePage />} />
            <Route path="results" element={<ResultsPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="experiments" element={<ExperimentsPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="shared/:experimentId" element={<SharedExperimentPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="signup" element={<SignupPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
