import { Link } from "react-router-dom";
import { LegalPage, Seccion, Dato } from "../components/Legal";

export default function Privacidad() {
  return (
    <LegalPage titulo="Política de privacidad" actualizado="11 de octubre de 2026">
      <Seccion titulo="1. Responsable de los datos">
        <p>
          El responsable del tratamiento de tus datos personales es <Dato>[RAZÓN SOCIAL]</Dato>, CUIT{" "}
          <Dato>[CUIT]</Dato>, con domicilio en <Dato>[DOMICILIO]</Dato>. Para cualquier consulta sobre
          privacidad escribinos a <Dato>[EMAIL DE CONTACTO]</Dato>.
        </p>
        <p>
          Esta política explica qué datos recopila Padely, para qué los usa, con quién los comparte y qué derechos
          tenés según la Ley 25.326 de Protección de los Datos Personales.
        </p>
      </Seccion>

      <Seccion titulo="2. Qué datos recopilamos">
        <p>
          <strong>Datos de tu cuenta:</strong> nombre, email, teléfono, ciudad y provincia, fecha de nacimiento,
          género, categoría de juego y foto de perfil (si la subís). Si ingresás con Google, recibimos tu nombre,
          tu email y tu foto de esa cuenta.
        </p>
        <p>
          <strong>Datos de uso:</strong> tus reservas (club, cancha, fecha y hora), tus inscripciones a torneos,
          los resultados de tus partidos, tus puntos y ranking, tus reclamos, tus reviews y tus clubes favoritos.
        </p>
        <p>
          <strong>Clubes y organizadores:</strong> nombre de la entidad, dirección, teléfono, WhatsApp, redes
          sociales, logo y la información de canchas, horarios, precios y torneos que publicás.
        </p>
      </Seccion>

      <Seccion titulo="3. Para qué usamos los datos">
        <p>
          Para que la app funcione: crear y mantener tu cuenta, gestionar reservas e inscripciones, calcular
          puntos y ranking, enviarte notificaciones sobre tus reservas, partidos y torneos, mostrar tu perfil a
          los clubes y organizadores con los que interactuás, atender consultas y reclamos, y mantener la seguridad
          del servicio. No vendemos tus datos ni los usamos para publicidad de terceros.
        </p>
      </Seccion>

      <Seccion titulo="4. Con quién se comparten">
        <p>
          Los clubes ven los datos de contacto de quienes reservan en sus canchas (nombre, email y teléfono) para
          poder gestionar la reserva. Los organizadores ven los datos de quienes se inscriben a sus torneos
          (nombre, email, WhatsApp y categoría) para administrar el torneo. Otros jugadores ven tu nombre, tu
          categoría y los resultados de los partidos en los que participaste.
        </p>
        <p>
          <strong>Proveedor de infraestructura:</strong> Padely funciona sobre Firebase, un servicio de Google LLC.
          Tus datos se almacenan y procesan en servidores de Google ubicados fuera de la República Argentina
          (principalmente en Estados Unidos), bajo las garantías de protección que Google ofrece para
          transferencias internacionales. Al usar Padely aceptás esa transferencia.
        </p>
        <p>
          Solo compartimos datos con autoridades cuando una ley o una orden judicial lo exige.
        </p>
      </Seccion>

      <Seccion titulo="5. Tus derechos (Ley 25.326)">
        <p>
          Tenés derecho a acceder a tus datos, a rectificarlos si son inexactos y a pedir su supresión. Podés
          ejercerlos gratuitamente a intervalos no inferiores a seis meses, salvo que acredites un interés
          legítimo, escribiendo a <Dato>[EMAIL DE CONTACTO]</Dato>. Desde tu perfil podés editar tus datos y
          eliminar tu cuenta en cualquier momento; al eliminarla se borran tu perfil y tus notificaciones, se
          desvincula tu nombre de las parejas de torneos y se cancelan tus reservas futuras.
        </p>
        <p>
          La Agencia de Acceso a la Información Pública (AAIP), órgano de control de la Ley 25.326, tiene la
          atribución de atender las denuncias y reclamos que se interpongan con relación al incumplimiento de las
          normas sobre protección de datos personales.
        </p>
      </Seccion>

      <Seccion titulo="6. Conservación y seguridad">
        <p>
          Conservamos tus datos mientras tengas la cuenta activa. Los resultados de torneos ya finalizados pueden
          permanecer en el historial del torneo de forma anonimizada una vez que eliminás tu cuenta. Aplicamos
          medidas técnicas razonables (acceso autenticado, reglas de seguridad por rol, conexiones cifradas) para
          proteger la información.
        </p>
      </Seccion>

      <Seccion titulo="7. Cookies y almacenamiento local">
        <p>
          Padely no usa cookies de publicidad. Guardamos en el almacenamiento local de tu navegador solo
          preferencias (por ejemplo, el modo claro u oscuro y si cerraste el aviso de instalación) y la sesión
          necesaria para mantenerte conectado. Si está activa la medición de uso con Google Analytics, Google
          puede guardar cookies estadísticas (por ejemplo, _ga) para contar visitas de forma agregada; no las
          usamos para identificarte ni para publicidad.
        </p>
      </Seccion>

      <Seccion titulo="8. Cambios y contacto">
        <p>
          Si cambiamos esta política lo avisamos en la app y actualizamos la fecha de "Última actualización".
          Para consultas sobre privacidad escribinos a <Dato>[EMAIL DE CONTACTO]</Dato>. También podés leer los{" "}
          <Link to="/terminos" className="font-semibold text-court hover:underline">
            Términos y condiciones
          </Link>
          .
        </p>
      </Seccion>
    </LegalPage>
  );
}
