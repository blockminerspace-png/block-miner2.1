import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_ID;

export function useAnalytics() {
  const location = useLocation();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;

    if (!window.gtag) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      document.head.appendChild(script);

      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
      window.gtag('js', new Date());
      const strictConsent = import.meta.env.VITE_GTAG_CONSENT_STRICT === '1';
      window.gtag('consent', 'default', {
        analytics_storage: strictConsent ? 'denied' : 'granted',
        ad_storage: strictConsent ? 'denied' : 'granted',
        ad_user_data: strictConsent ? 'denied' : 'granted',
        ad_personalization: strictConsent ? 'denied' : 'granted',
      });
      window.gtag('config', GA_MEASUREMENT_ID, {
        page_path: window.location.pathname + window.location.search,
        send_page_view: false, // We'll handle this manually on route changes
      });
    }
  }, []);

  useEffect(() => {
    if (GA_MEASUREMENT_ID && typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'page_view', {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);
}

export function AnalyticsTracker() {
  useAnalytics();
  return null;
}


