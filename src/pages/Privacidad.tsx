import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

// Página de privacidad. Existe porque desde la migración 051 se mide el
// tráfico, y medir a personas sin decirlo en ninguna parte no se hace.
//
// Es pública a propósito (no cuelga de ProtectedRoute): quien todavía no tiene
// cuenta también es medido en la pantalla de acceso y en las invitaciones.
//
// Si cambian los plazos de retención (migración 054), hay que cambiarlos aquí.

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-xl mb-2">{titulo}</h2>
      <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  )
}

export function PrivacidadPage() {
  return (
    <div className="min-h-dvh bg-background" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <Link to="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ChevronLeft size={14} aria-hidden="true" /> Volver
        </Link>

        <h1 className="font-serif text-3xl font-medium">Privacidad</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Qué se guarda de ti en Wanderlog, y qué no.
        </p>

        <Seccion titulo="Tus viajes son tuyos">
          <p>
            Lo que escribes —itinerarios, diario, gastos, documentos, fotos— se guarda
            para poder enseñártelo a ti y a las personas a las que tú se lo compartas.
            No se usa para nada más, no se vende y no se cede a terceros.
          </p>
          <p>
            Quien administra la plataforma puede ver, por motivos de mantenimiento,
            cuántos viajes tienes y la forma de tu itinerario (títulos, horas y sitios).
            <strong className="text-foreground"> No puede ver tu diario, ni tus notas, ni
            tus descripciones, ni tus documentos, ni tus fotos, ni tus importes</strong>:
            esos campos ni siquiera se envían al panel de administración.
          </p>
        </Seccion>

        <Seccion titulo="Medición de visitas">
          <p>
            Se registra qué páginas se visitan, para saber qué partes de Wanderlog se
            usan. Se guarda: la ruta (sin nada de lo que venga detrás de una
            interrogación), el país y la región, si entras desde móvil, ordenador o con
            la aplicación instalada, de qué web vienes, y cuánto tiempo estuvo la
            pantalla a la vista.
          </p>
          <p className="text-foreground">
            No se guarda tu dirección IP, ni entera ni recortada. Tampoco tu ciudad, ni
            tus coordenadas, ni tu navegador exacto.
          </p>
          <p>
            <strong className="text-foreground">No se usan cookies para esto.</strong> El
            identificador que agrupa tus pantallas en una visita vive solo en la memoria
            de la pestaña, no viaja en ninguna petición y desaparece al cerrarla. Por eso
            no verás ningún banner de cookies.
          </p>
          <p>
            No se usa Google Analytics ni ningún servicio de analítica de terceros: los
            datos no salen de la base de datos de Wanderlog.
          </p>
        </Seccion>

        <Seccion titulo="Uso de las funciones">
          <p>
            Se registra cuándo se usa cada función —crear un viaje, apuntar un gasto,
            generar una audioguía— para saber qué merece la pena mantener y para
            controlar el coste de las funciones con inteligencia artificial, que se pagan
            por uso. Se guarda el tipo de acción, nunca su contenido: que apuntaste un
            gasto en euros, no cuánto ni en qué.
          </p>
        </Seccion>

        <Seccion titulo="Cuánto tiempo">
          <ul className="list-disc pl-5 space-y-1">
            <li>Las visitas se borran solas a los <strong className="text-foreground">90 días</strong>.</li>
            <li>El uso de las funciones, al <strong className="text-foreground">año</strong>.</li>
            <li>Tus viajes se conservan mientras tengas la cuenta.</li>
          </ul>
          <p>
            Si borras tu cuenta, se elimina todo lo tuyo: viajes, documentos y ficheros.
            Las visitas no se borran, pero <strong className="text-foreground">se
            desvinculan de ti</strong>: dejan de estar asociadas a ninguna persona. El
            tráfico agregado del sitio no es un dato personal tuyo.
          </p>
        </Seccion>

        <Seccion titulo="Por qué se puede hacer esto">
          <p>
            La medición de visitas y de uso se ampara en el interés legítimo de mantener
            y mejorar el servicio, con datos agregados y sin identificadores
            persistentes. Puedes oponerte escribiendo al correo de abajo.
          </p>
          <p>
            Puedes pedir en cualquier momento acceso a tus datos, su corrección, su
            portabilidad o su borrado.
          </p>
        </Seccion>

        <Seccion titulo="Servicios que hacen falta">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Supabase</strong> — base de datos, acceso y almacenamiento de ficheros.</li>
            <li><strong className="text-foreground">Netlify</strong> — servir la web.</li>
            <li><strong className="text-foreground">Google</strong> — inicio de sesión, mapas y la voz de las audioguías.</li>
          </ul>
        </Seccion>

        <Seccion titulo="Contacto">
          <p>
            Para cualquier cosa de esta página:{' '}
            <a href="mailto:andermanci6@gmail.com"
              className="underline underline-offset-2 hover:text-foreground">
              andermanci6@gmail.com
            </a>
          </p>
        </Seccion>
      </div>
    </div>
  )
}
