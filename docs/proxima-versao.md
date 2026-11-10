# Próxima versão (por lançar)

Novidades já no código (branch `claude/quirky-davinci-86dfhm`), à espera do próximo lançamento. Ao lançar,
passar para **Novidades** em `site/index.html` (com `data-i18n="news.<versão>.<n>"` e as traduções em `site/i18n/*.json`)
e apagar daqui.

Atenção: a versão 1.1.1 (lançada a 12 de novembro) é o commit `8f0afc5`. O que está abaixo veio depois e não faz parte
dela.

## Changelog

- **Três desportos:** o passo 4 passa a ter três separadores, **Ciclismo**, **Corrida e trail** e **Ski e snowboard**.
  Tudo o que já existia está em Ciclismo, com os temas Predefinido e Natal. Quando o ficheiro diz o desporto (FIT:
  corrida, caminhada, montanhismo, ski, snowboard, ciclismo; GPX: o tipo do percurso), a app abre esse separador
  sozinha, marca-o com "do ficheiro" e escolhe gadgets desse desporto. Os gadgets comuns (FC, altitude, distância,
  tempo, hora, mapa, perfil, painéis de FC e altitude) aparecem nos desportos onde fazem sentido.
- **Corrida e trail:**
  - **Ritmo** em min:ss por km (ou por milha), calculado pela distância dos últimos 10 s, mais estável do que a
    velocidade do GPS; mostra "—" quando o corredor está parado.
  - **Ritmo ajustado à inclinação (GAP)**, o ritmo equivalente em plano para o mesmo esforço (modelo de Minetti).
  - **Cadência em passos por minuto**: nos FIT de corrida a cadência vem por perna, a app passa a mostrá-la em passos.
  - **Velocidade vertical** (m/h), verde a subir e azul a descer, para o trail.
  - **Mostradores com uma pista de atletismo à volta**: ritmo (com o ritmo médio e o do último km por baixo),
    frequência cardíaca, cadência, distância, tempo, altitude, inclinação e velocidade vertical (com D+ e D−).
  - **Tabela de parciais**, preenchida km a km (ou milha a milha) com ritmo, FC média, subida e cadência média; o km
    em curso aparece destacado e o parcial mais rápido leva uma estrela.
  - **Corrida contra o PR (fantasma)**: indica-se a distância (5 km, 10 km, meia maratona, maratona ou outra) e o
    tempo do recorde pessoal, e onde começa a corrida (início da atividade, início de um segmento marcado no passo 3
    ou início do clip). O gadget mostra uma vista aproximada da pista que vai acompanhando os dois corredores, como
    num videojogo: o fantasma ao ritmo do PR, com rasto, e o corredor animado ao ritmo da sua cadência; por baixo, a
    barra do percurso inteiro com os dois. Mostra a diferença em tempo e em metros, à frente ou atrás, o ritmo atual
    e o tempo final previsto; na meta, o tempo final e "NOVO PR!" quando é mais rápido.
  - As voltas e segmentos marcados no passo 3 mostram ritmo em vez de velocidade, e cadência em passos.
- **Ski e snowboard:**
  - **Declive** em graus (com a percentagem por baixo), calculado até 50° em vez do limite de 35 % das estradas.
  - **Desnível descido** no dia e **velocidade máxima** até ao momento.
  - **Mostradores com um aro gelado**: velocidade, declive, desnível descido (com o número de descidas), altitude,
    FC, tempo e temperatura.
  - **Descidas detetadas pela altitude**: cada descida de pelo menos 40 m conta, as subidas entre elas são
    teleféricos. O cartão **Descida (em direto)** mostra a velocidade, o tempo, o desnível, a velocidade máxima e a
    média da descida em curso; no teleférico mostra a altitude e quanto falta para o topo. A **Tabela de descidas**
    vai-se preenchendo com tempo, desnível, velocidade máxima e média de cada descida.
- Os nomes dos ficheiros dos gadgets novos levam o desporto à frente (ex.: `corrida-mostrador-fc`), para não se
  confundirem com os de ciclismo.

### Pequenas correções (sugestões de utilizadores)

- **Mapa circular sem soluços:** a direção para onde o mapa roda deixou de saltar uma vez por segundo (a cada ponto do
  GPS). Passa a ser calculada com pontos interpolados 30, 45 e 60 m para trás no percurso, por isso o mapa roda de
  forma contínua, também nas curvas.
- **Segmentos já não competem entre si:** só as voltas são comparadas (diferença para a melhor volta, a melhor em
  destaque). Um segmento é um troço com início e fim marcados à mão; vários segmentos no mesmo vídeo aparecem na tabela
  com as suas médias, sem comparações nem estrelas.
- **Área dos mapas e perfis:** ao escolher um mapa ou um perfil de altimetria (mapa, mapa circular, perfil, cartão de
  perfil e as versões de Natal) aparece a caixa "Área dos mapas e perfis", com quatro opções: **volta toda**, **só os
  clips** (do início do primeiro clip ao fim do último), **clip a clip** (o vídeo de cada clip mostra só o troço desse
  clip) e **escolher no mapa**, onde se arrastam os marcadores de início (verde) e fim (vermelho) ao longo do percurso,
  no mapa ou no perfil por baixo; os troços dos clips aparecem a azul como referência. O mapa e o perfil passam a
  mostrar só esse troço, com zoom, e o perfil indica os km a partir do início da volta.

