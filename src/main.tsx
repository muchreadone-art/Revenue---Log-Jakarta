import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Google Maps Platform Tier 1 Quota & Auth Failure Guard (Demo Key)
(window as unknown as {gm_authFailure?: () => void}).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};
const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = args.map((a) => String(a)).join(' ');
  if (
    msg.includes('Free daily read units') ||
    (msg.includes('Quota limit exceeded') && msg.toLowerCase().includes('firestore')) ||
    msg.includes('resource-exhausted')
  ) {
    console.warn('[Firestore] Daily quota limit notice. Operating in local storage & server sync mode.');
    return;
  }
  origConsoleError.apply(console, args);
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

createRoot(document.getElementById('root')!).render(<App />);
