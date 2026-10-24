import { Suspense, lazy, useEffect } from 'react';
import { Router, useLocation, useNavigate } from './router';
import { ThemeProvider } from './context/Theme';
import { ToastProvider } from './context/Toast';
import { AuthProvider, useAuth } from './context/Auth';
import SiteLayout from './components/layout/SiteLayout';
import AccountLayout from './components/layout/AccountLayout';
import { Spinner } from './components/ui';
import Home from './pages/Home';
import BuyData from './pages/BuyData';
import NotFound from './pages/NotFound';

// Everything except the landing and purchase pages loads on demand.
const DataSuccess = lazy(() => import('./pages/DataSuccess'));
const Results = lazy(() => import('./pages/Results'));
const Track = lazy(() => import('./pages/Track'));
const Guide = lazy(() => import('./pages/Guide'));
const Developers = lazy(() => import('./pages/Developers'));
const Support = lazy(() => import('./pages/Support'));
const Terms = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Privacy })));
const Login = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Signup })));
const Dashboard = lazy(() => import('./pages/account/Dashboard'));
const Orders = lazy(() => import('./pages/account/Orders'));
const Wallet = lazy(() => import('./pages/account/Wallet'));
const Fund = lazy(() => import('./pages/account/Fund'));
const Settings = lazy(() => import('./pages/account/Settings'));
const Transfer = lazy(() => import('./pages/admin/Transfer'));

const PUBLIC_ROUTES = {
  '/': Home,
  '/data': BuyData,
  '/data/success': DataSuccess,
  '/results': Results,
  '/track': Track,
  '/how-it-works': Guide,
  '/developers': Developers,
  '/support': Support,
  '/terms': Terms,
  '/privacy': Privacy,
  '/login': Login,
  '/signup': Signup,
  '/admin/transfer': Transfer,
};

const ACCOUNT_ROUTES = {
  '/account': Dashboard,
  '/account/orders': Orders,
  '/account/wallet': Wallet,
  '/account/fund': Fund,
  '/account/settings': Settings,
};

const Loading = () => (
  <div className="pageloading" role="status" aria-label="Loading">
    <Spinner size={28} />
  </div>
);

/** Sends signed-out visitors to the login page and brings them back afterwards. */
function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const { path } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
  }, [ready, user, path, navigate]);

  if (!ready || !user) return <Loading />;
  return children;
}

function Routes() {
  const { path } = useLocation();
  const Account = ACCOUNT_ROUTES[path];
  const Page = PUBLIC_ROUTES[path];

  let content;
  if (Account) {
    content = (
      <RequireAuth>
        <AccountLayout>
          <Account />
        </AccountLayout>
      </RequireAuth>
    );
  } else if (Page) {
    content = <Page />;
  } else {
    content = <NotFound />;
  }

  return (
    <SiteLayout>
      <Suspense fallback={<Loading />}>{content}</Suspense>
    </SiteLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Router>
            <Routes />
          </Router>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
