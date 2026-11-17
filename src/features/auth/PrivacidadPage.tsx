import type { ReactNode } from 'react'
import { Card, Page, Section, Stack } from '@/design'

// Página de privacidad. Existe porque desde la migración 051 se mide el
// tráfico, y medir a personas sin decirlo en ninguna parte no se hace.
//
// Es pública a propósito (no cuelga de ProtectedRoute): quien todavía no tiene
// cuenta también es medido en la pantalla de acceso y en las invitaciones.
//
// Si cambian los plazos de retención (migración 054), hay que cambiarlos aquí.

function Apartado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Section title={titulo}>
      <Card className="space-y-3 text-[0.9375rem] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
        {children}
      </Card>
    </Section>
  )
}

export function PrivacidadPage() {
  return (
    <div className="min-h-dvh bg-background pt-safe">
      <Page
        width="narrow"
        back={{ to: '/dashboard', label: 'Volver a Wanderlog' }}
        title="Privacidad"
        subtitle="Qué se guarda de ti en Wanderlog, y qué no."
      >
        <Stack>
          <Apartado titulo="Tus viajes son tuyos">
            <p>
              Lo que escribes —itinerarios, diario, gastos, documentos, fotos— se guarda
              para poder enseñártelo a ti y a las personas a las que tú se lo compartas.
              No se usa para nada más, no se vende y no se cede a terceros.
            </p>
            <p>
              Quien administra la plataforma puede ver, por motivos de mantenimiento,
              cuántos viajes tienes y la forma de tu itinerario (títulos, horas y sitios).{' '}
              <strong>
                No puede ver tu diario, ni tus notas, ni tus descripciones, ni tus
                documentos, ni tus fotos, ni tus importes
              </strong>
              : esos campos ni siquiera se envían al panel de administración.
            </p>
          </Apartado>

          <Apartado titulo="Medición de visitas">
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
              <strong>No se usan cookies para esto.</strong> El identificador que agrupa
              tus pantallas en una visita vive solo en la memoria de la pestaña, no viaja
              en ninguna petición y desaparece al cerrarla. Por eso no verás ningún aviso
              de cookies.
            </p>
            <p>
              No se usa Google Analytics ni ningún servicio de analítica de terceros: los
              datos no salen de la base de datos de Wanderlog.
            </p>
          </Apartado>

          <Apartado titulo="Uso de las funciones">
            <p>
              Se registra cuándo se usa cada función —crear un viaje, apuntar un gasto,
              generar una audioguía— para saber qué merece la pena mantener y para
              controlar el coste de las funciones con inteligencia artificial, que se pagan
              por uso. Se guarda el tipo de acción, nunca su contenido: que apuntaste un
              gasto en euros, no cuánto ni en qué.
            </p>
          </Apartado>

          <Apartado titulo="Cuánto tiempo">
            <ul className="list-disc space-y-1 pl-5">
              <li>Las visitas se borran solas a los <strong>90 días</strong>.</li>
              <li>El uso de las funciones, al <strong>año</strong>.</li>
              <li>Tus viajes se conservan mientras tengas la cuenta.</li>
            </ul>
            <p>
              Si borras tu cuenta, se elimina todo lo tuyo: viajes, documentos y ficheros.
              Las visitas no se borran, pero <strong>se desvinculan de ti</strong>: dejan
              de estar asociadas a ninguna persona. El tráfico agregado del sitio no es un
              dato personal tuyo.
            </p>
          </Apartado>

          <Apartado titulo="Por qué se puede hacer esto">
            <p>
              La medición de visitas y de uso se ampara en el interés legítimo de mantener
              y mejorar el servicio, con datos agregados y sin identificadores
              persistentes. Puedes oponerte escribiendo al correo de abajo.
            </p>
            <p>
              Puedes pedir en cualquier momento acceso a tus datos, su corrección, su
              portabilidad o su borrado.
            </p>
          </Apartado>

          <Apartado titulo="Servicios que hacen falta">
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Supabase</strong> — base de datos, acceso y almacenamiento de ficheros.</li>
              <li><strong>Cloudflare R2</strong> — el audio de las audioguías, alojado en Europa.</li>
              <li><strong>Netlify</strong> — servir la web.</li>
              <li><strong>Google</strong> — inicio de sesión, mapas y la voz de las audioguías.</li>
            </ul>
          </Apartado>

          <Apartado titulo="Contacto">
            <p>
              Para cualquier cosa de esta página:{' '}
              <a
                href="mailto:andermanci6@gmail.com"
                className="font-medium text-accent-foreground underline underline-offset-4"
              >
                andermanci6@gmail.com
              </a>
            </p>
          </Apartado>
        </Stack>
      </Page>
    </div>
  )
}
