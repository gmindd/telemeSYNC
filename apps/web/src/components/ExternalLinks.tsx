import { APP_INFO } from '../config.ts';

/** Links open in the default browser; nothing is loaded from external servers until clicked. */
export function DonateButton({ big }: { big?: boolean }) {
  if (!APP_INFO.donateUrl) return null;
  return (
    <a className={`bmc${big ? ' big' : ''}`} href={APP_INFO.donateUrl} target="_blank" rel="noopener noreferrer">
      <span aria-hidden>☕</span> Pague-me um café
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
