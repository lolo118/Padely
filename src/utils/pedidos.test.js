// node --test src/utils/pedidos.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ITEMS,
  generarToken,
  haceCuanto,
  pedidoDesdeCarrito,
  puedePedir,
  reservaEnJuego,
  resumenItems,
  subtotalPedido,
  transicionValida,
} from "./pedidos.js";

const fecha = "2026-10-22";
const r = (horaInicio, horaFin, extra = {}) => ({ id: `k1_${fecha}_${horaInicio.replace(":", "")}`, canchaId: "k1", canchaName: "Cancha 1", fecha, horaInicio, horaFin, status: "confirmada", ...extra });

test("transiciones", () => {
  assert.equal(transicionValida("pendiente", "aceptado"), true);
  assert.equal(transicionValida("pendiente", "rechazado"), true);
  assert.equal(transicionValida("pendiente", "cancelado"), true);
  assert.equal(transicionValida("aceptado", "listo"), true);
  assert.equal(transicionValida("listo", "entregado"), true);
  assert.equal(transicionValida("pendiente", "listo"), false);
  assert.equal(transicionValida("entregado", "listo"), false);
  assert.equal(transicionValida("rechazado", "aceptado"), false);
});

test("se puede pedir desde 15 min antes hasta el final, solo hoy y confirmada", () => {
  const res = r("20:00", "22:00");
  assert.equal(puedePedir(res, new Date(2026, 9, 22, 19, 45)), true);
  assert.equal(puedePedir(res, new Date(2026, 9, 22, 19, 44)), false);
  assert.equal(puedePedir(res, new Date(2026, 9, 22, 22, 0)), true);
  assert.equal(puedePedir(res, new Date(2026, 9, 22, 22, 1)), false);
  assert.equal(puedePedir({ ...res, status: "pendiente" }, new Date(2026, 9, 22, 20, 30)), false);
  assert.equal(puedePedir({ ...res, fecha: "2026-10-21" }, new Date(2026, 9, 22, 20, 30)), false);
  assert.equal(puedePedir(null, new Date()), false);
});

test("reserva en juego en la cancha: ventana ±15 y preferencia por la que ya empezó", () => {
  const lista = [r("18:00", "19:00"), r("19:00", "20:00"), r("20:00", "22:00", { canchaId: "k2" }), r("21:00", "22:00", { status: "cancelada" })];
  assert.equal(reservaEnJuego(lista, "k1", new Date(2026, 9, 22, 18, 30)).horaInicio, "18:00");
  // 19:05: la de 18 terminó hace 5 (en margen) y la de 19 ya empezó → gana la de 19
  assert.equal(reservaEnJuego(lista, "k1", new Date(2026, 9, 22, 19, 5)).horaInicio, "19:00");
  // 18:50: la de 19 todavía no empezó (está en su margen previo), la de 18 sigue → gana la de 18
  assert.equal(reservaEnJuego(lista, "k1", new Date(2026, 9, 22, 18, 50)).horaInicio, "18:00");
  assert.equal(reservaEnJuego(lista, "k1", new Date(2026, 9, 22, 20, 30)), null);
  assert.equal(reservaEnJuego(lista, "k2", new Date(2026, 9, 22, 20, 30)).canchaId, "k2");
  assert.equal(reservaEnJuego(lista, "k1", new Date(2026, 9, 22, 21, 30)), null); // la cancelada no cuenta
});

test("subtotal, resumen y pedido desde el carrito", () => {
  const carrito = [
    { productoId: "a", nombre: "Agua", precio: 1040, cantidad: 2, controlaStock: true },
    { productoId: "c", nombre: "Cerveza", precio: 3020, cantidad: 1, controlaStock: false },
    { productoId: "x", nombre: "Nada", precio: 100, cantidad: 0 },
  ];
  assert.equal(subtotalPedido(carrito), 5100);
  assert.equal(resumenItems(carrito.slice(0, 2)), "2 Agua, 1 Cerveza");
  const p = pedidoDesdeCarrito({ reserva: r("20:00", "22:00", { grupoId: "g1" }), carrito, nota: "  sin hielo ", uid: "u1", nombre: " Mesa 1 ", origen: "qr", anonimo: true, qrToken: "abc" });
  assert.equal(p.items.length, 2);
  assert.equal(p.items[1].controlaStock, false);
  assert.equal(p.cuentaId, "g1");
  assert.equal(p.reservaGrupoId, "g1");
  assert.equal(p.subtotal, 5100);
  assert.equal(p.nota, "sin hielo");
  assert.equal(p.nombre, "Mesa 1");
  assert.equal(p.origen, "qr");
  assert.equal(p.qrToken, "abc");
  assert.equal(p.estado, "pendiente");
  const c = pedidoDesdeCarrito({ reserva: r("20:00", "22:00"), carrito, uid: "u1", nombre: "Gómez" });
  assert.equal(c.origen, "celular");
  assert.equal("qrToken" in c, false);
  assert.equal(c.anonimo, false);
  const muchos = pedidoDesdeCarrito({ reserva: r("20:00", "22:00"), carrito: Array.from({ length: 30 }, (_, i) => ({ productoId: `p${i}`, nombre: "x", precio: 1, cantidad: 1 })), uid: "u", nombre: "n" });
  assert.equal(muchos.items.length, MAX_ITEMS);
});

test("hace cuánto y token", () => {
  const ahora = new Date(2026, 9, 22, 20, 0);
  assert.equal(haceCuanto(new Date(2026, 9, 22, 19, 59, 40), ahora), "recién");
  assert.equal(haceCuanto(new Date(2026, 9, 22, 19, 57), ahora), "hace 3 min");
  assert.equal(haceCuanto(new Date(2026, 9, 22, 18, 55), ahora), "hace 1 h 05");
  assert.equal(haceCuanto({ toDate: () => new Date(2026, 9, 22, 18, 0) }, ahora), "hace 2 h");
  assert.equal(haceCuanto(null, ahora), "");
  const t = generarToken(10, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(t, "abcdefghjk");
  assert.match(generarToken(), /^[a-z0-9]{10}$/);
  assert.notEqual(generarToken(), generarToken());
});
