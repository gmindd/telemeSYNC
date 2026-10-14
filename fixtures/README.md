# Fixtures

- `synthetic/` — FIT/GPX sintéticos (gerados por `packages/core/test/helpers/writeFixtures.ts`): 20 min com subida de 8 %, paragem e buraco de 30 s.
- `real/` — metadados de ficheiros reais, gerados com:

  ```
  npm run inspect -- <clips e FIT/GPX> --out fixtures/real
  ```

  **Não coloque vídeos no repositório** (o `.gitignore` ignora `.mp4/.mov/.insv`). Os ficheiros FIT/GPX
  são pequenos e podem ser incluídos. Em cada JSON de clip, preencha `groundTruth.realStartLocal`
  (hora real de início, hora local, ex.: `"2024-06-15 09:30:05"`) se a souber.
