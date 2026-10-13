# Projeto: Gerador de overlays de telemetria BTT

## Contexto

Ando de BTT e filmo as voltas com action cams (GoPro, DJI Osmo Action, Insta360). Uma volta tem 3–5h, mas o vídeo são dezenas de clips curtos. Gravo a telemetria num ciclocomputador Bryton (FIT, também exporto GPX). Quero uma app local que:

1. Recebe um ficheiro FIT/GPX e N clips de vídeo.
2. Lê **apenas os metadados** de cada clip (início e duração). Não processa a imagem.
3. Sincroniza os clips com a telemetria.
4. Gera, **por clip e por métrica escolhida**, um vídeo transparente com a mesma duração do clip. No editor (DaVinci Resolve, Premiere Pro, Final Cut Pro) arrasto-o para cima do clip e redimensiono/posiciono como quiser.

UI em **português europeu**. Código, nomes de ficheiros e comentários em inglês.

---

## Decisões de arquitetura (fixas)

- **Sem Electron no MVP.** App local: `npm start` arranca um servidor Node e abre o browser em `localhost`. Empacotar como desktop fica para depois.
- **Os vídeos nunca são enviados para o servidor.** O browser lê os metadados do contentor MP4/MOV/INSV no cliente (ex.: `mp4box.js`, lendo só os átomos necessários com `File.slice`; o `moov` pode estar no fim do ficheiro). Só os metadados (nome, duração, fps, resolução, timestamps candidatos) vão para o servidor. O ficheiro FIT/GPX é pequeno e é enviado normalmente.
- **Monorepo com npm workspaces, TypeScript em todo o lado:**
  - `packages/core`: parsing FIT/GPX, cálculo de métricas, modelo de sincronização e **renderers de overlays**.
  - `apps/server`: Fastify com jobs de renderização e progresso por SSE. Escreve os ficheiros numa pasta de saída configurável e expõe um endpoint para abrir essa pasta no explorador do SO.
  - `apps/web`: Vite + React com o painel, a timeline de sincronização e o preview.
- **Renderers partilhados entre preview e exportação.** Cada overlay é uma função `draw(ctx: CanvasRenderingContext2D-like, state, style)`. No browser desenha num `<canvas>` sobre o `<video>` (preview ao vivo). No servidor desenha com `@napi-rs/canvas` (binários pré-compilados, funciona em Windows sem toolchain). O mesmo código serve os dois lados.
- **Exportação:** frames RGBA do canvas → pipe para FFmpeg (`ffmpeg-static`) via stdin (`-f rawvideo -pix_fmt rgba`) → **ProRes 4444 com alfa** (`-c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -alpha_bits 16`), `.mov`. Opção secundária: sequência PNG. O fps do overlay é igual ao fps do clip.
- Plataforma principal: **Windows**. Tem de funcionar também em macOS.

---

## Dados de telemetria

- **FIT é a fonte preferida** (`@garmin/fitsdk`; avaliar `fit-file-parser` como alternativa). Campos: timestamp, posição, `enhanced_altitude` (barométrica), `enhanced_speed`, distance, heart_rate, cadence, power, temperature.
- **GPX como fallback:** trkpt lat/lon/ele/time + extensões `gpxtpx:TrackPointExtension` (hr, cad, atemp) e power nas variantes comuns. Parsing tolerante: campos em falta = métrica indisponível, nunca um erro.
- Normalizar tudo para uma série temporal interna em UTC (ms) com interpolação linear para qualquer instante `t`. Tratar pausas e buracos: dentro de um buraco > 10 s não interpolar posição/velocidade, e a velocidade mostra 0 ou "—" (configurável).
- **Métricas derivadas:**
  - Velocidade (km/h): `enhanced_speed` se existir; senão haversine/Δt. Suavização (média móvel ~3 s).
  - Inclinação (%): calculada **sobre distância** (janela ~30–50 m) com altitude previamente filtrada (mediana + média). Limitar a ±35%. Isto é crítico: sem suavização o valor salta de forma absurda.
  - Distância acumulada, D+ acumulado (com histerese ~2–3 m para não somar ruído), tempo decorrido e hora local. Os acumulados **contam desde o início da volta**, não do clip.
