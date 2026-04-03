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
import Wallet from './pages/Wallet';
import Faucet from './pages/Faucet';
import Shortlinks from './pages/Shortlinks';
import Checkin from './pages/Checkin';
import PopularOffers from './pages/PopularOffers';
import YouTubeWatch from './pages/YouTubeWatch';
import Ranking from './pages/Ranking';
import PublicRoom from './pages/PublicRoom';
import Settings from './pages/Settings';
import AutoMining from './pages/AutoMining';
import Games from './pages/Games';
import ShortlinkStep from './pages/ShortlinkStep';
import Farm from './pages/Farm';

import ChatSidebar from './components/ChatSidebar';
import AdBlockDetector from './components/AdBlockDetector';

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
import Landing from './pages/Landing';

const ProtectedLayout = () => {
  const { isAuthenticated, isLoading } = useAuthStore();

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
        <main className="flex-1 overflow-y-auto scrollbar-hide mt-14 md:mt-0">
          <div className="p-4 pb-24 md:p-8 md:pb-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
        <ChatSidebar />
      </div>
    </div>
  );
};

function App() {
  const { checkSession, isLoading } = useAuthStore();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex justify-center items-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

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

        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/offers" element={<PopularOffers />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/faucet" element={<Faucet />} />
          <Route path="/shortlinks" element={<Shortlinks />} />
          <Route path="/checkin" element={<Checkin />} />
          <Route path="/youtube" element={<YouTubeWatch />} />
          <Route path="/auto-mining" element={<AutoMining />} />
          <Route path="/farm" element={<Farm />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/room/:username" element={<PublicRoom />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/games" element={<Games />} />
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App;
