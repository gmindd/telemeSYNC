import { useEffect, useState } from 'react';
import { APP_INFO } from '../config.ts';
import { checkForUpdate, type Release } from '../lib/updates.ts';

/** Bar shown at start-up when the site announces a newer version; "Agora não" hides it until the next start. */
export function UpdateBanner() {
  const [release, setRelease] = useState<Release | null>(null);
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
        <b>Nova versão {release.version} disponível</b>
        {release.summary ? <> · {release.summary}</> : null}
      </span>
      <span className="update-actions">
        <a className="button-link small" href={release.changelogUrl} target="_blank" rel="noopener noreferrer">
          Ver novidades
        </a>
        <a className="button-link small primary" href={release.downloadUrl} target="_blank" rel="noopener noreferrer">
          Descarregar
        </a>
        <button className="small" onClick={() => setRelease(null)}>
          Agora não
        </button>
      </span>
    </div>
  );
}
