import { useState, useEffect } from 'react';

const DISMISS_KEY = 'install-prompt-dismissed';

/* localStorage throws in Safari private mode and wherever storage is blocked.
   Since this component now targets iOS specifically, every access is guarded —
   a storage failure should degrade to "show the prompt again", never a crash. */
function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* storage unavailable — the prompt will simply reappear next visit */
  }
}

/* iPadOS 13+ reports a desktop "Macintosh" user agent, so the touch-point check
   is required to catch iPads that would otherwise be mistaken for macOS. */
function isIOS() {
  const ua = window.navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1;
}

/* navigator.standalone is the iOS-only signal; display-mode covers everything else. */
function isStandalone() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function ShareIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    // Already installed, or the user has told us to go away before.
    if (isStandalone() || wasDismissed()) return;

    /* iOS never fires beforeinstallprompt — every iOS browser is WebKit and
       Apple has not implemented it — so manual Add-to-Home-Screen instructions
       are the only install affordance available there. */
    if (isIOS()) {
      setIosMode(true);
      setShowPrompt(true);
      return;
    }

    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    // Fires when the app is installed by any route — including Chrome's own
    // omnibox/menu affordance — so the card must not linger afterwards.
    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    /* Declining the native dialog is as deliberate as clicking our own dismiss
       button, so it earns the same persistence. On 'accepted' we stay silent —
       the appinstalled listener handles teardown. */
    if (outcome === 'dismissed') rememberDismissal();

    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    rememberDismissal();
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="install-prompt-title"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-graphite text-bone z-50 p-4 rounded-xl shadow-2xl border border-white/10 flex flex-col gap-3"
    >
      <div className="flex justify-between items-start">
        <h3 id="install-prompt-title" className="font-display text-volt uppercase text-lg">
          Install App
        </h3>
        <button onClick={handleDismiss} className="text-smoke hover:text-white" aria-label="Dismiss">
          &times;
        </button>
      </div>

      {iosMode ? (
        <>
          <p className="text-sm text-smoke">
            Add the Air Jordan Drop Site to your home screen: tap{' '}
            <ShareIcon className="inline-block h-4 w-4 align-text-bottom text-volt" />
            <span className="sr-only">Share</span> in the toolbar, then choose{' '}
            <span className="text-bone">Add to Home Screen</span>.
          </p>
          <div className="flex justify-end mt-2">
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-sm bg-volt text-ink font-bold rounded hover:bg-volt/80"
            >
              Got It
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-smoke">
            Install the Air Jordan Drop Site to your home screen for quick access.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-sm text-smoke hover:text-white"
            >
              Not Now
            </button>
            <button
              onClick={handleInstallClick}
              className="px-4 py-2 text-sm bg-volt text-ink font-bold rounded hover:bg-volt/80"
            >
              Install
            </button>
          </div>
        </>
      )}
    </div>
  );
}
