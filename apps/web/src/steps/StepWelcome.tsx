import { APP_INFO } from '../config.ts';
import { DonateButton, WebsiteLink } from '../components/ExternalLinks.tsx';
import { formatNumber, tr } from '@telemesync/core';
import { useLang, useT } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';

const STEPS = [1, 2, 3, 4] as const;

export function StepWelcome({ onAbout }: { onAbout: () => void }) {
  const setStep = useApp((s) => s.setStep);
  const t = useT();
  const lang = useLang((s) => s.lang);
  const name = APP_INFO.name;
  return (
    <section className="welcome">
      <div className="hero">
        <div className="hero-text">
          <h1>
            {t('welcome.title')} <span className="brand">tele<em>me</em>SYNC</span>
          </h1>
          <p className="hero-lead">{t('welcome.lead')}</p>
          <div className="hero-actions">
            <button className="primary big" onClick={() => setStep('telemetry')}>
              {t('welcome.start')}
            </button>
          </div>
          <ul className="badges">
            <li>{t('welcome.badge1')}</li>
            <li>{t('welcome.badge2')}</li>
            <li>{t('welcome.badge3')}</li>
          </ul>
        </div>
        <div className="hero-art" aria-hidden>
          <div className="mock-speed">
            <small>{tr(lang, 'metric.speed').toLocaleUpperCase(lang)}</small>
            <b>{formatNumber(24.6, 1, lang)}</b>
            <i>km/h</i>
          </div>
          <div className="mock-grade">
            <small>{tr(lang, 'metric.grade').toLocaleUpperCase(lang)}</small>
            <b>8</b>
            <i>%</i>
          </div>
          <svg className="mock-profile" viewBox="0 0 300 80">
            <path d="M0 70 L40 62 L70 40 L100 48 L130 20 L160 30 L190 12 L230 44 L260 36 L300 60 L300 80 L0 80Z" fill="rgba(255,122,26,.25)" />
            <path d="M0 70 L40 62 L70 40 L100 48 L130 20 L160 30 L190 12 L230 44 L260 36 L300 60" fill="none" stroke="#ff7a1a" strokeWidth="3" />
            <circle cx="130" cy="20" r="6" fill="#ff7a1a" stroke="#fff" strokeWidth="2" />
          </svg>
        </div>
      </div>

      <h2>{t('welcome.how')}</h2>
      <div className="how">
        {STEPS.map((n) => (
          <div key={n} className="how-card">
            <span className="how-n">{n}</span>
            <b>{t(`welcome.step${n}.t`)}</b>
            <p>{t(`welcome.step${n}.d`)}</p>
          </div>
        ))}
      </div>

      <div className="promo-grid">
        <div className="card promo">
          <h3>{t('welcome.madeBy', { author: APP_INFO.author })}</h3>
          <p className="promo-role">{t('welcome.role')}</p>
          <p>{t('welcome.story', { name })}</p>
          <ul className="services">
            <li>{t('welcome.svc1')}</li>
            <li>{t('welcome.svc2')}</li>
            <li>{t('welcome.svc3')}</li>
            <li>{t('welcome.svc4')}</li>
          </ul>
          <p className="muted">{t('welcome.projects')}</p>
          <div className="promo-actions">
            <WebsiteLink>
              <span className="link-btn">{t('welcome.services')}</span>
            </WebsiteLink>
            <a href={`mailto:${APP_INFO.email}`}>{APP_INFO.email}</a>
          </div>
        </div>
        <div className="card promo support">
          <h3>{t('welcome.support')}</h3>
          <p>{t('welcome.supportText', { name })}</p>
          {APP_INFO.donateUrl ? <DonateButton big /> : <p className="muted">{t('welcome.noDonate')}</p>}
          <p className="fine">{t('welcome.supportFine')}</p>
        </div>
      </div>

      <p className="muted small-center">
        {t('welcome.terms', { name })} <button className="linklike" onClick={onAbout}>{t('footer.about')}</button>
      </p>
    </section>
  );
}
