import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-graphite text-ink z-50 p-4 rounded-xl shadow-2xl border border-white/10 flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <h3 className="font-display text-volt uppercase text-lg">Install App</h3>
        <button onClick={handleDismiss} className="text-smoke hover:text-white" aria-label="Dismiss">
          &times;
        </button>
      </div>
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
    </div>
  );
}
