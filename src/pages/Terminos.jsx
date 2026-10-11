import { Link } from "react-router-dom";
import { LegalPage, Seccion, Dato } from "../components/Legal";

export default function Terminos() {
  return (
    <LegalPage titulo="Términos y condiciones" actualizado="11 de octubre de 2026">
      <Seccion titulo="1. Quiénes somos">
        <p>
          Padely es una plataforma operada por <Dato>[RAZÓN SOCIAL]</Dato>, CUIT <Dato>[CUIT]</Dato>, con
          domicilio en <Dato>[DOMICILIO]</Dato> (en adelante, "Padely"). Podés contactarnos en{" "}
          <Dato>[EMAIL DE CONTACTO]</Dato>.
        </p>
        <p>
          Al crear una cuenta o usar la aplicación aceptás estos Términos y condiciones y nuestra{" "}
          <Link to="/privacidad" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Política de privacidad
          </Link>
          . Si no estás de acuerdo, no uses el servicio.
        </p>
      </Seccion>

      <Seccion titulo="2. Objeto del servicio">
        <p>
          Padely es un servicio de intermediación entre jugadores, clubes y organizadores de torneos de pádel
          amateur. A través de la app los jugadores pueden buscar canchas y reservar turnos en los clubes
          adheridos, inscribirse a torneos y seguir sus resultados y su ranking; los clubes administran sus
          canchas, reservas y turnos fijos; y los organizadores gestionan inscripciones, grupos, cuadros y
          resultados.
        </p>
        <p>
          Padely no es parte de la reserva ni del torneo. La reserva es un acuerdo entre el jugador y el club;
          la inscripción, entre el jugador y el organizador. Padely no presta el servicio deportivo, no es
          propietaria de las canchas y no organiza los torneos.
        </p>
      </Seccion>

      <Seccion titulo="3. Cuentas y responsabilidades por rol">
        <p>
          Para usar la mayoría de las funciones necesitás una cuenta. Tenés que ser mayor de 18 años o contar con
          autorización de tu responsable legal, dar datos verdaderos y mantenerlos actualizados. La cuenta es
          personal: sos responsable de lo que se haga con ella y de mantener tu contraseña en secreto.
        </p>
        <p>
          <strong>Jugadores:</strong> sos responsable de asistir a las reservas que hacés, de respetar la política
          de cancelación de cada club, de inscribirte en la categoría que te corresponde y de los datos que cargás de
          tu pareja de juego.
        </p>
        <p>
          <strong>Clubes:</strong> sos responsable de la información publicada (canchas, horarios, precios,
          dirección), de cumplir las reservas confirmadas, de definir y comunicar tu política de cancelación y de
          la prestación del servicio en tus instalaciones.
        </p>
        <p>
          <strong>Organizadores:</strong> sos responsable del reglamento del torneo, de las categorías, de la
          admisión de las parejas, de los resultados que cargás y de resolver los reclamos de los jugadores.
        </p>
      </Seccion>

      <Seccion titulo="4. Reservas y cancelaciones">
        <p>
          Cada club fija su propia política de reservas y cancelaciones: si la reserva se confirma al instante o
          requiere aprobación, con cuánta anticipación se puede reservar y cuándo se puede cancelar. Esa política
          es la que rige la reserva. Una reserva pendiente de aprobación que el club no responde dentro del plazo
          vence y se cancela automáticamente.
        </p>
        <p>
          Por ahora Padely no cobra ni reembolsa: el precio mostrado es informativo y se abona directamente al
          club según lo que el club disponga. Cualquier reclamo por cobros o devoluciones debe hacerse ante el
          club.
        </p>
      </Seccion>

      <Seccion titulo="5. Torneos">
        <p>
          El organizador es responsable del reglamento del torneo, del fixture, de la carga de resultados y de la
          entrega de premios. Padely solo provee la herramienta para administrarlos y calcula los puntos y el
          ranking a partir de los resultados cargados.
        </p>
        <p>
          Los jugadores vinculados a una pareja pueden abrir reclamos (por ejemplo, por categoría incorrecta o
          conducta antideportiva) desde la app. Los reclamos los resuelve el organizador; Padely no interviene en
          la decisión. Los puntos se otorgan una sola vez por partido y la edición posterior de un resultado no
          los vuelve a otorgar.
        </p>
      </Seccion>

      <Seccion titulo="6. Conducta">
        <p>
          No está permitido usar la app para fines ilícitos, suplantar a otra persona, cargar datos falsos,
          hacer reservas o inscripciones sin intención de cumplirlas, acosar o discriminar a otros usuarios, ni
          intentar acceder a datos o funciones que no te corresponden. Podemos suspender o eliminar cuentas que
          incumplan estos términos.
        </p>
      </Seccion>

      <Seccion titulo="7. Limitación de responsabilidad">
        <p>
          Padely se ofrece "tal como está". Hacemos lo razonable para que el servicio funcione de manera continua
          y correcta, pero no garantizamos disponibilidad ininterrumpida ni ausencia de errores. En la medida
          permitida por la ley, Padely no responde por daños derivados del uso de la app, de la relación entre
          usuarios (reservas no cumplidas, cobros, lesiones, conflictos en un torneo), de la información cargada
          por clubes y organizadores ni de fallas de terceros proveedores.
        </p>
      </Seccion>

      <Seccion titulo="8. Modificaciones">
        <p>
          Podemos modificar estos términos y las funciones del servicio. Los cambios importantes se comunican
          en la app o por email y rigen desde la fecha indicada en "Última actualización". Si seguís usando
          Padely después de ese momento, aceptás los nuevos términos.
        </p>
      </Seccion>

      <Seccion titulo="9. Ley aplicable y jurisdicción">
        <p>
          Estos términos se rigen por las leyes de la República Argentina. Ante cualquier controversia, las partes
          se someten a los tribunales ordinarios de la ciudad de Santiago del Estero, con renuncia a cualquier
          otro fuero o jurisdicción, sin perjuicio de los derechos que te correspondan como consumidor.
        </p>
      </Seccion>
    </LegalPage>
  );
}
