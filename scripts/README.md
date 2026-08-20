# Migrar los audios de las audioguías a Cloudflare R2

Supabase avisó de que la organización se había pasado del gigabyte de
almacenamiento del plan gratuito (1,13 GB, con periodo de gracia hasta el 19 de
septiembre de 2026). Los MP3 de las audioguías son lo único que crece sin techo,
así que se mudan a Cloudflare R2, que da 10 GB y **no cobra por salida de
datos** — que en algo dedicado a servir audio es lo que decide.

Este script hace la mudanza de lo que ya existe. Lo lanzas tú, desde tu máquina.

---

## Antes de empezar

**1. Deno.** El script va con Deno y no con Node para poder importar el mismo
módulo de firma de R2 que usa la función en producción, en vez de tener dos
copias que se desincronicen:

```bash
brew install deno
```

**2. Credenciales**, en el `.env` de la raíz del proyecto (que ya está en
`.gitignore`):

```
SUPABASE_URL=https://TU-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # Supabase > Settings > API > service_role
R2_ACCOUNT_ID=...                          # Cloudflare > R2, en el bloque de API
R2_ACCESS_KEY_ID=...                       # token con Object Read & Write, solo este bucket
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=wanderlog-audioguias
VITE_R2_PUBLIC_URL=https://pub-XXXX.r2.dev
```

**3. La migración `059` aplicada.** Si no, `medir` avisa y para.

**4. Las fases 1 y 2 desplegadas** — el cliente que sabe leer claves y la
función que escribe en R2. Solo hace falta para `reescribir` en adelante:
`medir` y `copiar` se pueden lanzar antes, y de hecho conviene, porque copiar
1 GB es la parte lenta y no cambia nada de cara al usuario.

---

## Cómo funciona, en dos reglas

- **Nada escribe sin `--apply`.** Sin ese argumento, cada comando cuenta lo que
  haría y termina.
- **Todo es reanudable.** Si se corta a mitad, se relanza el mismo comando y
  sigue donde iba. El punto de control es el propio R2: antes de subir un
  fichero comprueba si ya está con el mismo tamaño.

También son idempotentes, así que se pueden repetir sin miedo, y aceptan filtros
para ir por tandas en vez de mover 1 GB de una vez:

```
--antes-de 3d          solo las paradas creadas hace más de tres días
--viaje UUID           solo un viaje
--limite 50            como mucho 50
```

---

## El orden

### 1. Medir

```bash
deno run -A scripts/migrar-audio-r2.ts medir
```

Es la única pregunta que puede tumbar el plan entero: **¿es el audio la mayor
parte de ese 1,13 GB?** Si no lo fuera, mover los MP3 no bajaría de 1 GB y
habría que ampliar el alcance antes de copiar nada. El comando lo dice
explícitamente al final.

De paso cruza el bucket con la base de datos y saca los **huérfanos**: ficheros
que no referencia ninguna fila. Son restos de un fallo antiguo —el borrado
listaba el prefijo de quien pulsaba borrar, no el de quien había generado el
audio— y se borran directamente, sin copiarlos.

### 2. Copiar

```bash
deno run -A scripts/migrar-audio-r2.ts copiar --antes-de 3d          # ensayo
deno run -A scripts/migrar-audio-r2.ts copiar --antes-de 3d --apply  # de verdad
```

De seis en seis para no saturar la conexión. Se puede cortar con Ctrl-C.

### 3. Verificar

```bash
deno run -A scripts/migrar-audio-r2.ts verificar --antes-de 3d
```

Tiene que terminar con **0 discrepancias**. Si sale alguna, no sigas: relanza
`copiar --apply` (recopia solo lo que no cuadra) y vuelve a verificar.

### 4. Reescribir

```bash
deno run -A scripts/migrar-audio-r2.ts reescribir --antes-de 3d
deno run -A scripts/migrar-audio-r2.ts reescribir --antes-de 3d --apply
```

Cambia `audio_url` de la URL completa de Supabase a la clave del objeto. Vuelve
a verificar por su cuenta antes de tocar nada: no reescribe ninguna fila cuyo
fichero no esté confirmado en R2.

**Desde aquí la app sirve esos audios desde R2.** Abre una audioguía en el móvil
antes de continuar, incluida alguna que tuvieras descargada.

### 5. Comprobar

```bash
deno run -A scripts/migrar-audio-r2.ts comprobar-app --antes-de 3d
```

Un HEAD a la URL final de cada fila, más las dos cabeceras que fallan en
silencio: **CORS** (sin ella la app parece ir bien y lo único que se rompe es la
descarga sin conexión) y **Range** (sin ella iOS puede no reproducir).

### 6. Repetir con el resto

Los mismos cinco pasos sin `--antes-de`, para lo que quede.

---

## Y luego, esperar

**Entre cinco y siete días de uso normal.** Los ficheros siguen en Supabase, así
que mientras tanto la vuelta atrás cuesta treinta segundos:

```bash
deno run -A scripts/migrar-audio-r2.ts revertir --apply
```

## Solo al final: borrar

```bash
deno run -A scripts/migrar-audio-r2.ts borrar-supabase --apply --confirmar BORRAR
```

**Irreversible.** Vuelve a verificar cada objeto en R2 antes de borrar nada, y
si encuentra uno solo sin copia, no borra. Las imágenes WebP de las paradas no
se tocan: se quedan en Supabase.

Copia de seguridad opcional antes de este paso, si te quedas más tranquilo:
descarga el bucket con cualquier cliente S3 apuntando al endpoint S3 de Supabase
Storage, o simplemente espera unos días más.

---

## Informes

Cuando algo no cuadra, el script deja el detalle en un fichero en vez de
inundar la pantalla (todos están en `.gitignore`):

| Fichero | Qué contiene |
|---|---|
| `informe-huerfanos.txt` | Objetos que no referencia ninguna fila |
| `informe-perdidos.txt` | Filas cuyo MP3 ya no existe en el bucket |
| `informe-fallos-copia.txt` | Lo que no se pudo copiar |
| `informe-discrepancias.txt` | Tamaños que no coinciden entre origen y R2 |
| `informe-fallos-app.txt` | URLs que no responden 200 |
| `informe-sin-copia.txt` | Objetos sin copia en R2 al ir a borrar |
| `.migracion-r2.jsonl` | Registro de todo lo copiado |
