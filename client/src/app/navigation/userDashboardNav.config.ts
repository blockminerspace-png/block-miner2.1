import type { PublicNavCategory } from '../../shared/utils/sidebarNavPublicSchema';

/**
 * Fonte única de verdade para o menu lateral do utilizador (fallback quando `/api/sidebar/nav` falha).
 * Desktop + mobile (Sidebar.tsx) usam o mesmo payload após parse.
 */
export const USER_DASHBOARD_NAV_FALLBACK: PublicNavCategory[] = [
  {
    section: 'main',
    titleKey: 'sidebar.categories.main',
    items: [
      { itemId: 'dashboard', labelKey: 'sidebar.dashboard', icon: 'LayoutDashboard', path: '/dashboard' },
      { itemId: 'power_stats', labelKey: 'sidebar.power_stats', icon: 'BarChart3', path: '/power-stats' },
      { itemId: 'machines', labelKey: 'sidebar.machines', icon: 'Cpu', path: '/inventory' },
      { itemId: 'shop', labelKey: 'sidebar.shop', icon: 'ShoppingCart', path: '/shop' },
      { itemId: 'offers', labelKey: 'sidebar.offers', icon: 'Tag', path: '/offers' },
      { itemId: 'wallet', labelKey: 'sidebar.wallet', icon: 'Wallet', path: '/wallet' },
      { itemId: 'support', labelKey: 'sidebar.support', icon: 'LifeBuoy', path: '/support' },
    ],
  },
  {
    section: 'earn',
    titleKey: 'sidebar.categories.earn',
    items: [
      { itemId: 'checkin', labelKey: 'sidebar.checkin', icon: 'Calendar', path: '/checkin' },
      { itemId: 'mini_pass', labelKey: 'sidebar.mini_pass', icon: 'Trophy', path: '/mini-pass' },
      { itemId: 'daily_tasks', labelKey: 'sidebar.daily_tasks', icon: 'ListChecks', path: '/tasks' },
      {
        itemId: 'rewards_group',
        labelKey: 'sidebar.rewards',
        icon: 'Folder',
        children: [
          { itemId: 'internal_offerwall', labelKey: 'sidebar.internal_offerwall', icon: 'LayoutGrid', path: '/internal-offerwall' },
          { itemId: 'faucet', labelKey: 'sidebar.faucet', icon: 'Gift', path: '/faucet' },
          { itemId: 'shortlinks', labelKey: 'sidebar.shortlinks', icon: 'Link', path: '/shortlinks' },
          { itemId: 'auto_mining', labelKey: 'sidebar.auto_mining', icon: 'Zap', path: '/auto-mining' },
          { itemId: 'youtube', labelKey: 'sidebar.youtube', icon: 'Youtube', path: '/youtube' },
          { itemId: 'read_earn', labelKey: 'sidebar.read_earn', icon: 'Sparkles', path: '/read-earn' },
        ],
      },
    ],
  },
  {
    section: 'social',
    titleKey: 'sidebar.categories.social',
    items: [
      { itemId: 'games', labelKey: 'sidebar.games', icon: 'Gamepad2', path: '/games' },
      { itemId: 'calculator', labelKey: 'sidebar.calculator', icon: 'Calculator', path: '/calculator' },
      { itemId: 'manual', labelKey: 'sidebar.manual', icon: 'BookOpen', path: '/manual' },
      { itemId: 'ranking', labelKey: 'sidebar.ranking', icon: 'Trophy', path: '/ranking' },
      { itemId: 'roadmap', labelKey: 'sidebar.roadmap', icon: 'Map', path: '/roadmap' },
      { itemId: 'transparency', labelKey: 'sidebar.transparency', icon: 'Eye', path: '/transparency' },
    ],
  },
];

/** Metadados por tela principal do menu (matriz viva para migração modular). */
export const USER_DASHBOARD_SCREEN_MATRIX = [
  {
    screen: 'Dashboard Central',
    module: 'dashboard',
    frontendPath: '/dashboard',
    backendPrefixes: ['/api/mining', '/api/wallet/balance', '/api/user'],
    notes: 'Estado em tempo real via Socket; saldo POL sincronizado com GET /wallet/balance.',
  },
  {
    screen: 'Estatísticas e Poder',
    module: 'stats',
    frontendPath: '/power-stats',
    backendPrefixes: ['/api/stats/power'],
    notes: 'Hook useUserPowerStats → /stats/power.',
  },
  {
    screen: 'Minhas Máquinas',
    module: 'machines',
    frontendPath: '/inventory',
    backendPrefixes: ['/api/inventory', '/api/rooms', '/api/vault', '/api/machines', '/api/racks'],
    notes: 'Inventário + racks + cofre; ações POST com Idempotency-Key no axios.',
  },
  {
    screen: 'Loja',
    module: 'shop',
    frontendPath: '/shop',
    backendPrefixes: ['/api/shop'],
    notes: 'GET /shop/miners; POST /shop/purchase (preço no servidor).',
  },
  {
    screen: 'Ofertas',
    module: 'offers',
    frontendPath: '/offers',
    backendPrefixes: ['/api/offer-events'],
    notes: 'Eventos ativos e compra eventMiner.',
  },
  {
    screen: 'Carteira',
    module: 'wallet',
    frontendPath: '/wallet',
    backendPrefixes: ['/api/wallet', '/api/deposit-tickets'],
    notes: 'Depósitos, saques, BTCPay; saldo sempre do backend.',
  },
  {
    screen: 'Suporte',
    module: 'support',
    frontendPath: '/support',
    backendPrefixes: ['/api/support'],
    notes: 'Tickets e mensagens; conteúdo escapado no React.',
  },
  {
    screen: 'Check-in',
    module: 'checkin',
    frontendPath: '/checkin',
    backendPrefixes: ['/api/checkin'],
    notes: 'Ver api/checkinClient e rotas checkin.',
  },
  {
    screen: 'Tarefas',
    module: 'tasks',
    frontendPath: '/tasks',
    backendPrefixes: ['/api/daily-tasks'],
    notes: 'Dashboard + claim por tarefa.',
  },
  {
    screen: 'Recompensas (grupo)',
    module: 'rewards',
    frontendPath: '/internal-offerwall | /faucet | /shortlinks | …',
    backendPrefixes: ['/api/internal-offerwall', '/api/faucet', '/api/shortlink', '/api/auto-mining-gpu', '/api/youtube', '/api/read-earn', '/api/mini-pass'],
    notes: 'Várias rotas; cada subpágina mantém o seu router existente.',
  },
  {
    screen: 'Sair da Conta',
    module: 'auth',
    frontendPath: '(ação)',
    backendPrefixes: ['/api/auth/logout'],
    notes: 'useAuthStore.logout → POST /auth/logout.',
  },
] as const;
