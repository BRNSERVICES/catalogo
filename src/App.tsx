import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Login from './pages/Login';
import NewPassword from './pages/NewPassword';
import Circuits from './pages/Circuits';
import CircuitDetail from './pages/CircuitDetail';
import ImportPage from './pages/Import';
import { Spinner } from './components/ui';

function Gate() {
  const { session, profile, loading, recovery, isAdmin, signOut } = useAuth();
  if (loading) return <Spinner />;
  if (recovery) return <NewPassword />;
  if (!session) return <Login />;
  if (!profile?.active) {
    return (
      <div className="login"><div className="card login-card">
        <h1>Acesso pendente</h1>
        <p>Seu usuário ainda não foi liberado. Peça a um administrador para ativar o seu acesso.</p>
        <button className="btn" onClick={() => void signOut()}>Sair</button>
      </div></div>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/circuitos" element={<Circuits />} />
        <Route path="/circuitos/:id" element={<CircuitDetail />} />
        <Route path="/importacao" element={isAdmin ? <ImportPage /> : <Navigate to="/circuitos" replace />} />
        <Route path="*" element={<Navigate to="/circuitos" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return <AuthProvider><HashRouter><Gate /></HashRouter></AuthProvider>;
}
