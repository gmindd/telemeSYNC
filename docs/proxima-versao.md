# Próxima versão (por lançar)

Correções e novidades já no código, à espera do próximo lançamento. Ao lançar, passar para
**Novidades** em `site/index.html` (com `data-i18n="news.<versão>.<n>"` e as traduções em `site/i18n/*.json`)
e apagar daqui.

## Changelog

- **Frequência cardíaca sem falhas:** com relógios que só medem a FC de vez em quando (ex.: Huawei Watch GT 5 Pro),
  o overlay mostrava "—" entre leituras. Agora fica o último valor até à leitura seguinte (no máximo 30 s; numa pausa
  continua a mostrar "—"). O mesmo para cadência, potência e temperatura.
- **Registos repetidos juntos:** quando o ficheiro tem dois registos com a mesma hora (ex.: GPS num, FC no outro),
  os dois são juntos em vez de se perder o segundo.
