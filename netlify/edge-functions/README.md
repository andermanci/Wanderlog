# Edge functions de Netlify

**Todo fichero `.ts` que esté aquí se empaqueta como una edge function.** No
solo los declarados en `netlify.toml`: Netlify descubre la carpeta entera, y un
módulo auxiliar sin `export default` rompe el despliegue —con un error que no
aparece en el build local, porque el build local no llega a empaquetarlas—.

Por eso el código compartido vive en `netlify/lib/`, y aquí solo hay handlers.
La lógica de verdad (parseo, geolocalización, agregados) está en
`src/lib/analytics/`, que sí se typechequea con `tsc -b` y se prueba con vitest.
