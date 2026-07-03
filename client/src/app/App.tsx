import type { JSX } from 'react';
import { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from '../store/auth';
import { lazyWithRetry } from '../shared/utils/lazyWithRetry';

/** Eager: first paint must not wait on a second chunk fetch (lazy was a full-screen spinner on `/`). */
import Landing from '../pages/landing';
import Login from '../pages/auth/login/LoginPage';
import Register from '../pages/auth/register/RegisterPage';
import Dashboard from '../pages/dashboard';

import Sidebar from '../shared/components/Sidebar';
import Header from '../shared/components/Header';
import ChatSidebar from '../shared/components/ChatSidebar';
import AdBlockDetector from '../shared/components/AdBlockDetector';
import SiteFooter from '../shared/components/SiteFooter';
import BroadcastPopup from '../shared/components/BroadcastPopup';
import PtcSessionManager from '../shared/components/PtcSessionManager';
import TransparencyErrorBoundary from '../shared/components/TransparencyErrorBoundary';
import { prefetchProtectedBootstrap } from '../shared/utils/routePrefetch';

const ForgotPassword = lazyWithRetry(() => import('../pages/auth/forgot-password/ForgotPasswordPage'));
const Shop = lazyWithRetry(() => import('../pages/shop'));
const Inventory = lazyWithRetry(() => import('../pages/machines'));
const Inventario = lazyWithRetry(() => import('../pages/inventario'));
const Vault = lazyWithRetry(() => import('../pages/vault'));
const Wallet = lazyWithRetry(() => import('../pages/wallet'));
const Faucet = lazyWithRetry(() => import('../pages/faucet'));
const Shortlinks = lazyWithRetry(() => import('../pages/shortlinks'));
const Checkin = lazyWithRetry(() => import('../pages/checkin'));
const PowerStatistics = lazyWithRetry(() => import('../pages/stats'));
const PopularOffers = lazyWithRetry(() => import('../pages/offers'));
const DailyTasks = lazyWithRetry(() => import('../pages/tasks'));
const Support = lazyWithRetry(() => import('../pages/support'));
const TaxesPage = lazyWithRetry(() => import('../pages/taxes'));
const YouTubeWatch = lazyWithRetry(() => import('../pages/youtube-watch'));
const Ranking = lazyWithRetry(() => import('../pages/ranking'));
const PublicRoom = lazyWithRetry(() => import('../pages/public-room'));
const Settings = lazyWithRetry(() => import('../pages/settings'));
const AutoMining = lazyWithRetry(() => import('../pages/auto-mining'));
const Games = lazyWithRetry(() => import('../pages/games'));
const Game2048Page = lazyWithRetry(() => import('../pages/games/game-2048'));
const GameSessionPage = lazyWithRetry(() => import('../pages/games/GameSessionPage'));
const PartnerGamePlayPage = lazyWithRetry(() => import('../pages/games/partner/PartnerGamePlayPage'));
const GameVerifyPage = lazyWithRetry(() => import('../pages/games/verify'));
const ShortlinkStep = lazyWithRetry(() => import('../pages/shortlinks/ShortlinkStepPage'));
const Roadmap = lazyWithRetry(() => import('../pages/roadmap'));
const Manual = lazyWithRetry(() => import('../pages/manual'));
const CalculatorPage = lazyWithRetry(() => import('../pages/calculator'));
const AdminLogin = lazyWithRetry(() => import('../pages/admin/AdminLogin'));
const AdminLayout = lazyWithRetry(() => import('../pages/admin/components/AdminLayout'));
const AdminDashboard = lazyWithRetry(() => import('../pages/admin/AdminDashboard'));
const AdminMiners = lazyWithRetry(() => import('../pages/admin/AdminMiners'));
const AdminUsers = lazyWithRetry(() => import('../pages/admin/AdminUsers'));
const AdminFraudSignals = lazyWithRetry(() => import('../pages/admin/AdminFraudSignals'));
const AdminFinance = lazyWithRetry(() => import('../pages/admin/AdminFinance'));
const AdminBackups = lazyWithRetry(() => import('../pages/admin/AdminBackups'));
const AdminLogs = lazyWithRetry(() => import('../pages/admin/AdminLogs'));
const AdminClientErrors = lazyWithRetry(() => import('../pages/admin/AdminClientErrors'));
const AdminMetrics = lazyWithRetry(() => import('../pages/admin/AdminMetrics'));
const AdminOfferEvents = lazyWithRetry(() => import('../pages/admin/AdminOfferEvents'));
const AdminOfferEventManage = lazyWithRetry(() => import('../pages/admin/AdminOfferEventManage'));
const AdminSupport = lazyWithRetry(() => import('../pages/admin/AdminSupport'));
const AdminPublicSupport = lazyWithRetry(() => import('../pages/admin/AdminPublicSupport'));
const AdminBanners = lazyWithRetry(() => import('../pages/admin/AdminBanners'));
const AdminCreatorsSocial = lazyWithRetry(() => import('../pages/admin/AdminCreatorsSocial'));
const AdminTransparency = lazyWithRetry(() => import('../pages/admin/AdminTransparency'));
const AdminAnalytics = lazyWithRetry(() => import('../pages/admin/AdminAnalytics'));
const AdminBroadcast = lazyWithRetry(() => import('../pages/admin/AdminBroadcast'));
const AdminCheckinMilestones = lazyWithRetry(() => import('../pages/admin/AdminCheckinMilestones'));
const AdminReadEarn = lazyWithRetry(() => import('../pages/admin/AdminReadEarn'));
const AdminUserSidebar = lazyWithRetry(() => import('../pages/admin/AdminUserSidebar'));
const AdminDailyTasks = lazyWithRetry(() => import('../pages/admin/AdminDailyTasks'));
const AdminInternalOfferwall = lazyWithRetry(() => import('../pages/admin/AdminInternalOfferwall'));
const AdminMiniPass = lazyWithRetry(() => import('../pages/admin/AdminMiniPass'));
const AdminMiniPassSeason = lazyWithRetry(() => import('../pages/admin/AdminMiniPassSeason'));
const AdminTournaments = lazyWithRetry(() => import('../pages/admin/AdminTournaments'));
const AdminOfferwallAnalytics = lazyWithRetry(() => import('../pages/admin/AdminOfferwallAnalytics'));
const AdminTrafficStats = lazyWithRetry(() => import('../pages/admin/AdminTrafficStats'));
const AdminPtc = lazyWithRetry(() => import('../pages/admin/AdminPtc'));
const AdminPartnerGames = lazyWithRetry(() => import('../pages/admin/AdminPartnerGames'));
const AdminBurnEvents = lazyWithRetry(() => import('../pages/admin/AdminBurnEvents'));
const PtcViewPage = lazyWithRetry(() => import('../pages/ptc/PtcViewPage'));
const PtcCampaignsPage = lazyWithRetry(() => import('../pages/ptc/PtcCampaignsPage'));
const ReadEarn = lazyWithRetry(() => import('../pages/read-earn'));
const InternalOfferwall = lazyWithRetry(() => import('../pages/internal-offerwall'));
const Zerads = lazyWithRetry(() => import('../pages/zerads'));
const Offerwall = lazyWithRetry(() => import('../pages/offerwall'));
const MiniPass = lazyWithRetry(() => import('../pages/mini-pass'));
const Transparency = lazyWithRetry(() => import('../pages/transparency'));
const LiveServer = lazyWithRetry(() => import('../pages/live-server'));
const PrivacyPolicy = lazyWithRetry(() => import('../pages/legal/privacy-policy'));
const TermsOfUse = lazyWithRetry(() => import('../pages/legal/terms-of-use'));
const Tournaments = lazyWithRetry(() => import('../pages/tournaments'));
const BurnEvents = lazyWithRetry(() => import('../pages/burn/BurnEventsPage'));
import Web3Boundary from '../shared/web3/Web3Boundary';

const ZERADS_TEST_URL = 'https://zerads.com/ptc.php?ref=10776&user=test';

function ZeradsAutoOpen(): JSX.Element {
  useEffect(() => {
    window.open(ZERADS_TEST_URL, '_blank', 'noopener,noreferrer');
  }, []);
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] gap-4 text-white">
      <p className="text-lg font-bold">Abrindo Zerads PTC...</p>
      <p className="text-sm text-slate-400">Se não abriu, o popup foi bloqueado pelo browser.</p>
      <a
        href={ZERADS_TEST_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-6 py-3 font-semibold transition-colors"
      >
        Abrir manualmente
      </a>
    </div>
  );
}

