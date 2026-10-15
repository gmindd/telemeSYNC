# telemeSYNC

Gerador de overlays de telemetria para vídeos de bicicleta. A partir de um ficheiro **FIT/GPX** (Bryton, Garmin, iGPSPORT…) e dos clips das action cams (**DJI Osmo Action, GoPro, Insta360**), gera **por clip e por métrica** um vídeo transparente (ProRes 4444 com alfa) com a mesma duração e fps do clip. No editor (DaVinci Resolve, Premiere Pro, Final Cut Pro) basta arrastá-lo para cima do clip.

- Os vídeos **nunca são enviados** para lado nenhum: o browser lê só os metadados (duração, fps, datas).
- Tudo corre localmente no seu computador.

## Instalação no Windows

**Forma rápida:** instale o Node.js (passo 1) e depois faça **duplo clique em `iniciar.bat`** na pasta do projeto. Da primeira vez instala tudo; nas seguintes só arranca. Mantenha a janela aberta enquanto usa a aplicação.

**Ou passo a passo:**

1. **Instale o Node.js** (versão 20 ou superior, recomendada a LTS): <https://nodejs.org/pt> → botão "LTS" → instalar com as opções por defeito.
2. **Descarregue o projeto**:
   - com Git: `git clone https://github.com/gmindd/telemeSYNC.git`, ou
   - no GitHub: botão verde **Code → Download ZIP**, e extraia o ZIP (por exemplo para `Documentos\telemeSYNC`).
3. Abra a pasta do projeto no **Explorador de Ficheiros**, clique na barra de endereço, escreva `powershell` e carregue em Enter.
4. Na janela do PowerShell, instale as dependências (só da primeira vez; descarrega o FFmpeg automaticamente):
   ```powershell
   npm install
   ```
5. Arranque a aplicação:
   ```powershell
   npm start
   ```
   O browser abre em <http://localhost:5174>. Para terminar, feche a janela do PowerShell (ou `Ctrl+C`).

> Se o PowerShell disser *"running scripts is disabled on this system"*, escreva `npm.cmd` em vez de `npm` (`npm.cmd install`, `npm.cmd start`), ou execute uma vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Instalação no macOS

**Pacote pronto (recomendado):** descarregue `telemeSYNC-…-macos.zip` (Macs Apple Silicon e Intel, macOS 11 ou mais recente), abra-o e faça duplo clique em **`Iniciar telemeSYNC.command`**. Não é preciso instalar nada. Como a aplicação não está registada na Apple, da primeira vez o macOS bloqueia-a:

- **macOS 15 Sequoia ou mais recente:** *Concluído* → **Definições do Sistema → Privacidade e Segurança** → no fundo, **Abrir mesmo assim**.
- **macOS 14 ou anterior:** botão direito (ou Control+clique) no ficheiro → **Abrir** → **Abrir**.

O lançador retira a quarentena ao resto da pasta, por isso o Node.js e o FFmpeg incluídos já não voltam a pedir autorização. Mais detalhes no `LEIA-ME.txt` do pacote.