- A UI mostra apenas as métricas que existem no ficheiro carregado.

---

## Sincronização (núcleo do problema)

### Princípio
O relógio de cada câmara tem um desfasamento ~constante face ao GPS durante a volta toda. **Modelo: um offset global por câmara**, mais um ajuste fino opcional por clip. Calibrar uma vez alinha todos os clips dessa câmara.

### Resolução do timestamp de início (resolver pluggable, por ordem de confiança)
1. **GoPro com GPS ativo:** extrair a track GPMF e usar `GPSU` (UTC real) → sincronização exata. Pode ficar na Fase 3, mas o resolver tem de estar preparado para isto.
2. **`creation_time` do contentor** (mvhd/QuickTime), com o perfil de câmara a definir a interpretação. Quirk conhecido: a GoPro grava a hora local como se fosse UTC. Algumas câmaras gravam a hora de fecho do ficheiro, e aí início = creation − duração. **Validar cada caso com ficheiros reais que vou fornecer.**
3. **Nome do ficheiro:** padrões como `VID_YYYYMMDD_HHMMSS_*.insv/mp4` (Insta360) ou `DJI_YYYYMMDDHHMMSS_*.MP4` (DJI). Hora local.
4. **Manual:** o utilizador indica a hora de início.

Perfis de câmara: GoPro, DJI, Insta360 e Genérico. Cada perfil define a ordem dos resolvers e a interpretação do fuso. Fuso por defeito: `Europe/Lisbon`, com hora de verão tratada corretamente.

### Casos especiais
- **Capítulos GoPro** (`GX01xxxx`, `GX02xxxx`… para o mesmo número de vídeo): são uma gravação contínua dividida. Agrupar e garantir que o capítulo N+1 começa onde o N acaba.
- **Insta360 exportado do Studio:** o MP4 exportado pode ter `creation_time` = data de exportação, e se foi aparado no Studio o início não corresponde ao original. Detetar (creation_time posterior ao fim da volta → suspeito), avisar e permitir associar o `.insv` original ou recorrer ao nome do ficheiro e ao ajuste manual.
- **Sanity checks:** clip fora da janela da volta → aviso. Desvio de ~1h/2h exatas → sugerir correção de fuso com um clique.

### UI de sincronização
- Timeline horizontal da volta completa com o gráfico de velocidade e o perfil de altimetria por baixo. Os clips aparecem como blocos posicionados no tempo, com uma cor por câmara.
- Arrastar um bloco (ou usar um slider/nudge ±1 s, ±0,1 s) altera o **offset global da câmara**. Com modificador (Alt), ajusta só aquele clip.
- **Preview:** ao selecionar um clip, o `<video>` toca o ficheiro local (object URL) com os overlays desenhados por cima em tempo real. Assim valido a sincronização, por exemplo numa paragem em que a velocidade tem de ir a 0 quando a bici para.
- **Fallback de preview:** se o browser não conseguir tocar o ficheiro (HEVC sem suporte, `.insv`), mostrar só os dados (valores atuais + marcador na timeline) e explicar porquê.
- Guardar e reabrir o projeto (JSON: ficheiro de telemetria, metadados dos clips, offsets, overlays escolhidos e estilos).

---

## Overlays

Cada overlay é um vídeo independente, com fundo transparente e tamanho próprio, renderizado a 2× (ex.: 1000 px de largura) para continuar nítido quando escalado no editor.

