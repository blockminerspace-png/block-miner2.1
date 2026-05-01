import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from './store/auth';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatSidebar from './components/ChatSidebar';
import AdBlockDetector from './components/AdBlockDetector';
import AdBanner from './components/AdBanner';
import SiteFooter from './components/SiteFooter';
import BroadcastPopup from './components/BroadcastPopup';
import TransparencyErrorBoundary from './components/TransparencyErrorBoundary';
import { prefetchProtectedBootstrap } from './utils/routePrefetch.js';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Shop = lazy(() => import('./pages/Shop'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Vault = lazy(() => import('./pages/Vault'));
const Wallet = lazy(() => import('./pages/Wallet'));
const Faucet = lazy(() => import('./pages/Faucet'));
const Shortlinks = lazy(() => import('./pages/Shortlinks'));
const Checkin = lazy(() => import('./pages/Checkin'));
const PowerStatistics = lazy(() => import('./pages/PowerStatistics'));
const PopularOffers = lazy(() => import('./pages/PopularOffers'));
const YouTubeWatch = lazy(() => import('./pages/YouTubeWatch'));
const Ranking = lazy(() => import('./pages/Ranking'));
const PublicRoom = lazy(() => import('./pages/PublicRoom'));
const Settings = lazy(() => import('./pages/Settings'));
const AutoMining = lazy(() => import('./pages/AutoMining'));
const Games = lazy(() => import('./pages/Games'));
const Game2048Page = lazy(() => import('./pages/Game2048Page'));
const ShortlinkStep = lazy(() => import('./pages/ShortlinkStep'));
const Roadmap = lazy(() => import('./pages/Roadmap'));
const Manual = lazy(() => import('./pages/Manual'));
const CalculatorPage = lazy(() => import('./pages/Calculator'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminLayout = lazy(() => import('./components/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminMiners = lazy(() => import('./pages/AdminMiners'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminFraudSignals = lazy(() => import('./pages/AdminFraudSignals'));
const AdminFinance = lazy(() => import('./pages/AdminFinance'));
const AdminBackups = lazy(() => import('./pages/AdminBackups'));
const AdminLogs = lazy(() => import('./pages/AdminLogs'));
const AdminMetrics = lazy(() => import('./pages/AdminMetrics'));
const AdminOfferEvents = lazy(() => import('./pages/AdminOfferEvents'));
const AdminOfferEventManage = lazy(() => import('./pages/AdminOfferEventManage'));
const AdminSupport = lazy(() => import('./pages/AdminSupport'));
const AdminDepositTickets = lazy(() => import('./pages/AdminDepositTickets'));
const AdminBanners = lazy(() => import('./pages/AdminBanners'));
const AdminCreators = lazy(() => import('./pages/AdminCreators'));
const AdminTransparency = lazy(() => import('./pages/AdminTransparency'));
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'));
const AdminBroadcast = lazy(() => import('./pages/AdminBroadcast'));
const AdminCheckinMilestones = lazy(() => import('./pages/AdminCheckinMilestones'));
const AdminReadEarn = lazy(() => import('./pages/AdminReadEarn'));
const AdminUserSidebar = lazy(() => import('./pages/AdminUserSidebar'));
const AdminDailyTasks = lazy(() => import('./pages/AdminDailyTasks'));
const AdminInternalOfferwall = lazy(() => import('./pages/AdminInternalOfferwall'));
const AdminStreaming = lazy(() => import('./pages/AdminStreaming'));
const AdminMiniPass = lazy(() => import('./pages/AdminMiniPass'));
const AdminMiniPassSeason = lazy(() => import('./pages/AdminMiniPassSeason'));
const ReadEarn = lazy(() => import('./pages/ReadEarn'));
const InternalOfferwall = lazy(() => import('./pages/InternalOfferwall'));
const MiniPass = lazy(() => import('./pages/MiniPass'));
const DailyTasks = lazy(() => import('./pages/DailyTasks'));
const Transparency = lazy(() => import('./pages/Transparency'));
const Landing = lazy(() => import('./pages/Landing'));
const LiveServer = lazy(() => import('./pages/LiveServer'));
const DashboardCryptoStream = lazy(() => import('./pages/DashboardCryptoStream'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'));
const Support = lazy(() => import('./pages/Support'));

function RouteLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

/** Keeps chrome mounted while lazy route chunks load (avoids full-app Suspense remounts). */
function ProtectedOutletFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center py-12" aria-busy="true" aria-live="polite">
      <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
    </div>
  );
}

const ProtectedLayout = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const checkSession = useAuthStore((s) => s.checkSession);
  const location = useLocation();

  useEffect(() => {
    void checkSession({ silent: true });
  }, [checkSession]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const run = () => prefetchProtectedBootstrap();
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(run, { timeout: 3500 });
      return () => cancelIdleCallback(id);
    }
    const tid = window.setTimeout(run, 1600);
    return () => clearTimeout(tid);
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const showPageAds = !['/dashboard', '/wallet', '/wallets'].includes(location.pathname);

  return (
    <div className="flex h-screen bg-background overflow-hidden text-gray-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header />
        <BroadcastPopup />
        <main className="flex-1 overflow-y-auto scrollbar-hide mt-14 md:mt-0">
          <div className="w-full max-w-7xl mx-auto px-3 py-4 pb-24 sm:px-4 md:p-8 md:pb-8">
            {showPageAds && <AdBanner size="728x90" />}
            <Suspense fallback={<ProtectedOutletFallback />}>
              <Outlet />
            </Suspense>
            {showPageAds && <AdBanner size="728x90" />}
          </div>
          <SiteFooter compact />
        </main>
        <ChatSidebar />
      </div>
    </div>
  );
};

function App() {
  const { checkSession } = useAuthStore();

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // Do not gate the whole SPA on session resolution: /login and other public routes should paint
  // immediately. ProtectedLayout already shows a spinner while resolving auth for private pages.

  return (
    <BrowserRouter>
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors={false}
        expand={true}
        toastOptions={{
          className: 'bg-slate-950/80 backdrop-blur-md border border-white/5 rounded-xl text-white font-mono text-[10px] uppercase tracking-widest p-4 shadow-2xl',
          style: {
            background: 'rgba(2, 6, 23, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            color: '#fff',
          },
          classNames: {
            error: 'border-red-500/30 !text-red-400',
            success: 'border-emerald-500/30 !text-emerald-400',
            warning: 'border-orange-500/30 !text-orange-400',
            info: 'border-blue-500/30 !text-blue-400',
          },
        }}
      />
      <AdBlockDetector />
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-use" element={<TermsOfUse />} />
          <Route path="/liveserver" element={<LiveServer />} />
          <Route path="/dashboardcrypto" element={<DashboardCryptoStream />} />

          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/power-stats" element={<PowerStatistics />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/offers" element={<PopularOffers />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/vault" element={<Vault />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/wallets" element={<Navigate to="/wallet" replace />} />
            <Route path="/faucet" element={<Faucet />} />
            <Route path="/shortlinks" element={<Shortlinks />} />
            <Route path="/checkin" element={<Checkin />} />
            <Route path="/read-earn" element={<ReadEarn />} />
            <Route path="/internal-offerwall" element={<InternalOfferwall />} />
            <Route path="/mini-pass" element={<MiniPass />} />
            <Route path="/mini-pass/:seasonId" element={<MiniPass />} />
            <Route path="/tasks" element={<DailyTasks />} />
            <Route path="/daily-tasks" element={<Navigate to="/tasks" replace />} />
            <Route path="/youtube" element={<YouTubeWatch />} />
            <Route path="/auto-mining" element={<AutoMining />} />
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/room/:username" element={<PublicRoom />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/support" element={<Support />} />
            <Route path="/games" element={<Games />} />
            <Route path="/games/2048" element={<Game2048Page />} />
            <Route path="/minigame" element={<Navigate to="/games" replace />} />
            <Route path="/roadmap" element={<Roadmap />} />
            <Route path="/manual" element={<Manual />} />
            <Route path="/calculator" element={<CalculatorPage />} />
            <Route path="/transparency" element={<TransparencyErrorBoundary><Transparency /></TransparencyErrorBoundary>} />
            <Route path="/shortlink/internal-shortlink/step/:step" element={<ShortlinkStep />} />
          </Route>

          {/* Admin Routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/fraud-signals" element={<AdminFraudSignals />} />
            <Route path="/admin/miners" element={<AdminMiners />} />
            <Route path="/admin/finance" element={<AdminFinance />} />
            <Route path="/admin/backups" element={<AdminBackups />} />
            <Route path="/admin/logs" element={<AdminLogs />} />
            <Route path="/admin/metrics" element={<AdminMetrics />} />
            <Route path="/admin/offer-events" element={<AdminOfferEvents />} />
            <Route path="/admin/offer-events/:id" element={<AdminOfferEventManage />} />
            <Route path="/admin/support" element={<AdminSupport />} />
            <Route path="/admin/deposit-tickets" element={<AdminDepositTickets />} />
            <Route path="/admin/banners" element={<AdminBanners />} />
            <Route path="/admin/creators" element={<AdminCreators />} />
            <Route path="/admin/transparency" element={<AdminTransparency />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/broadcast" element={<AdminBroadcast />} />
            <Route path="/admin/checkin-milestones" element={<AdminCheckinMilestones />} />
            <Route path="/admin/tasks" element={<AdminDailyTasks />} />
            <Route path="/admin/daily-tasks" element={<Navigate to="/admin/tasks" replace />} />
            <Route path="/admin/read-earn" element={<AdminReadEarn />} />
            <Route path="/admin/internal-offerwall" element={<AdminInternalOfferwall />} />
            <Route path="/admin/streaming" element={<AdminStreaming />} />
            <Route path="/admin/user-sidebar" element={<AdminUserSidebar />} />
            <Route path="/admin/mini-pass" element={<AdminMiniPass />} />
            <Route path="/admin/mini-pass/:id" element={<AdminMiniPassSeason />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App;
