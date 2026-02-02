"use client";

import Link from "next/link";

const sections = [
  { id: "pos", title: "Punto de Venta (POS)" },
  { id: "ventas", title: "Ventas" },
  { id: "clientes", title: "Clientes (cuentas corrientes)" },
  { id: "reportes", title: "Reportes" },
  { id: "productos", title: "Productos" },
  { id: "ml", title: "Mercado Libre (ML)" }
];

export default function GuiaPage() {
  return (
    <main className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Guía del sistema STONE
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cómo usar cada módulo y realizar las operaciones correctamente.
          </p>
        </header>

        <nav className="mb-10 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            En esta guía
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {sections.map(({ id, title }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800 transition hover:bg-teal-100"
                >
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-10">
          <section id="pos" className="scroll-mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Punto de Venta (POS)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Desde el <Link href="/pos" className="font-medium text-teal-600 hover:underline">POS</Link> se realizan las ventas del día: agregar productos, elegir cliente, forma de pago y cobrar.
            </p>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-slate-700">
              <li><strong>Agregar productos:</strong> Escribí nombre o código de barras en la búsqueda. Si varios productos comparten el mismo código (misma prenda, distinto talle/color), se listan todos con Marca, Talle y Color para que elijas el correcto. También podés escanear el código: si hay uno solo se agrega; si hay varios, se muestra la lista para elegir.</li>
              <li><strong>Tu venta:</strong> En la tabla ves los ítems, cantidad, precio y total. Podés cambiar la cantidad o quitar un producto.</li>
              <li><strong>Cliente (opcional):</strong> Si el cliente tiene cuenta corriente, buscá por nombre o teléfono y seleccioná. Así la venta queda asociada y podés usar saldo a favor o generar deuda.</li>
              <li><strong>Forma de pago:</strong> Efectivo, Transferencia, Débito o Crédito. Define cómo se registra el ingreso en caja.</li>
              <li><strong>Ajustes:</strong> Podés aplicar un <strong>descuento</strong> (porcentaje o monto fijo) o un <strong>recargo</strong>. Elegí el tipo (Descuento/Recargo), el modo (Porcentaje o Monto) y el valor. El total a cobrar se actualiza.</li>
              <li><strong>Cobrar:</strong> El sistema valida que el monto a cobrar coincida con lo esperado. Si hay cliente con saldo a favor, se descuenta del total. Confirmá con el botón &quot;Cobrar&quot; para registrar la venta y los movimientos de stock y caja.</li>
            </ul>
          </section>

          <section id="ventas" className="scroll-mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Ventas</h2>
            <p className="mt-1 text-sm text-slate-600">
              En <Link href="/sales" className="font-medium text-teal-600 hover:underline">Ventas</Link> ves el listado de ventas realizadas. Entrá a una venta para ver el detalle (productos, montos, cliente, forma de pago).
            </p>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-slate-700">
              <li><strong>Anular una venta:</strong> En el detalle de la venta hay un botón &quot;Anular venta&quot;. Al anular, el sistema revierte el stock (vuelve a sumar los productos), revierte el movimiento de caja (sale el dinero) y, si había cliente, revierte el uso de crédito o la deuda generada. La venta queda marcada como &quot;Anulada&quot; y ya no se puede deshacer desde la interfaz.</li>
            </ul>
          </section>

          <section id="clientes" className="scroll-mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Clientes (cuentas corrientes)</h2>
            <p className="mt-1 text-sm text-slate-600">
              En <Link href="/accounts" className="font-medium text-teal-600 hover:underline">Clientes</Link> se gestionan las cuentas corrientes: deudas, pagos y saldos a favor.
            </p>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-slate-700">
              <li><strong>Crear cliente:</strong> Desde &quot;Nuevo cliente&quot; cargá nombre y teléfono. Al guardar se crea la cuenta (sin deuda ni crédito inicial).</li>
              <li><strong>Ficha del cliente:</strong> Al entrar a un cliente ves el saldo (deuda o crédito a favor), la tabla de <strong>deudas pendientes de pago</strong> y la de <strong>pagos y saldos entregados</strong>. Cada movimiento tiene tipo (Deuda, Pago, Crédito consumido, etc.) y monto.</li>
              <li><strong>Registrar pago:</strong> Usá &quot;Registrar pago&quot; para cargar un pago del cliente (efectivo, transferencia, etc.). El monto entra a caja y reduce la deuda. Si el pago fue mayor que la deuda, el excedente queda como saldo a favor (crédito) para futuras compras.</li>
              <li><strong>Anular pago:</strong> En la tabla &quot;Pagos y saldos entregados&quot;, al lado de un movimiento de tipo Pago hay un botón &quot;Anular&quot;. Al anular, se restablece la deuda y se saca el monto de caja.</li>
              <li><strong>Agregar deuda manual:</strong> Si querés cargar una deuda que no viene de una venta (ej. un préstamo o acuerdo), usá la sección &quot;Agregar deuda&quot; con monto y nota opcional. No afecta la caja.</li>
            </ul>
          </section>

          <section id="reportes" className="scroll-mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Reportes</h2>
            <p className="mt-1 text-sm text-slate-600">
              En <Link href="/reports" className="font-medium text-teal-600 hover:underline">Reportes</Link> ves el resumen de caja por día. Elegí la fecha y el sistema muestra:
            </p>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-slate-700">
              <li><strong>Efectivo en caja:</strong> Neto del día en efectivo (entradas menos salidas en efectivo). Es lo que debería haber en la caja física.</li>
              <li><strong>Ingresos por transferencia:</strong> Total cobrado por transferencia ese día.</li>
              <li><strong>Ingresos por débito / crédito:</strong> Total cobrado con tarjeta (débito/crédito u otro).</li>
              <li><strong>Egresos totales del día:</strong> Suma de todas las salidas de caja (devoluciones, anulaciones, pagos revertidos, etc.).</li>
              <li><strong>Desglose por origen:</strong> Tabla que muestra de dónde vienen los ingresos (Ventas, Pagos de deudas, Diferencia cambios) y cuánto en efectivo y cuánto en otros métodos.</li>
              <li><strong>Movimientos del día:</strong> Listado detallado de cada movimiento de caja (hora, origen, método, entrada/salida, monto) para auditoría.</li>
            </ul>
          </section>

          <section id="productos" className="scroll-mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Productos</h2>
            <p className="mt-1 text-sm text-slate-600">
              En <Link href="/products" className="font-medium text-teal-600 hover:underline">Productos</Link> se mantiene el catálogo y el stock.
            </p>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-slate-700">
              <li><strong>Cómo agregar productos:</strong> Usá &quot;Nuevo producto&quot;. Completá nombre, SKU (único), código de barras, precio y opcionalmente costo, talle, color y marca. Si cargás stock inicial, se registra un movimiento de tipo &quot;Inicial&quot;. Cada producto tiene su propio stock.</li>
              <li><strong>Por qué un producto por talle y color:</strong> Para que el stock y la integración con Mercado Libre sean correctos, cada combinación vendible (ej. Remera S Negra, Remera L Blanca) debe ser un producto distinto. Así el stock se descuenta por variante y no hay ambigüedad. El código de barras puede repetirse en todos los de la misma &quot;familia&quot;; al buscar o escanear en el POS se listan todos y elegís por talle y color.</li>
              <li><strong>Editar y stock:</strong> Desde la ficha del producto podés editar datos y ver el historial de movimientos de stock (entradas, salidas, ventas, ajustes).</li>
            </ul>
          </section>

          <section id="ml" className="scroll-mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Mercado Libre (ML)</h2>
            <p className="mt-1 text-sm text-slate-600">
              En <Link href="/integrations/mercadolibre" className="font-medium text-teal-600 hover:underline">Integraciones → Mercado Libre</Link> se vinculan los productos de STONE con las publicaciones de Mercado Libre.
            </p>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-slate-700">
              <li><strong>Para qué sirve el vínculo:</strong> Cada producto en STONE (una variante: talle + color) se asocia a un ítem y variación en ML. Así, cuando se vende en ML se puede descontar el stock acá, y cuando se vende acá se puede actualizar o avisar en ML que no hay stock.</li>
              <li><strong>Cómo vincular:</strong> Elegí un producto de la lista, cargá el <strong>ID del ítem</strong> de Mercado Libre y el <strong>ID de la variación</strong> (talle/color en esa publicación). Guardá el vínculo. Podés ver la lista de productos ya vinculados y eliminar vínculos si cambiaste la publicación en ML.</li>
              <li><strong>Requisitos:</strong> Haber configurado la conexión con la API de Mercado Libre (credenciales y permisos). Sin vínculos, el stock y las ventas de ML no se sincronizan con STONE.</li>
            </ul>
          </section>
        </div>

        <p className="mt-10 text-center text-sm text-slate-500">
          ¿Dudas? Revisá cada módulo desde el <Link href="/" className="font-medium text-teal-600 hover:underline">Panel</Link>.
        </p>
      </div>
    </main>
  );
}
