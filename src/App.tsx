import { useEffect } from 'react';

import DashboardLayout from '@/layout/dashboard-layout';

function IdeavibesWatermark() {
  useEffect(() => {
    if (!document.body || document.getElementById('mctai-watermark')) {
      return;
    }

    const root = document.createElement('div');
    root.id = 'mctai-watermark';
    root.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:8px 10px',
      'border-radius:999px',
      'border:1px solid rgba(148,163,184,.35)',
      'background:rgba(15,23,42,.86)',
      'color:#f8fafc',
      'box-shadow:0 10px 30px rgba(15,23,42,.25)',
      'font:500 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'backdrop-filter:blur(10px)',
    ].join(';');
    root.innerHTML =
      '<a href="https://ideavibes.ai" target="_blank" rel="noopener noreferrer" ' +
      'style="color:#f8fafc;text-decoration:none">Built by Ideavibes.ai</a>' +
      '<button type="button" data-mctai-share ' +
      'style="border:0;border-left:1px solid rgba(148,163,184,.35);background:transparent;color:#93c5fd;cursor:pointer;padding:0 0 0 8px;font:inherit">Share</button>';
    document.body.appendChild(root);

    const button = root.querySelector<HTMLButtonElement>('[data-mctai-share]');
    button?.addEventListener('click', async () => {
      const payload = {
        title: document.title || 'Ideavibes app',
        text: 'Built with Ideavibes.ai',
        url: window.location.href,
      };

      try {
        if (navigator.share) {
          await navigator.share(payload);
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(window.location.href);
          button.textContent = 'Copied';
          window.setTimeout(() => {
            button.textContent = 'Share';
          }, 1600);
        }
      } catch {
        button.textContent = 'Share';
      }
    });

    const style = document.createElement('style');
    style.textContent =
      '@media (max-width: 640px){#mctai-watermark{right:50%;transform:translateX(50%);bottom:12px;max-width:calc(100vw - 24px)}}';
    document.head.appendChild(style);

    return () => {
      root.remove();
      style.remove();
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <>
      <DashboardLayout />
      <IdeavibesWatermark />
    </>
  );
}
