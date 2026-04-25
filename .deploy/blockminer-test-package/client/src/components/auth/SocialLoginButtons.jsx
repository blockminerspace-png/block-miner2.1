// Bootstrap Icons SVG components
const TelegramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.328-.373-.115l-6.871 4.326-2.962-.924c-.643-.203-.658-.643.135-.953l11.593-4.47c.537-.194 1.006.128.832.941z"/>
  </svg>
);

const DiscordIcon = () => (
  <svg width="20" height="20" viewBox="0 0 127 127" fill="currentColor">
    <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0A105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36a77.7,77.7,0,0,0,6.89-11.11A68.58,68.58,0,0,1,23.9,78.85a68.8,68.8,0,0,0,5.52,4.41,105.35,105.35,0,0,0,90.56,0c1.87-1.26,3.71-2.6,5.52-4.41a68.4,68.4,0,0,1-10.67,5.4c2.22,3.66,4.6,7.07,6.89,11.1A105.75,105.75,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60.6,31,53.79s5-11.9,11.45-11.9S54,46.92,53.89,53.79,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60.6,73.25,53.79s5-11.9,11.44-11.9S96.23,46.92,96.12,53.79,91.08,65.69,84.69,65.69Z"/>
  </svg>
);

const XIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.6l-5.165-6.75-5.913 6.75h-3.308l7.73-8.835L.424 2.25h6.7l4.759 6.236L17.214 2.25h.03zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
  </svg>
);

const socialLinks = [
  {
    name: 'Telegram',
    url: 'https://t.me/+j1-sohwea4QzM2I5',
    Icon: TelegramIcon,
    color: '#0088CC'
  },
  {
    name: 'Discord',
    url: 'https://discord.gg/dzeTM2Am',
    Icon: DiscordIcon,
    color: '#5865F2'
  },
  {
    name: 'X',
    url: 'https://x.com/blockminerweb3',
    Icon: XIcon,
    color: '#FFFFFF'
  }
];

export default function SocialLoginButtons() {
  return (
    <div className="flex justify-center gap-4 mt-6 mb-5">
      {socialLinks.map(({ name, url, Icon, color }) => (
        <a
          key={name}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Abrir ${name} do BlockMiner`}
          title={`${name} do BlockMiner`}
          className="group w-11 h-11 rounded-full bg-white/10 border border-white/10 shadow-sm hover:bg-white/20 hover:scale-105 transition-all duration-200 flex items-center justify-center outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          style={{ color }}
        >
          <Icon />
        </a>
      ))}
    </div>
  );
}
