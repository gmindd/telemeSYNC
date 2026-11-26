# Próxima versão (por lançar)

Novidades já no código, à espera do próximo lançamento. Ao lançar, passar para **Novidades** em `site/index.html` (com
`data-i18n="news.<versão>.<n>"` e as traduções em `site/i18n/*.json`) e apagar daqui.

A versão 1.2.0 foi lançada a 19 de novembro de 2026; o que tinha esta lista está nas Novidades do site.

## Para a próxima versão (depois da 1.3.0)

- **Tirar os temas de teste:** em `packages/core/src/overlays/themes.ts`, passar `status: 'preview'` para `'stable'` no
  Vidro e nos seis temas novos (HUD aviação, Minimal Pro, Transmissão TV, Cyberpunk, Gelo, Outdoor). Com todos
  estáveis, o visto "Mostrar temas em teste" (passo 4 e app móvel) deixa de ter efeito: retirá-lo, com as chaves
  `ov.showPreview`/`ov.preview` (web) e `gadgets.preview` (móvel). Atualizar `docs/temas/README.md` e o teste
  `offeredThemes` em `packages/core/test/themes.test.ts`.

## Changelog

### 1.3.0 (por publicar)

#### Novidades
- **Galeria de temas** dentro de cada desporto, com os gadgets arrumados nas mesmas categorias em todos os temas (mostradores, painéis, mapas e perfis, navegação, extras) e uma faixa **Em uso** com tudo o que está escolhido.
- **Seis temas novos, em teste:** HUD aviação, Minimal Pro, Transmissão TV, Cyberpunk, Gelo e Outdoor, mais o Vidro. Aparecem logo no passo 4, marcados "Em teste" (desligar "Mostrar temas em teste" esconde-os).
- **Bússola** em todos os temas novos: rumo e seta com a distância de volta ao início.
- **Relógio GPS (Minimal Pro):** 3 ou 4 campos à escolha, cada um instantâneo, média, volta ou máximo.
- **Apagar gadgets na sincronização:** clicar no gadget e carregar no × ou na tecla Delete.
- **Transmissão TV:** a faixa inferior mostra o perfil da volta toda e o ponto onde está.
