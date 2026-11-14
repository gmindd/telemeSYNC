# telemeSYNC mobile

App para Android e iOS que faz tudo no telemóvel: importar o clip e o ficheiro da atividade (FIT/GPX), sincronizar,
escolher os gadgets, exportar o vídeo com os overlays já incluídos e partilhá-lo nas redes sociais.

Desenvolvida em paralelo com a versão desktop (`apps/web` + `apps/server`), no mesmo repositório: as duas usam o
`packages/core` (leitura de FIT/GPX e de metadados dos clips, sincronização, desenho dos gadgets). O que é lógica vai
para o core, para chegar às duas apps; aqui ficam só os ecrãs e o que é próprio do telemóvel.

## Como funciona

```
Capacitor (app nativa) ── WebView do sistema
  clip ──▶ Mediabunny ──▶ WebCodecs: descodificador de hardware
                              │ frame
                              ▼
            canvas: frame + gadgets do core (drawComposite, os mesmos renderers do desktop)
                              │
                              ▼
            WebCodecs: codificador H.264 ──▶ MP4 (+ áudio do clip) ──▶ partilhar (Instagram, TikTok, …)
```

Tudo acontece no aparelho; nada é enviado para servidores.

## Estado

- **Fase 0, prova de conceito (feita):** exportação no telemóvel a cerca de 1× tempo real (30 s de 1080p em ~30 s
  num Android), partilha direta para as redes.
- **Fase 1, editor (atual):**
  - ecrã inicial (vídeo + atividade);
  - editor com o vídeo a correr e os gadgets por cima: tocar para escolher, arrastar para mover, canto ou dois
    dedos para o tamanho;
  - linha do tempo com corte, sincronização fina com os valores da atividade no instante;
  - formatos Original, 9:16, 4:5, 1:1 e 16:9 com enquadramento (os das redes saem no tamanho padrão delas,
    1080 × 1920 no 9:16), uma disposição dos gadgets por formato;
  - zonas tapadas pelo TikTok, Instagram Reels e YouTube Shorts (do core), com a opção de afastar os gadgets;
  - ecrã de exportação com progresso e partilha; as escolhas ficam guardadas para o vídeo seguinte.

Se o `<video>` do WebView não conseguir reproduzir o clip (alguns telemóveis com HEVC), o editor mostra os frames
descodificados pelo WebCodecs, o mesmo descodificador da exportação (sem som).

## Desenvolver

```bash
npm run dev -w @telemesync/mobile        # http://localhost:5175 (também acessível pelo telemóvel na mesma rede)
```

Em desenvolvimento aparecem botões com ficheiros de teste, servidos de `apps/mobile/.dev-fixtures/` (não vão para o
git): `ride.fit`, `clip-landscape.mp4` e `clip-portrait.mp4`. Para os gerar:

```bash
cp fixtures/real/ride-0-2026-10-11-09-00-31.fit apps/mobile/.dev-fixtures/ride.fit
node_modules/ffmpeg-static/ffmpeg -f lavfi -i testsrc2=size=1920x1080:rate=30 -f lavfi -i sine=frequency=440 -t 20 -c:v libx264 -pix_fmt yuv420p -c:a aac -metadata creation_time=2026-10-11T08:40:00Z apps/mobile/.dev-fixtures/clip-landscape.mp4
```

(o vertical é igual com `size=1080x1920` e `creation_time=2026-10-11T08:50:00Z`).

## Android

Precisa do Android SDK e do JDK 21.

```bash
npm run apk -w @telemesync/mobile        # gera android/app/build/outputs/apk/debug/app-debug.apk
npm run android -w @telemesync/mobile    # abre o projeto no Android Studio
```

Instalar no telemóvel ligado por USB (com a depuração USB ativa): `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

Se o Gradle falhar no Windows com `Unable to establish loopback connection`, o Java não conseguiu criar o socket
local na pasta temporária; aponte-a para dentro do projeto antes de compilar:

```powershell
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$PWD\android\.gradle-tmp -Djava.io.tmpdir=$PWD\android\.gradle-tmp"
```

## iOS

Mais tarde: compilar exige macOS (um Mac ou o runner macOS do GitHub Actions) e, para instalar num iPhone, uma conta
Apple Developer.
