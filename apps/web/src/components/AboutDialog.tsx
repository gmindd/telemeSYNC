import { useEffect } from 'react';
import { APP_INFO } from '../config.ts';
import { useT } from '../i18n/index.tsx';
import type { MessageKey } from '../i18n/messages.ts';
import { DonateButton, WebsiteLink } from './ExternalLinks.tsx';

/** Name (or the key of a translated name), licence, link. */
const THIRD_PARTY: [string | { key: MessageKey }, string, string][] = [
  ['Node.js', 'MIT', 'https://nodejs.org'],
  [{ key: 'about.ffmpeg' }, 'GPL-3.0', 'https://ffmpeg.org'],
  [{ key: 'about.inter' }, 'SIL Open Font License 1.1', 'https://rsms.me/inter/'],
  ['React, React DOM', 'MIT', 'https://react.dev'],
  ['Fastify', 'MIT', 'https://fastify.dev'],
  ['@napi-rs/canvas (Skia)', 'MIT / BSD-3-Clause', 'https://github.com/Brooooooklyn/canvas'],
  ['tsx, esbuild', 'MIT', 'https://tsx.is'],
  ['zustand', 'MIT', 'https://github.com/pmndrs/zustand'],
  ['fast-xml-parser', 'MIT', 'https://github.com/NaturalIntelligence/fast-xml-parser'],
];

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const name = APP_INFO.name;
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label={t('about.close')}>
          ✕
        </button>
        <h2 id="about-title">
          {APP_INFO.name} <span className="muted">v{APP_INFO.version}</span>
        </h2>
        <p>
          {t('about.intro')} © {APP_INFO.year} {APP_INFO.author} — <WebsiteLink /> ·{' '}
          <a href={`mailto:${APP_INFO.email}`}>{APP_INFO.email}</a>
        </p>
        <DonateButton />

        <h3>{t('about.terms.h')}</h3>
        <p>
          {t('about.terms', { name })} <code>LICENCA.txt</code>.
        </p>

        <h3>{t('about.warranty.h')}</h3>
        <p>{t('about.warranty')}</p>

        <h3>{t('about.privacy.h')}</h3>
        <p>{t('about.privacy', { site: APP_INFO.websiteLabel })}</p>

        <h3>{t('about.support.h')}</h3>
        <p>{t('about.support')}</p>

        <h3>{t('about.trademarks.h')}</h3>
        <p>{t('about.trademarks', { name })}</p>

        <h3>{t('about.thirdParty.h')}</h3>
        <p>{t('about.thirdParty', { name })}</p>
        <table className="licenses">
          <tbody>
            {THIRD_PARTY.map(([n, l, u]) => (
              <tr key={u}>
                <td>
                  <a href={u} target="_blank" rel="noopener noreferrer">
                    {typeof n === 'string' ? n : t(n.key)}
                  </a>
                </td>
                <td>{l}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fine">{t('about.licensesFile', { file: 'LICENCAS-TERCEIROS.txt', email: APP_INFO.email })}</p>
      </div>
    </div>
  );
}
