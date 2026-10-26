# Arquitetura

```
apps/web  (browser)                         apps/server (Node, local)
┌──────────────────────────────┐            ┌─────────────────────────────────┐
│ FIT/GPX → core: parse+métricas│── upload ─▶│ core: parse+métricas (mesma API)│
│ clips → core: leitor ISO-BMFF │            │ jobs: N workers (cores − 1)     │
│   (File.slice, só o moov)     │            │   worker: core renderers        │
│ sync: perfis, resolvers,      │── só JSON ▶│     + @napi-rs/canvas           │
│   offsets, avisos             │  (metadados│     → RGBA → FFmpeg (stdin)     │
│ preview: <video> + <canvas>   │  e tempos) │     → ProRes 4444 + alfa (.mov) │
│   com core renderers          │◀── SSE ────│ progresso, cancelar, abrir pasta│
└──────────────────────────────┘            └─────────────────────────────────┘
```

## `packages/core`

| Pasta | Conteúdo |
|---|---|
| `telemetry/` | `parseFit` (`@garmin/fitsdk`), `parseGpx` (tolerante), `buildRide` (série normalizada + derivadas), `sampleAt` (interpolação linear, buracos > 10 s não interpolados) |
| `metrics/` | suavização (média móvel por tempo, mediana), altitude filtrada, **inclinação sobre distância** (janela 40 m, ±35 %), D+ com histerese (2,5 m) |
| `media/` | leitor ISO-BMFF próprio: lê cabeçalhos e o `moov` (mesmo no fim do ficheiro); `mvhd` creation_time, fps (stts), resolução, codec, timecode `tmcd`, deteção de GPMF, tags `udta`/`meta` |
| `sync/` | perfis de câmara, resolvers pluggable (manual, GPMF, creation_time, nome, timecode), capítulos GoPro, sanity checks, offsets por câmara + por clip |
| `overlays/` | renderers `draw(ctx, frame, style, octx)` partilhados entre browser e Node; algarismos tabulares desenhados em células de largura fixa; texto atualizado a N Hz (relativo ao início do clip), mapa/marcadores a cada frame |
| `node/` | só Node: fontes embutidas, sink FFmpeg, `renderOverlay`, worker threads |
| `cli/` | `poc` (Fase 0), `inspect` (metadados reais), `contactSheet` (pré-visualização de todos os overlays) |

O ponto de entrada `@telemesync/core` não importa nada de Node, por isso é usado diretamente pelo browser.

## Decisões

- **Mesmo renderer no preview e na exportação**: a fonte embutida (Inter, `assets/fonts`) é carregada pelo browser (`FontFace`) e pelo `@napi-rs/canvas`; a largura das células dos algarismos é medida na própria fonte.
- **ProRes**: `prores_ks -profile:v 4444 -pix_fmt yuva444p10le -alpha_bits 16 -qscale:v 2`. O quantizador fixo é ~5× mais rápido do que o controlo de débito por defeito e visualmente sem perdas para gráficos (PSNR ≈ 71 dB).
- **Frames repetidos**: overlays só de texto mudam apenas à taxa de atualização (4 Hz) — o frame anterior é reutilizado.
- **Leitura do alfa**: `getImageData` (RGBA não pré-multiplicado) é o que o FFmpeg espera em `-pix_fmt rgba`.

## Android (`apps/android`)

```
WebView (https://appassets.androidplatform.net, assets do APK)
┌───────────────────────────────────────────┐
│ apps/web, igual ao do computador           │
│ api.ts → local/localApi.ts (sem servidor)  │
│   1 worker por ficheiro (renderWorker.ts): │── base64 ──▶ WebAppBridge.kt
│   OffscreenCanvas + core renderers         │  (síncrono)   MediaStore → Documents/telemeSYNC/…
│   → QtrleEncoder + MovWriter (.mov)        │
│   → WebCodecs VP9 ×2 + WebmWriter (.webm)  │
│   → convertToBlob (PNG)                    │
└───────────────────────────────────────────┘
```

- **QuickTime Animation em JavaScript** (`export/qtrle.ts`, `export/mov.ts`): o mesmo bitstream do `qtrle` do FFmpeg (ARGB, só as linhas e os troços que mudam entre key frames, uma key frame por segundo); o FFmpeg descodifica-o pixel a pixel igual ao original e fica mais leve do que o do FFmpeg.
- **WebM VP9 com alfa** (`export/webm.ts`): dois `VideoEncoder`, um para a cor (RGBA de `getImageData`, alfa não pré-multiplicado como o `yuva420p` do FFmpeg) e outro para o canal alfa, como luma de um frame I420; o alfa vai em `BlockAdditional` (ID 1), como no libvpx. Só aparece se o WebView codificar VP9.
- **Gravação**: o worker envia blocos de ~1 MB à página, que os passa ao bridge (só aceita strings) e só depois responde ao worker; assim a memória não cresce quando o armazenamento é mais lento. O cabeçalho `mdat` do MOV e o SeekHead/duração do WebM são corrigidos no fim com `writeAt`.