**A partir do código:** instale o Node.js (<https://nodejs.org/pt> ou `brew install node`), depois no Terminal, dentro da pasta do projeto: `npm install` e `npm start`.

## Como usar

1. **Telemetria** — arraste o `.fit` (preferido) ou `.gpx`. Aparece o resumo da volta e as métricas disponíveis.
2. **Clips** — arraste todos os clips de uma vez (várias câmaras). A câmara é detetada automaticamente; pode mudá-la na lista (inclusive criar uma segunda câmara do mesmo tipo).
3. **Sincronização** — a timeline mostra a volta (velocidade + altimetria) e os clips como blocos coloridos por câmara.
   - Arrastar um bloco muda o **offset global da câmara** (alinha todos os clips dessa câmara de uma vez). Com **Alt** ajusta só esse clip.
   - Botões ±1 min / ±1 s / ±0,1 s para afinar.
   - Selecione um clip para ver o vídeo com os overlays por cima, ao vivo. Valide numa **paragem**: a velocidade tem de ir a 0 quando a bicicleta para.
   - **Arraste os gadgets** no preview para os posicionar; o canto inferior direito muda o tamanho. *Repor posições* volta ao arranjo inicial.
   - Avisos: clip fora da volta, desvio de exatamente 1 h/2 h (corrige-se com um clique), MP4 exportado do Insta360 Studio, etc.
4. **Overlays** — escolha as métricas e o estilo (cores, contorno, sombra, unidades métricas/imperiais, °C/°F, resolução…).
   - **Painéis**: um gadget por métrica com mostrador, máximo/média (ou zona, aceleração, variação) e gráfico dos últimos 10 min ou 10 km, num gradiente de duas cores à escolha. O gráfico pode mostrar outra métrica (ex.: velocidade com a altimetria dos últimos 10 km).
5. **Renderizar** — escolha a pasta de saída (predefinida: `Documentos\telemeSYNC`), o modo de exportação e carregue em Renderizar. No fim, **Abrir pasta**.
   - **Gadgets separados**: um `.mov` por gadget, do tamanho do gadget — os mesmos ficheiros servem para várias montagens (ex.: filmado em 1:1, recortado para 16:9 no YouTube e 9:16 no Instagram, posicionando cada gadget à mão).
   - **Composição única**: um `.mov` por clip com a proporção do vídeo (720p a 4K, predefinido Full HD) e os gadgets nas posições arrastadas no preview — é só pôr por cima do clip.
   - Pode escolher os dois.
   - **Formato**: por defeito *QuickTime Animation* (.mov, sem perdas, cerca de 10× mais leve do que ProRes; transparência no Premiere Pro e no Final Cut Pro). Se o fundo aparecer preto no editor, exporte em *ProRes 4444* (DaVinci Resolve, CapCut) ou *FFV1* (DaVinci Resolve). O Canva não aceita vídeos com transparência.
   - Para ficheiros ainda mais leves: *Máximo 30 fps* (clips a 50/60 fps) e, no passo 4, painéis *ao ritmo dos números*.

Estrutura gerada:
```
{pasta de saída}/{nome da volta}/{clip}/{clip}_{métrica}.mov      (gadgets separados)
{pasta de saída}/{nome da volta}/{clip}/{clip}_composicao.mov     (composição)
ex.: Documentos/telemeSYNC/2024-06-15 Sintra/GX010123/GX010123_velocidade.mov
```

Pode **guardar o projeto** (JSON) e reabri-lo mais tarde; volte a carregar a telemetria e arraste os vídeos para os pré-visualizar.

### Preview de vídeos HEVC (H.265) e .insv

Muitas câmaras gravam em HEVC. O Chrome/Edge no Windows só o reproduzem com as **Extensões de Vídeo HEVC** da Microsoft Store instaladas (o Edge costuma funcionar melhor). Ficheiros `.insv` (360° em bruto) não são reproduzíveis no browser. Nestes casos o preview mostra só os dados, com um slider para percorrer o clip — a sincronização e a exportação funcionam na mesma.

## No editor de vídeo

Os ficheiros são **ProRes 4444 com canal alfa** (`.mov`), com a mesma duração e fps do clip. São renderizados a 2× (configurável) para ficarem nítidos quando os aumenta.

- **DaVinci Resolve**: arraste o `.mov` para a pista acima do clip, alinhado com o início. Se a transparência não aparecer: botão direito no clip na Media Pool → *Clip Attributes* → *Alpha Mode* → *Straight*.
- **Premiere Pro**: arraste para a pista V2, por cima do clip. O alfa é reconhecido automaticamente.
- **Final Cut Pro**: arraste como *connected clip* por cima do clip.

## Linha de comandos

```powershell
# Prova de conceito (Fase 0): um clip + FIT + offset manual → velocidade.mov
npm run poc -- --fit volta.fit --clip GX010123.MP4 --offset 0 --out saida

# Ver os metadados de ficheiros reais (para validar câmaras / gerar fixtures)
npm run inspect -- GX010123.MP4 DJI_20240615093005_0001_D.MP4 volta.fit --out fixtures/real
```

## Desenvolvimento

```powershell
npm run dev        # servidor (watch) + Vite com hot reload em http://localhost:5173
npm test           # testes unitários e de integração (Vitest)
npm run typecheck
scripts/package-windows.sh   # pacote Windows autónomo (Node portátil + dependências) em dist-release/
scripts/package-mac.sh       # pacote macOS autónomo, universal (Apple Silicon + Intel), em dist-release/
```

O pacote macOS pode ser gerado em qualquer sistema (também no Git Bash do Windows; o ZIP leva as permissões Unix através de `scripts/zip-unix.py`), mas só é testado num Mac a sério pelo workflow **macOS** do GitHub Actions (`.github/workflows/mac.yml`): corre os testes num Mac, gera o pacote, verifica as assinaturas dos binários e arranca-o em quarentena, como um download, num Mac Apple Silicon e num Intel, renderizando um clip. O ZIP testado fica nos *Artifacts* da execução.

- `packages/core` — parsing FIT/GPX, métricas, sincronização, leitor de metadados MP4/MOV e **renderers** dos overlays (partilhados entre preview e exportação).
- `apps/server` — Fastify: jobs de renderização (worker threads + FFmpeg), progresso por SSE, definições, abrir pasta.
- `apps/web` — Vite + React: painel, timeline e preview.

Ver também [`docs/architecture.md`](docs/architecture.md) e [`docs/camera-timestamps.md`](docs/camera-timestamps.md).

### Publicar uma atualização

1. Subir a versão no `package.json` da raiz, de `apps/*` e de `packages/core` e gerar os pacotes: Windows com `scripts/package-windows.sh`; macOS a partir dos *Artifacts* do workflow **macOS** (ou `scripts/package-mac.sh`).
2. Carregar os `.zip` (`telemeSYNC-<versão>-windows.zip` e `telemeSYNC-<versão>-macos.zip`) para o branch `downloads`.
3. No site: acrescentar a versão em **Novidades** (`site/index.html`), atualizar os links de download no HTML e `site/data/latest.json` (versão, data, resumo de uma linha e `downloads.windows`/`downloads.mac`; `downloadUrl` continua a ser o ZIP de Windows, lido pelas versões até à 0.3.2).
   Para as outras línguas, dar a cada ponto novo um `data-i18n="news.<versão sem pontos>.<n>"` (ex.: `news.033.1`) e acrescentar a tradução com a mesma chave em `site/i18n/en.json`, `fr.json`, `es.json` e `de.json`. Um texto sem tradução aparece em português.
4. Enviar para o `main` e fazer *Redeploy* no Coolify.

Ao abrir, o programa lê `https://telemesync.pereiragabriel.com/data/latest.json` e, se a versão for mais recente do que a sua, mostra um aviso com os links para as novidades e o download do seu sistema. O site usa o mesmo ficheiro para a versão e os links dos botões de download, e põe primeiro o sistema de quem visita.

## Estado

- ✅ Fase 0 — prova de risco (`npm run poc`).
- ✅ Fase 1 — painel completo (em validação com ficheiros reais).
- ⏳ Validar o comportamento das datas de cada câmara com ficheiros reais (`docs/camera-timestamps.md`).
- Parcialmente feito da Fase 2: guardar/abrir projeto, sequência PNG, zonas de FC, estilo guardado no browser.
