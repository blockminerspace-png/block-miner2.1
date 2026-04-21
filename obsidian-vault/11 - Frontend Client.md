# Frontend Client

## Estrutura principal

```text
client/
├── .env.example
├── .gitignore
├── README.md
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js
├── dist/
├── node_modules/
├── public/
│   ├── Silvio/
│   ├── crypto-broadcast/
│   ├── favicon.ico
│   ├── icon.png
│   ├── icons/
│   ├── machines/
│   ├── vite.svg
│   └── walletconnect-logo.svg
├── scripts/
│   ├── landing-en.mjs
│   ├── landing-es.mjs
│   ├── landing-pt.mjs
│   └── merge-landing-locales.mjs
└── src/
    ├── App.jsx
    ├── index.css
    ├── main.jsx
    ├── test-setup.js
    ├── assets/
    ├── components/
    ├── constants/
    ├── data/
    ├── games/
    ├── hooks/
    ├── i18n/
    ├── legal/
    ├── pages/
    ├── store/
    ├── utils/
    └── web3/
```

## `src/components`

```text
components/
├── AdBanner.jsx
├── AdBlockDetector.jsx
├── AdminLayout.jsx
├── AdminSidebar.jsx
├── AdminSidebar.test.jsx
├── BrandLogo.jsx
├── BroadcastPopup.jsx
├── ChatSidebar.jsx
├── CommunityShortcuts.jsx
├── DashboardBanners.jsx
├── ErrorBoundary.jsx
├── Header.jsx
├── ImageUploader.jsx
├── LegalDocumentPage.jsx
├── MachineCard.jsx
├── MachineCard.test.jsx
├── MachineQuantityModal.jsx
├── Sidebar.jsx
├── SidebarPathGate.jsx
├── SiteFooter.jsx
├── SupportAttachmentThumbnails.jsx
├── SupportAttachmentThumbnails.test.jsx
├── TransparencyErrorBoundary.jsx
├── admin/
│   ├── AdminSupportPlayerDossier.jsx
│   └── AdminSupportPlayerDossier.test.jsx
├── auth/
│   ├── SocialLoginButtons.jsx
│   └── TurnstileField.jsx
├── autoMining/
│   ├── AutoMiningCycleTimer.jsx
│   ├── AutoMiningModeSelector.jsx
│   ├── TurboPartnerBanner.jsx
│   └── TurboPartnerBanner.test.jsx
├── inventory/
│   └── RackMachineTooltipPortal.jsx
└── powerStats/
    └── PowerChartsPanel.jsx
```

## `src/pages`

```text
pages/
├── AdminAnalytics.jsx
├── AdminBackups.jsx
├── AdminBanners.jsx
├── AdminBroadcast.jsx
├── AdminCheckinMilestones.jsx
├── AdminCreators.jsx
├── AdminDailyTasks.jsx
├── AdminDashboard.jsx
├── AdminDepositTickets.jsx
├── AdminFinance.jsx
├── AdminFraudSignals.jsx
├── AdminInternalOfferwall.jsx
├── AdminLogin.jsx
├── AdminLogs.jsx
├── AdminMetrics.jsx
├── AdminMiners.jsx
├── AdminMiniPass.jsx
├── AdminMiniPassSeason.jsx
├── AdminOfferEventManage.jsx
├── AdminOfferEvents.jsx
├── AdminReadEarn.jsx
├── AdminStreaming.jsx
├── AdminSupport.jsx
├── AdminTransparency.jsx
├── AdminUserSidebar.jsx
├── AdminUsers.jsx
├── AutoMining.jsx
├── AutoMining.test.jsx
├── Calculator.jsx
├── Checkin.jsx
├── DailyTasks.jsx
├── DailyTasks.test.jsx
├── Dashboard.jsx
├── DashboardCryptoStream.jsx
├── Faucet.jsx
├── Faucet.test.jsx
├── ForgotPassword.jsx
├── Game2048Page.jsx
├── Game2048Page.test.jsx
├── Games.jsx
├── Games.test.jsx
├── InternalOfferwall.jsx
├── Inventory.jsx
├── Landing.jsx
├── Landing.test.jsx
├── LiveServer.jsx
├── Login.jsx
├── Manual.jsx
├── MiniPass.jsx
├── PopularOffers.jsx
├── PowerStatistics.jsx
├── PrivacyPolicy.jsx
├── PrivacyPolicy.test.jsx
├── PublicRoom.jsx
├── Ranking.jsx
├── ReadEarn.jsx
├── Register.jsx
├── Roadmap.jsx
├── Settings.jsx
├── Shop.jsx
├── ShortlinkStep.jsx
├── Shortlinks.jsx
├── Support.jsx
├── TermsOfUse.jsx
├── TermsOfUse.test.jsx
├── Transparency.jsx
├── Transparency.test.jsx
├── Vault.jsx
├── Wallet.jsx
└── YouTubeWatch.jsx
```

## Suporte transversal

```text
src/constants/
src/data/
src/games/
src/hooks/
src/i18n/
src/legal/
src/store/
src/utils/
src/web3/
```

## Leitura complementar

- O frontend depende fortemente de `pages/`, `components/`, `utils/` e `store/`.
- O acoplamento com o backend aparece principalmente em `store/auth.js`, `hooks/` e `web3/`.
