import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROLE_LABEL } from '../lib/format';

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">▣ Catálogo Telecom</div>
        <nav>
          <NavLink to="/circuitos">Circuitos</NavLink>
          {isAdmin && <NavLink to="/importacao">Importação</NavLink>}
        </nav>
        <div className="who">
          <div>{profile?.full_name || profile?.email}</div>
          <small>{profile ? ROLE_LABEL[profile.role] : ''}</small>
          <button className="btn btn-ghost" onClick={() => void signOut()}>Sair</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
