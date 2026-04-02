import { Link, Navigate } from 'react-router-dom';
import {
  Blocks,
  Cpu,
  Database,
  Gift,
  Globe,
  KeyRound,
  Pickaxe,
  Shield,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import BrandLogo from '../components/BrandLogo';

const STAGGER = ['[animation-delay:0ms]', '[animation-delay:90ms]', '[animation-delay:180ms]', '[animation-delay:270ms]'];

function FadeUp({ children, className = '', delayClass = STAGGER[0] }) {
  return (
    <div
      className={`opacity-0 motion-reduce:opacity-100 motion-reduce:translate-y-0 animate-fadeUp ${delayClass} ${className}`}
    >
      {children}
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-gray-100 font-sans overflow-x-hidden">
      {/* Animated ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(59,130,246,0.22),transparent_55%)]" />
        <div className="absolute top-1/4 -left-32 h-[420px] w-[420px] rounded-full bg-primary/20 blur-[100px] animate-blob motion-reduce:animate-none" />
        <div className="absolute bottom-0 right-[-120px] h-[480px] w-[480px] rounded-full bg-accent/18 blur-[110px] animate-blob-delay motion-reduce:animate-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-cyan-500/10 blur-[120px] animate-blob-slow motion-reduce:animate-none" />
        <div
          className="absolute inset-0 opacity-[0.12] motion-reduce:opacity-[0.08] animate-gridPulse"
          style={{
            backgroundImage: `linear-gradient(rgba(59,130,246,0.35) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59,130,246,0.35) 1px, transparent 1px)`,
            backgroundSize: '56px 56px',
          }}
        />
      </div>

      <header className="relative z-20 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl sticky top-0">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="group flex items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Block Miner — início"
          >
            <BrandLogo variant="header" interactive />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
            >
              Entrar
            </Link>
            <Link
              to="/register"
              className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary to-blue-500 text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-20 sm:pb-28">
          <FadeUp delayClass={STAGGER[0]}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-xs sm:text-sm font-semibold text-sky-200/95 tracking-wide">
              <Globe className="w-4 h-4 shrink-0" aria-hidden />
              Polygon (POL) · mineração simulada · blocos ~10 min
            </div>
          </FadeUp>

          <FadeUp delayClass={STAGGER[1]} className="mt-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.08] max-w-4xl">
              Simule sua fazenda de mineração{' '}
              <span className="relative inline-block">
                <span className="relative z-10 bg-gradient-to-r from-sky-300 via-primary to-violet-400 bg-clip-text text-transparent">
                  em tempo real
                </span>
                <span
                  className="absolute -inset-1 rounded-lg bg-gradient-to-r from-primary/20 via-accent/20 to-cyan-500/20 blur-xl opacity-70"
                  aria-hidden
                />
              </span>
            </h1>
          </FadeUp>

          <FadeUp delayClass={STAGGER[2]} className="mt-7 max-w-2xl">
            <p className="text-lg sm:text-xl text-gray-400 leading-relaxed">
              O motor do jogo fecha um <strong className="text-gray-200 font-semibold">bloco simulado a cada 10 minutos</strong> e
              distribui recompensas em <strong className="text-gray-200 font-semibold">POL</strong> proporcionalmente ao seu{' '}
              <strong className="text-gray-200 font-semibold">hashrate (H/s)</strong> e à participação na rodada. Compre rigs na
              loja, monte o inventário e acompanhe a rede ao vivo — sem promessas de lucro garantido: é uma{' '}
              <strong className="text-gray-200 font-semibold">simulação competitiva</strong> estilo Web3.
            </p>
          </FadeUp>

          <FadeUp delayClass={STAGGER[3]} className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-white bg-gradient-to-r from-primary to-blue-500 shadow-xl shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Pickaxe className="w-5 h-5" aria-hidden />
              Começar a minerar
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-semibold text-gray-200 border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/25 backdrop-blur-sm transition-all"
            >
              Já tenho conta
            </Link>
          </FadeUp>

          {/* Quick stats — valores alinhados ao código do motor (miningEngine.js) */}
          <FadeUp delayClass="[animation-delay:360ms]" className="mt-16 sm:mt-20">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: 'Intervalo de bloco', value: '~10 min', sub: 'blockDurationMs no servidor', icon: Blocks },
                { label: 'Moeda da simulação', value: 'POL', sub: 'tokenSymbol no motor', icon: Cpu },
                { label: 'Dados & ORM', value: 'PostgreSQL', sub: 'Prisma Client', icon: Database },
                { label: 'Sessões', value: 'JWT + refresh', sub: 'cookies HttpOnly', icon: KeyRound },
              ].map(({ label, value, sub, icon: Icon }) => (
                <div
                  key={label}
                  className="group p-4 sm:p-5 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-transparent hover:border-primary/35 hover:bg-white/[0.07] transition-all duration-300"
                >
                  <Icon className="w-5 h-5 text-primary mb-3 opacity-90 group-hover:scale-110 transition-transform" aria-hidden />
                  <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
                  <p className="text-xl sm:text-2xl font-black text-white mt-1">{value}</p>
                  <p className="text-[11px] text-gray-500 mt-1 leading-snug">{sub}</p>
                </div>
              ))}
            </div>
          </FadeUp>
        </section>

        {/* Features */}
        <section className="border-y border-white/[0.06] bg-surface/40 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <FadeUp>
              <h2 className="text-3xl sm:text-4xl font-bold text-white text-center">O que a plataforma faz de verdade</h2>
              <p className="text-center text-gray-400 mt-3 max-w-2xl mx-auto">
                Funcionalidades presentes no repositório — sem marketing vazio.
              </p>
            </FadeUp>

            <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {[
                {
                  icon: Zap,
                  title: 'Motor de blocos ao vivo',
                  body: 'Tick do servidor atualiza hashrate da rede, progresso do bloco e distribuição quando o ciclo de ~10 min fecha.',
                  accent: 'from-amber-500/20 to-orange-500/10',
                },
                {
                  icon: Wallet,
                  title: 'Carteira & saques',
                  body: 'Saldo interno em POL, pedidos de levantamento e integração com rede Polygon para operações on-chain quando configurada.',
                  accent: 'from-emerald-500/20 to-teal-500/10',
                },
                {
                  icon: Gift,
                  title: 'Check-in, faucet & PTC',
                  body: 'Check-in diário, faucet, shortlinks e offerwalls (ex.: ZerAds) para ganhar créditos de hashrate ou saldo.',
                  accent: 'from-pink-500/20 to-rose-500/10',
                },
                {
                  icon: TrendingUp,
                  title: 'Loja, ranking & ofertas',
                  body: 'Compra de miners na loja, inventário, ranking global e eventos de ofertas com miners exclusivos (painel admin).',
                  accent: 'from-violet-500/20 to-purple-500/10',
                },
                {
                  icon: Shield,
                  title: 'API com JWT',
                  body: 'Autenticação com tokens de acesso e refresh, CORS configurável e painel administrativo separado.',
                  accent: 'from-blue-500/20 to-cyan-500/10',
                },
                {
                  icon: Sparkles,
                  title: 'Jogos & extras',
                  body: 'Mini-jogos, recompensas YouTube, auto-mining GPU e chat em tempo real (Socket.IO) conforme rotas do cliente.',
                  accent: 'from-sky-500/20 to-primary/20',
                },
              ].map((card, i) => {
                const CardIcon = card.icon;
                return (
                <FadeUp key={card.title} delayClass={STAGGER[i % STAGGER.length]}>
                  <article
                    className={`h-full p-6 sm:p-7 rounded-3xl border border-white/[0.08] bg-gradient-to-br ${card.accent} to-background/80 hover:border-white/20 hover:-translate-y-1 transition-all duration-300 shadow-lg shadow-black/20`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-black/30 border border-white/10 flex items-center justify-center mb-5">
                      <CardIcon className="w-6 h-6 text-sky-300" aria-hidden />
                    </div>
                    <h3 className="text-lg font-bold text-white">{card.title}</h3>
                    <p className="mt-3 text-sm text-gray-400 leading-relaxed">{card.body}</p>
                  </article>
                </FadeUp>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA strip */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-20">
          <FadeUp>
            <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-background to-accent/10 p-10 sm:p-14 text-center">
              <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[140%] h-48 bg-gradient-to-b from-primary/25 to-transparent blur-3xl pointer-events-none motion-reduce:opacity-50" aria-hidden />
              <h2 className="relative text-2xl sm:text-3xl font-bold text-white">Pronto para entrar na rede?</h2>
              <p className="relative mt-3 text-gray-400 max-w-xl mx-auto">
                Crie uma conta gratuita, ligue a sua carteira Polygon quando quiser e suba seu hashrate com rigs e atividades na
                plataforma.
              </p>
              <div className="relative mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center px-8 py-3.5 rounded-2xl font-bold text-background bg-white hover:bg-gray-100 transition-colors"
                >
                  Registar agora
                </Link>
                <a
                  href="https://polygonscan.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl font-semibold border border-white/20 text-white hover:bg-white/10 transition-colors"
                >
                  Explorar Polygon
                  <Globe className="w-4 h-4" aria-hidden />
                </a>
              </div>
            </div>
          </FadeUp>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] bg-background/90 py-10 px-5 sm:px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Pickaxe className="w-4 h-4 text-primary/70" aria-hidden />
            <span>
              © {new Date().getFullYear()} Block Miner ·{' '}
              <span className="text-gray-400">blockminer.space</span>
            </span>
          </div>
          <p className="text-center sm:text-right max-w-md">
            Simulação Web3 educacional. Criptoativos envolvem risco — não é aconselhamento financeiro.
          </p>
        </div>
      </footer>
    </div>
  );
}
