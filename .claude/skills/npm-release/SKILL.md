---
name: npm-release
description: Prepare and publish a versioned npm package with dependency auditing, build and test gates, English release commits, README verification, registry propagation checks, and tag push. Use when a user asks to release or publish this npm package; do not publish without explicit authorization.
---

# Publicar cvlac-mcp en npm

Usa esta skill para llevar `cvlac-mcp` desde un árbol de trabajo actualizado hasta una versión publicada y verificable. La preparación es reversible; `npm publish` y el push del tag son mutaciones externas y requieren autorización explícita del usuario.

## Preparación

Trabaja desde `master` y confirma que el código publicado corresponde al merge aprobado:

```bash
git status --short
git switch master
git pull --ff-only origin master
npm ci
```

Confirma el nombre y la versión local:

```bash
npm pkg get name version
npm view cvlac-mcp version dist-tags
```

No intentes reutilizar una versión ya publicada.

## Seguridad y calidad

Audita primero las dependencias de producción:

```bash
npm audit --omit=dev
```

Si hay vulnerabilidades corregibles, ejecuta `npm audit fix` sin `--force`, revisa el diff de `package.json` y `package-lock.json`, y crea un commit separado con título y cuerpo en inglés, por ejemplo:

```bash
git add package.json package-lock.json
git commit -m "fix: update vulnerable dependencies" -m "Refresh production dependency resolutions after npm audit."
```

No uses `npm audit fix --force` sin explicar los cambios mayores y recibir autorización.

Después ejecuta:

```bash
npm run build
npm test
npm pack --dry-run
npm whoami
```

El tarball debe incluir `README.md`, `dist/`, `LICENSE` y los archivos de configuración de ejemplo, y no debe incluir credenciales, `.env`, reportes de pruebas ni datos personales. Si Chromium falla por las restricciones del entorno, distingue ese problema de un fallo de código y repite la suite con el permiso de ejecución adecuado.

## README y versionado

El `README.md` del repositorio es también el README que npm muestra después de publicar. Actualízalo antes del versionado y asegúrate de que esté en `master` o en el PR que se fusionará.

Los commits deben tener título y cuerpo en inglés. Para crear una release nueva:

```bash
npm version <new-version> -m "chore: release v%s"
```

Esto actualiza la versión, crea el commit y crea el tag. Si ya se ejecutó, verifica `npm pkg get version` antes de volver a intentar; no incrementes otra versión por una demora del registro.

## Publicación y verificación

Con autorización explícita para publicar:

```bash
npm publish
git push origin master --follow-tags
```

El `prepublishOnly` de este paquete vuelve a ejecutar `npm run build` y `npm test`. Si `npm publish` falla, conserva el diagnóstico y no incrementes automáticamente otra versión.

Comprueba el resultado:

```bash
npm view cvlac-mcp version dist-tags
```

Si npm todavía muestra la versión anterior justo después de publicar, espera brevemente y repite la consulta. Una versión local nueva junto con una versión remota vieja significa que aún falta `npm publish`, no que haya que crear otra versión.