function RouteLoader(): JSX.Element {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

/** Keeps chrome mounted while lazy route chunks load (avoids full-app Suspense remounts). */
function ProtectedOutletFallback(): JSX.Element {
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

  return (
    <div className="flex h-screen bg-background overflow-hidden text-gray-100 font-sans">
      <PtcSessionManager />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header />
        <BroadcastPopup />
        <main className="flex-1 overflow-y-auto scrollbar-hide mt-14 md:mt-0">
          <div className="w-full max-w-7xl mx-auto px-3 py-4 pb-24 sm:px-4 md:p-8 md:pb-8">
            <Suspense fallback={<ProtectedOutletFallback />}>
              <Outlet />
            </Suspense>
          </div>
          <SiteFooter compact />
        </main>
        <ChatSidebar />
      </div>
    </div>
  );
};

const ProtectedNoLayout = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const checkSession = useAuthStore((s) => s.checkSession);
  useEffect(() => { void checkSession({ silent: true }); }, [checkSession]);
  if (isLoading) return <RouteLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <Suspense fallback={<RouteLoader />}>
      <Outlet />
    </Suspense>
  );
};

/** Wagmi/AppKit chunk loads only when entering the authenticated shell (not on `/`). */
function ProtectedLayoutWithWeb3() {
  return (
    <Web3Boundary fallback={<RouteLoader />}>
      <ProtectedLayout />
    </Web3Boundary>
  );
}

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
          <Route path="/zerads" element={<ZeradsAutoOpen />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/checkin" element={<Checkin />} />
          </Route>

          <Route element={<ProtectedNoLayout />}>
            <Route path="/games/:slug" element={<GameSessionPage />} />
          </Route>

          <Route element={<ProtectedLayoutWithWeb3 />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/power-stats" element={<PowerStatistics />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/offers" element={<PopularOffers />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/vault" element={<Vault />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/wallets" element={<Navigate to="/wallet" replace />} />
            <Route path="/faucet" element={<Faucet />} />
            <Route path="/shortlinks" element={<Shortlinks />} />
            <Route path="/read-earn" element={<ReadEarn />} />
            <Route path="/internal-offerwall" element={<InternalOfferwall />} />
            <Route path="/offerwall" element={<Offerwall />} />
            <Route path="/ptc" element={<PtcViewPage />} />
            <Route path="/ptc/campaigns" element={<PtcCampaignsPage />} />
            <Route path="/offerwall-zerads" element={<Navigate to="/offerwall" replace />} />
            <Route path="/offerwallme" element={<Navigate to="/offerwall" replace />} />
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
            <Route path="/taxes" element={<TaxesPage />} />
            <Route path="/games/partner/:slug" element={<PartnerGamePlayPage />} />
            <Route path="/games" element={<Games />} />
            <Route path="/games/verify" element={<GameVerifyPage />} />
            <Route path="/games/2048" element={<Game2048Page />} />
            <Route path="/minigame" element={<Navigate to="/games" replace />} />
            <Route path="/roadmap" element={<Roadmap />} />
            <Route path="/manual" element={<Manual />} />
            <Route path="/calculator" element={<CalculatorPage />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/burn" element={<BurnEvents />} />
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
            <Route path="/admin/client-errors" element={<AdminClientErrors />} />
            <Route path="/admin/metrics" element={<AdminMetrics />} />
            <Route path="/admin/offer-events" element={<AdminOfferEvents />} />
            <Route path="/admin/offer-events/:id" element={<AdminOfferEventManage />} />
            <Route path="/admin/support" element={<AdminSupport />} />
            <Route path="/admin/public-support" element={<AdminPublicSupport />} />
            <Route path="/admin/banners" element={<AdminBanners />} />
            <Route path="/admin/creators" element={<AdminCreatorsSocial />} />
            <Route path="/admin/transparency" element={<AdminTransparency />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/offerwall-analytics" element={<AdminOfferwallAnalytics />} />
            <Route path="/admin/broadcast" element={<AdminBroadcast />} />
            <Route path="/admin/checkin-milestones" element={<AdminCheckinMilestones />} />
            <Route path="/admin/tasks" element={<AdminDailyTasks />} />
            <Route path="/admin/daily-tasks" element={<Navigate to="/admin/tasks" replace />} />
            <Route path="/admin/read-earn" element={<AdminReadEarn />} />
            <Route path="/admin/internal-offerwall" element={<AdminInternalOfferwall />} />
            <Route path="/admin/user-sidebar" element={<AdminUserSidebar />} />
            <Route path="/admin/mini-pass" element={<AdminMiniPass />} />
            <Route path="/admin/mini-pass/:id" element={<AdminMiniPassSeason />} />
            <Route path="/admin/social" element={<Navigate to="/admin/creators" replace />} />
            <Route path="/admin/tournaments" element={<AdminTournaments />} />
            <Route path="/admin/traffic" element={<AdminTrafficStats />} />
            <Route path="/admin/ptc" element={<AdminPtc />} />
            <Route path="/admin/partner-games" element={<AdminPartnerGames />} />
            <Route path="/admin/burn-events" element={<AdminBurnEvents />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