### MVP
| Overlay | Conteúdo |
|---|---|
| Velocidade | valor + "km/h" + rótulo opcional |
| Altitude | valor + "m" |
| Inclinação | valor + "%" + indicador visual simples (seta/cor por intervalo) |
| Frequência cardíaca | valor + "bpm", cor opcional por zona (zonas configuráveis) |
| Cadência, potência, temperatura | se existirem no ficheiro |
| Distância / D+ / tempo decorrido | acumulados da volta |
| **Mapa** | traçado completo da volta (só linha, **sem tiles**) em projeção Web Mercator, com a parte já percorrida destacada e um ponto na posição atual. Opção "volta inteira" vs "zoom no troço do clip" |
| **Perfil de altimetria** | perfil da volta inteira com marcador da posição atual |

### Regras de design
- Fonte embutida no projeto com **algarismos tabulares** (para os números não "tremerem"). Por exemplo Inter ou outra open source.
- Os valores de texto atualizam a uma taxa configurável (por defeito 4 Hz) para não cintilarem a 60 fps. O mapa e o marcador movem-se suavemente a cada frame.
- Estilo global editável: fonte, cor do texto, cor de destaque, contorno/sombra para legibilidade sobre qualquer fundo, mostrar/esconder rótulos e unidades.
- Estilos guardados como predefinições.

### Saída
- Pasta por volta: `{saída}/{nome-volta}/{clip}/{clip}_{metrica}.mov`.
- Barra de progresso por clip e global. Possibilidade de cancelar. Renderização paralela limitada ao nº de cores − 1.
- No fim: resumo + botão "Abrir pasta".

---

## Fluxo do utilizador (painel)

1. Carregar FIT/GPX → mostra o resumo da volta (data, duração, distância, D+, métricas disponíveis).
2. Arrastar clips (vários de uma vez, de várias câmaras) → deteção automática do perfil de câmara + timestamps.
3. Ecrã de sincronização (timeline + preview) → ajustar offsets.
4. Escolher overlays (checkboxes) e estilo.
5. Renderizar.

---

## Fases e critérios de aceitação

**Começa em modo de planeamento: apresenta-me o plano e a estrutura de pastas antes de escrever código.**

### Fase 0: prova de risco (fazer primeiro)
Script CLI em `packages/core`: FIT + um clip (path) + offset manual → `velocidade.mov` em ProRes 4444 com alfa.
- ✅ O ficheiro abre com transparência no DaVinci Resolve, Premiere Pro e Final Cut Pro (eu testo).
- ✅ Duração e fps iguais ao clip.

### Fase 1: MVP
Painel completo com: FIT + GPX, clips GoPro/DJI/Insta360 via `creation_time` + nome do ficheiro, offset por câmara, timeline, preview com overlays ao vivo, overlays de texto + mapa + perfil, exportação em lote.
- ✅ Volta real com 10+ clips de 2 câmaras sincronizada com um único ajuste por câmara.
- ✅ Inclinação estável e plausível numa subida conhecida.
- ✅ Preview e exportação visualmente idênticos (mesmo renderer).
- ✅ Testes unitários: parsing FIT/GPX, interpolação, inclinação, resolvers de timestamp (com metadados reais em fixtures), agrupamento de capítulos GoPro.

### Fase 2
Predefinições de estilo, zonas de FC, projeto guardar/abrir, sequência PNG, associação manual MP4 exportado ↔ `.insv` original.

### Fase 3
GPMF (GoPro GPS) para sincronização exata. Sugestão automática de offset por correlação de paragens (velocidade ≈ 0 no GPS vs. movimento no vídeo). Empacotamento como app desktop.

---

## Notas para ti (Claude Code)

- Vou fornecer ficheiros reais de exemplo (FIT do Bryton, clips GoPro, DJI e Insta360). **Não assumas o comportamento dos timestamps de cada câmara: verifica com os ficheiros e documenta em `docs/camera-timestamps.md`.**
- Pede-me ficheiros sempre que precisares de validar algo, em vez de inventares.
- Commits pequenos por funcionalidade. README com instalação no Windows em PT-PT.
