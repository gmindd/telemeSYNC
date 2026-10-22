import { useEffect, useState } from 'react';
import { APP_INFO } from '../config.ts';
import { useLang, useT } from '../i18n/index.tsx';
import { checkForUpdate, releaseSummary, withLang, type Release } from '../lib/updates.ts';

/** Bar shown at start-up when the site announces a newer version; "Not now" hides it until the next start. */
export function UpdateBanner() {
  const [release, setRelease] = useState<Release | null>(null);
  const t = useT();
  const lang = useLang((s) => s.lang);
  useEffect(() => {
    if (!APP_INFO.updateUrl) return;
    let alive = true;
    void checkForUpdate(APP_INFO.updateUrl, APP_INFO.version).then((r) => {
      if (alive) setRelease(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!release) return null;
  return (
    <div className="update-bar" role="status">
      <span>
        <b>{t('update.available', { version: release.version })}</b>
        {releaseSummary(release, lang) ? <> · {releaseSummary(release, lang)}</> : null}
      </span>
      <span className="update-actions">
        <a className="button-link small" href={withLang(release.changelogUrl, lang)} target="_blank" rel="noopener noreferrer">
          {t('update.changelog')}
        </a>
        <a className="button-link small primary" href={release.downloadUrl} target="_blank" rel="noopener noreferrer">
          {t('update.download')}
        </a>
        <button className="small" onClick={() => setRelease(null)}>
          {t('update.later')}
        </button>
      </span>
    </div>
  );
}
