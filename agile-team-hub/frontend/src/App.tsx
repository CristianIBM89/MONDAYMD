import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { initTeams, getTeamsContext, getTeamsAuthToken, notifyTeamsAppLoaded } from './services/teams';
import { setAuthToken, api } from './services/api';
import { generateDevToken } from './utils/devToken';
import MainMenu from './pages/MainMenu';
import SummaryFlow from './pages/SummaryFlow';
import Dashboard from './pages/Dashboard';
import BlockerForm from './pages/BlockerForm';
import IterationPage from './pages/IterationPage';
import ShowcaseForm from './pages/ShowcaseForm';
import RetroForm from './pages/RetroForm';
import SlackPreview from './pages/SlackPreview';
import ManagerDashboard from './pages/ManagerDashboard';
import SessionsHistory from './pages/SessionsHistory';
import './App.css';

export interface AppUser {
  email: string;
  name: string;
  isInsideTeams: boolean;
}

export interface ActiveIteration {
  id: string;
  nombre: string;
  gerenteNombre: string;
  gerenteEmail: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
}

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [iteration, setIteration] = useState<ActiveIteration | null>(null);
  const [serviceStatus, setServiceStatus] = useState({ monday: false, watsonx: false, slack: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function boot() {
      try {
        const isTeams = await initTeams();
        let email = '';
        let name = '';
        let token = '';

        if (isTeams) {
          const ctx = await getTeamsContext();
          email = ctx?.user?.loginHint ?? ctx?.user?.userPrincipalName ?? '';
          name = ctx?.user?.displayName ?? email;
          token = (await getTeamsAuthToken()) ?? '';
        }

        // Dev fallback — only in development mode
        // Generates a properly signed JWT using Web Crypto API
        if (!token && process.env.NODE_ENV === 'development') {
          email = email || 'dev@ibm.com';
          name = name || 'Dev User';
          token = await generateDevToken(email, name);
        }

        if (!token) {
          setError('No se pudo obtener el token de autenticación. Abre la aplicación dentro de Microsoft Teams.');
          setLoading(false);
          return;
        }

        setAuthToken(token);
        setUser({ email, name, isInsideTeams: isTeams });
        notifyTeamsAppLoaded();

        // Load health + active iteration in parallel
        const [health, iterRes] = await Promise.allSettled([
          api.health(),
          api.getActiveIteration(),
        ]);

        if (health.status === 'fulfilled') {
          const h = health.value;
          setServiceStatus({
            monday: Boolean(h.services?.monday),
            watsonx: Boolean(h.services?.watsonx),
            slack: Boolean(h.services?.slack),
          });
        }

        if (iterRes.status === 'fulfilled') {
          const it = (iterRes.value as { iteration: ActiveIteration | null }).iteration;
          if (it) setIteration(it);
        }
      } catch (err) {
        setError(`Error iniciando la aplicación: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  if (loading) return <div className="ath-loading"><div className="ath-spinner" /><p>Iniciando Agile Team Hub...</p></div>;
  if (error) return <div className="ath-error"><h2>Error de inicio</h2><p>{error}</p></div>;
  if (!user) return <div className="ath-error"><p>No se pudo autenticar. Abre la aplicación desde Microsoft Teams.</p></div>;

  const sharedProps = { user, iteration, serviceStatus };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainMenu {...sharedProps} />} />
        <Route path="/summary" element={<SummaryFlow {...sharedProps} />} />
        <Route path="/dashboard" element={<Dashboard {...sharedProps} />} />
        <Route path="/blocker" element={<BlockerForm {...sharedProps} />} />
        <Route path="/blocker/:suggestedData" element={<BlockerForm {...sharedProps} />} />
        <Route path="/iteration" element={<IterationPage {...sharedProps} />} />
        <Route path="/showcase" element={<ShowcaseForm {...sharedProps} />} />
        <Route path="/retro" element={<RetroForm {...sharedProps} />} />
        <Route path="/slack/:summaryId" element={<SlackPreview {...sharedProps} />} />
        <Route path="/manager" element={<ManagerDashboard {...sharedProps} />} />
        <Route path="/sessions" element={<SessionsHistory {...sharedProps} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
