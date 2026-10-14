import { APP_INFO } from '../config.ts';
import { DonateButton, WebsiteLink } from '../components/ExternalLinks.tsx';
import { useApp } from '../lib/store.ts';

const STEPS = [
  { n: 1, t: 'Telemetria', d: 'Carregue o FIT ou GPX do ciclocomputador (Bryton, Garmin, iGPSPORT…).' },
  { n: 2, t: 'Clips', d: 'Arraste os vídeos da volta (DJI, GoPro, Insta360). Só os metadados são lidos.' },
  { n: 3, t: 'Sincronizar', d: 'Confirme o alinhamento com o vídeo e posicione os gráficos.' },
  { n: 4, t: 'Exportar', d: 'Vídeos transparentes prontos para o DaVinci, Premiere ou Final Cut.' },
];

export function StepWelcome({ onAbout }: { onAbout: () => void }) {
  const setStep = useApp((s) => s.setStep);
  return (
    <section className="welcome">
      <div className="hero">
        <div className="hero-text">
          <h1>
            Bem-vindo ao <span className="brand">tele<em>me</em>SYNC</span>
          </h1>
          <p className="hero-lead">
            A telemetria das suas voltas de BTT — velocidade, inclinação, mapa, altimetria, frequência cardíaca — sincronizada e desenhada por cima dos seus
            vídeos.
          </p>
          <div className="hero-actions">
            <button className="primary big" onClick={() => setStep('telemetry')}>
              Começar →
            </button>
          </div>
          <ul className="badges">
            <li>✔ Gratuito</li>
            <li>✔ Os vídeos nunca saem do seu computador</li>
            <li>✔ Gráficos transparentes, um por métrica ou tudo num só vídeo</li>
          </ul>
        </div>
        <div className="hero-art" aria-hidden>
          <div className="mock-speed">
            <small>VELOCIDADE</small>
            <b>24,6</b>
            <i>km/h</i>
          </div>
          <div className="mock-grade">
            <small>INCLINAÇÃO</small>
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

      <h2>Como funciona</h2>
      <div className="how">
        {STEPS.map((s) => (
          <div key={s.n} className="how-card">
            <span className="how-n">{s.n}</span>
            <b>{s.t}</b>
            <p>{s.d}</p>
          </div>
        ))}
      </div>

      <div className="promo-grid">
        <div className="card promo">
          <h3>Feito por {APP_INFO.author}</h3>
          <p className="promo-role">{APP_INFO.role}</p>
          <p>
            O {APP_INFO.name} nasceu da vontade de juntar duas paixões: o BTT e o digital bem feito. É o mesmo cuidado que ponho nos projetos para empresas e
            profissionais — pensado, discutido e bem construído.
          </p>
          <ul className="services">
            <li>Websites &amp; landing pages</li>
            <li>Product design &amp; desenvolvimento</li>
            <li>Automações &amp; workflows</li>
            <li>Estratégia digital &amp; SEO</li>
          </ul>
          <p className="muted">
            Mais de 20 projetos entregues, em Portugal e no estrangeiro — entre eles o site, a loja online e o aluguer de bicicletas da ViaBike, no Caminho de
            Santiago.
          </p>
          <div className="promo-actions">
            <WebsiteLink>
              <span className="link-btn">Conhecer os serviços ↗</span>
            </WebsiteLink>
            <a href={`mailto:${APP_INFO.email}`}>{APP_INFO.email}</a>
          </div>
        </div>
        <div className="card promo support">
          <h3>Apoie o projeto</h3>
          <p>
            O {APP_INFO.name} é e vai continuar gratuito para todos. Se lhe for útil, um café ajuda a manter o desenvolvimento e a suportar mais câmaras e
            ciclocomputadores.
          </p>
          {APP_INFO.donateUrl ? <DonateButton big /> : <p className="muted">(Link de apoio por configurar.)</p>}
          <p className="fine">Contribuição voluntária, sem contrapartida. Não é um donativo fiscalmente dedutível.</p>
        </div>
      </div>

      <p className="muted small-center">
        Ao usar o {APP_INFO.name} aceita os termos de utilização. <button className="linklike" onClick={onAbout}>Sobre e avisos legais</button>
      </p>
    </section>
  );
}
