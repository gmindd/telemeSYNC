import { APP_INFO } from '../config.ts';
import { useT } from '../i18n/index.tsx';

/** Links open in the default browser; nothing is loaded from external servers until clicked. */
export function DonateButton({ big }: { big?: boolean }) {
  const t = useT();
  if (!APP_INFO.donateUrl) return null;
  return (
    <a className={`bmc${big ? ' big' : ''}`} href={APP_INFO.donateUrl} target="_blank" rel="noopener noreferrer">
      <span aria-hidden>☕</span> {t('donate')}
    </a>
  );
}

export function WebsiteLink({ children }: { children?: React.ReactNode }) {
  return (
    <a href={APP_INFO.website} target="_blank" rel="noopener noreferrer">
      {children ?? APP_INFO.websiteLabel}
    </a>
  );
}
