import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from './store/auth';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Shop from './pages/Shop';
import Inventory from './pages/Inventory';
import Vault from './pages/Vault';
import Wallet from './pages/Wallet';
import Faucet from './pages/Faucet';
import Shortlinks from './pages/Shortlinks';
import Checkin from './pages/Checkin';
import PowerStatistics from './pages/PowerStatistics';
import PopularOffers from './pages/PopularOffers';
import YouTubeWatch from './pages/YouTubeWatch';
import Ranking from './pages/Ranking';
import PublicRoom from './pages/PublicRoom';
import Settings from './pages/Settings';
import AutoMining from './pages/AutoMining';
import Games from './pages/Games';
import Game2048Page from './pages/Game2048Page';
import ShortlinkStep from './pages/ShortlinkStep';
import Roadmap from './pages/Roadmap';
import Manual from './pages/Manual';
import CalculatorPage from './pages/Calculator';
import ChatSidebar from './components/ChatSidebar';
import AdBlockDetector from './components/AdBlockDetector';
import AdBanner from './components/AdBanner';
import SiteFooter from './components/SiteFooter';

import AdminLogin from './pages/AdminLogin';
import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminMiners from './pages/AdminMiners';
import AdminUsers from './pages/AdminUsers';
import AdminFinance from './pages/AdminFinance';
import AdminBackups from './pages/AdminBackups';
import AdminLogs from './pages/AdminLogs';
import AdminMetrics from './pages/AdminMetrics';
import AdminOfferEvents from './pages/AdminOfferEvents';
import AdminOfferEventManage from './pages/AdminOfferEventManage';
import AdminSupport from './pages/AdminSupport';
import AdminDepositTickets from './pages/AdminDepositTickets';
import AdminBanners from './pages/AdminBanners';
import AdminCreators from './pages/AdminCreators';
import AdminTransparency from './pages/AdminTransparency';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminBroadcast from './pages/AdminBroadcast';
import AdminCheckinMilestones from './pages/AdminCheckinMilestones';
import AdminReadEarn from './pages/AdminReadEarn';
import AdminUserSidebar from './pages/AdminUserSidebar';
import AdminDailyTasks from './pages/AdminDailyTasks';
import AdminInternalOfferwall from './pages/AdminInternalOfferwall';
import AdminStreaming from './pages/AdminStreaming';
import AdminMiniPass from './pages/AdminMiniPass';
import AdminMiniPassSeason from './pages/AdminMiniPassSeason';
import ReadEarn from './pages/ReadEarn';
import InternalOfferwall from './pages/InternalOfferwall';
import MiniPass from './pages/MiniPass';
import DailyTasks from './pages/DailyTasks';
import BroadcastPopup from './components/BroadcastPopup';
import Transparency from './pages/Transparency';
import TransparencyErrorBoundary from './components/TransparencyErrorBoundary';
import Landing from './pages/Landing';
import LiveServer from './pages/LiveServer';
import DashboardCryptoStream from './pages/DashboardCryptoStream';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfUse from './pages/TermsOfUse';
import Support from './pages/Support';
import SidebarPathGate from './components/SidebarPathGate';

const ProtectedLayout = () => {
  const { isAuthenticated, isLoading, checkSession } = useAuthStore();

  useEffect(() => {
    void checkSession({ silent: true });
  }, [checkSession]);

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
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header />
        <BroadcastPopup />
        <main className="flex-1 overflow-y-auto scrollbar-hide mt-14 md:mt-0">
          <div className="p-4 pb-24 md:p-8 md:pb-8 max-w-7xl mx-auto">
            <AdBanner size="728x90" />
            <Outlet />
            <AdBanner size="728x90" />
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
          <Route
            path="/checkin"
            element={
              <SidebarPathGate requiredPath="/checkin">
                <Checkin />
              </SidebarPathGate>
            }
          />
          <Route path="/read-earn" element={<ReadEarn />} />
          <Route path="/internal-offerwall" element={<InternalOfferwall />} />
          <Route path="/mini-pass" element={<MiniPass />} />
          <Route path="/mini-pass/:seasonId" element={<MiniPass />} />
          <Route path="/daily-tasks" element={<DailyTasks />} />
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
          <Route path="/admin/daily-tasks" element={<AdminDailyTasks />} />
          <Route path="/admin/read-earn" element={<AdminReadEarn />} />
          <Route path="/admin/internal-offerwall" element={<AdminInternalOfferwall />} />
          <Route path="/admin/streaming" element={<AdminStreaming />} />
          <Route path="/admin/user-sidebar" element={<AdminUserSidebar />} />
          <Route path="/admin/mini-pass" element={<AdminMiniPass />} />
          <Route path="/admin/mini-pass/:id" element={<AdminMiniPassSeason />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App;
