import { useEffect } from 'react';
import { APP_INFO } from '../config.ts';
import { DonateButton, WebsiteLink } from './ExternalLinks.tsx';

const THIRD_PARTY: [string, string, string][] = [
  ['Node.js', 'MIT', 'https://nodejs.org'],
  ['FFmpeg (executável incluído, não modificado)', 'GPL-3.0', 'https://ffmpeg.org'],
  ['Fonte Inter', 'SIL Open Font License 1.1', 'https://rsms.me/inter/'],
  ['React, React DOM', 'MIT', 'https://react.dev'],
  ['Fastify', 'MIT', 'https://fastify.dev'],
  ['@napi-rs/canvas (Skia)', 'MIT / BSD-3-Clause', 'https://github.com/Brooooooklyn/canvas'],
  ['tsx, esbuild', 'MIT', 'https://tsx.is'],
  ['zustand', 'MIT', 'https://github.com/pmndrs/zustand'],
  ['fast-xml-parser', 'MIT', 'https://github.com/NaturalIntelligence/fast-xml-parser'],
];

export function AboutDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
        <h2 id="about-title">
          {APP_INFO.name} <span className="muted">v{APP_INFO.version}</span>
        </h2>
        <p>
          Gerador de overlays de telemetria para vídeos de bicicleta. © {APP_INFO.year} {APP_INFO.author} — <WebsiteLink /> ·{' '}
          <a href={`mailto:${APP_INFO.email}`}>{APP_INFO.email}</a>
        </p>
        <DonateButton />

        <h3>Termos de utilização</h3>
        <p>
          O {APP_INFO.name} é software gratuito (freeware). Pode usá-lo sem custos, para fins pessoais ou profissionais, e os vídeos que criar com ele são seus. Pode
          partilhar o pacote de instalação original, sem alterações e gratuitamente. Não é permitido vendê-lo, modificá-lo ou redistribuí-lo alterado sem autorização
          do autor. Termos completos no ficheiro <code>LICENCA.txt</code>.
        </p>

        <h3>Isenção de garantia</h3>
        <p>
          O software é fornecido “tal como está”, sem garantias de qualquer tipo, incluindo de exatidão dos dados apresentados (velocidade, inclinação, altitude,
          frequência cardíaca, posição). Os valores dependem dos dados do seu ciclocomputador e da sincronização com os vídeos, e não devem ser usados para fins de
          segurança, médicos ou de prova. Na medida máxima permitida por lei, o autor não é responsável por danos resultantes da utilização do software. Faça cópias de
          segurança dos seus ficheiros.
        </p>

        <h3>Privacidade</h3>
        <p>
          Tudo corre no seu computador. Os ficheiros de vídeo e de telemetria <b>não são enviados</b> para nenhum servidor externo: a aplicação lê apenas os metadados
          dos vídeos (data, duração, fps) e processa a telemetria localmente. Não há registo de utilizadores, cookies de terceiros, publicidade nem recolha de
          estatísticas. As definições ficam guardadas apenas no seu computador. Os links externos ({APP_INFO.websiteLabel} e a página de apoio) só são abertos se
          clicar neles, e regem-se pelas políticas de privacidade desses sites.
        </p>

        <h3>Apoios</h3>
        <p>
          As contribuições através da página de apoio são voluntárias, sem qualquer contrapartida, e não dão direito a funcionalidades extra nem a suporte garantido.
          Não constituem donativos para efeitos de benefícios fiscais.
        </p>

        <h3>Marcas</h3>
        <p>
          DJI, Osmo Action, GoPro, Insta360, Garmin, Bryton, iGPSPORT, Strava, DaVinci Resolve, Premiere Pro e Final Cut Pro são marcas dos respetivos titulares.
          São referidas apenas para indicar compatibilidade; o {APP_INFO.name} não é afiliado, patrocinado nem aprovado por nenhuma destas empresas.
        </p>

        <h3>Componentes de terceiros</h3>
        <p>O {APP_INFO.name} usa os seguintes componentes de código aberto, de acordo com as respetivas licenças:</p>
        <table className="licenses">
          <tbody>
            {THIRD_PARTY.map(([n, l, u]) => (
              <tr key={n}>
                <td>
                  <a href={u} target="_blank" rel="noopener noreferrer">
                    {n}
                  </a>
                </td>
                <td>{l}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fine">
          A lista completa e os textos das licenças estão no ficheiro <code>LICENCAS-TERCEIROS.txt</code> incluído no pacote. O FFmpeg é distribuído sob a GPL-3.0;
          o respetivo código-fonte está disponível em ffmpeg.org e, mediante pedido ao autor ({APP_INFO.email}), durante pelo menos três anos.
        </p>
      </div>
    </div>
  );
}
