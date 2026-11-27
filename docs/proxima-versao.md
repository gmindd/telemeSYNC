# Próxima versão (por lançar)

Novidades já no código, à espera do próximo lançamento. Ao lançar, passar para **Novidades** em `site/index.html` (com
`data-i18n="news.<versão>.<n>"` e as traduções em `site/i18n/*.json`) e apagar daqui.

A versão 1.3.0 foi lançada a 27 de novembro de 2026; o que tinha esta lista está nas Novidades do site.

## Para a próxima versão (depois da 1.3.0)

- **Tirar os temas de teste:** em `packages/core/src/overlays/themes.ts`, passar `status: 'preview'` para `'stable'` no
  Vidro e nos seis temas novos (HUD aviação, Minimal Pro, Transmissão TV, Cyberpunk, Gelo, Outdoor). Com todos
  estáveis, o visto "Mostrar temas em teste" (passo 4 e app móvel) deixa de ter efeito: retirá-lo, com as chaves
  `ov.showPreview`/`ov.preview` (web) e `gadgets.preview` (móvel). Atualizar `docs/temas/README.md` e o teste
  `offeredThemes` em `packages/core/test/themes.test.ts`.

## Changelog

(vazio)
