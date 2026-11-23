import { useEffect, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PublicSite } from './components/PublicSite';

const BASE_URL = import.meta.env.BASE_URL || '/';

function isAdminLocation(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '');
  const hash = window.location.hash.replace(/^#/, '').replace(/\/+$/, '');
  return path.endsWith('/admin') || hash === '/admin' || hash === 'admin';
}

export default function App() {
  const [adminView, setAdminView] = useState<boolean>(() => isAdminLocation());

  useEffect(() => {
    const onNav = () => setAdminView(isAdminLocation());
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', onNav);
    return () => {
      window.removeEventListener('popstate', onNav);
      window.removeEventListener('hashchange', onNav);
    };
  }, []);

  const navigateToAdmin = () => {
    window.history.pushState({}, '', `${BASE_URL}admin`);
    setAdminView(true);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const navigateToSite = () => {
    window.history.pushState({}, '', BASE_URL);
    setAdminView(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  return (
    <ErrorBoundary>
      {adminView ? (
        <AdminPanel onBackToSite={navigateToSite} />
      ) : (
        <PublicSite onOpenAdmin={navigateToAdmin} />
      )}
    </ErrorBoundary>
  );
}
