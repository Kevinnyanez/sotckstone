"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { createExchange, type CreateExchangeInput } from "../../lib/pos";

type Product = {
  id: string;
  name: string;
  barcode: string;
  price: number;
  sku?: string | null;
  color?: string | null;
  size?: string | null;
};

type ExchangeItemUI = {
  productId: string;
  name: string;
  barcode: string;
  unitPrice: number;
  qty: number;
};

export default function ExchangePage() {
  const supabase = getSupabaseClient();
  const [barcodeIn, setBarcodeIn] = useState("");
  const [barcodeOut, setBarcodeOut] = useState("");
  const [itemsIn, setItemsIn] = useState<ExchangeItemUI[]>([]);
  const [itemsOut, setItemsOut] = useState<ExchangeItemUI[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [selectedCustomerName, setSelectedCustomerName] = useState<string | undefined>();
  const [customerResults, setCustomerResults] = useState<
    { id: string; full_name: string; phone: string | null }[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [productPicker, setProductPicker] = useState<{
    products: Product[];
    mode: "in" | "out";
  } | null>(null);

  const totalItemsIn = useMemo(() => itemsIn.length, [itemsIn]);
  const totalItemsOut = useMemo(() => itemsOut.length, [itemsOut]);
  const hasItems = itemsIn.length > 0 || itemsOut.length > 0;
  const totalIn = useMemo(
    () => itemsIn.reduce((acc, item) => acc + item.qty * item.unitPrice, 0),
    [itemsIn]
  );
  const totalOut = useMemo(
    () => itemsOut.reduce((acc, item) => acc + item.qty * item.unitPrice, 0),
    [itemsOut]
  );
  const differenceAmount = useMemo(() => totalOut - totalIn, [totalOut, totalIn]);
  const diffClass =
    differenceAmount === 0
      ? "text-slate-600"
      : differenceAmount > 0
        ? "text-teal-600"
        : "text-rose-600";
  const requiresCustomer = differenceAmount < 0;
  const messageTone = message
    ? message.startsWith("Error")
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-teal-200 bg-teal-50 text-teal-800"
    : "";

  /** Busca productos por código de barra, SKU, nombre, color o talle. Devuelve todos los que coincidan. */
  async function searchProducts(query: string): Promise<Product[]> {
    const q = query.trim();
    if (!q) return [];
    const term = `%${q}%`;
    const { data, error } = await supabase
      .from("products")
      .select("id, name, barcode, price, sku, color, size")
      .or(`barcode.ilike.${term},sku.ilike.${term},name.ilike.${term},color.ilike.${term},size.ilike.${term}`)
      .limit(50);
    if (error) throw error;
    return (data ?? []) as Product[];
  }

  function addProductToIn(product: Product) {
    setItemsIn((prev) => addItem(prev, product));
    setBarcodeIn("");
    setProductPicker(null);
  }

  function addProductToOut(product: Product) {
    setItemsOut((prev) => addItem(prev, product));
    setBarcodeOut("");
    setProductPicker(null);
  }

  async function addIn() {
    setMessage(null);
    if (!barcodeIn.trim()) return;
    try {
      const products = await searchProducts(barcodeIn);
      if (products.length === 0) {
        setMessage("Producto no encontrado");
        return;
      }
      if (products.length === 1) {
        addProductToIn(products[0]);
        return;
      }
      setProductPicker({ products, mode: "in" });
    } catch {
      setMessage("Error al buscar producto");
    }
  }

  async function addOut() {
    setMessage(null);
    if (!barcodeOut.trim()) return;
    try {
      const products = await searchProducts(barcodeOut);
      if (products.length === 0) {
        setMessage("Producto no encontrado");
        return;
      }
      if (products.length === 1) {
        addProductToOut(products[0]);
        return;
      }
      setProductPicker({ products, mode: "out" });
    } catch {
      setMessage("Error al buscar producto");
    }
  }

  function addItem(list: ExchangeItemUI[], product: Product) {
    const existing = list.find((p) => p.productId === product.id);
    if (existing) {
      return list.map((p) =>
        p.productId === product.id ? { ...p, qty: p.qty + 1 } : p
      );
    }
    return [
      ...list,
      {
        productId: product.id,
        name: product.name,
        barcode: product.barcode,
        unitPrice: product.price,
        qty: 1
      }
    ];
  }

  function updateQty(
    list: ExchangeItemUI[],
    setList: (items: ExchangeItemUI[]) => void,
    productId: string,
    qty: number
  ) {
    setList(
      list.map((p) => (p.productId === productId ? { ...p, qty } : p))
    );
  }

  function removeItem(
    list: ExchangeItemUI[],
    setList: (items: ExchangeItemUI[]) => void,
    productId: string
  ) {
    setList(list.filter((p) => p.productId !== productId));
  }

  async function fetchCustomersByQuery(query: string) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, full_name, phone")
      .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(10);
    if (error) {
      setMessage("Error al buscar clientes");
      return;
    }
    setCustomerResults(data ?? []);
  }

  useEffect(() => {
    if (!customerQuery.trim() || customerQuery.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(() => {
      void fetchCustomersByQuery(customerQuery.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [customerQuery]);

  function confirmExchange() {
    setMessage(null);
    if (requiresCustomer && !customerId) {
      setMessage("Seleccione un cliente para saldo a favor.");
      return;
    }
    startTransition(async () => {
      const payload: CreateExchangeInput = {
        customerId,
        itemsIn: itemsIn.map((i) => ({ productId: i.productId, qty: i.qty })),
        itemsOut: itemsOut.map((i) => ({ productId: i.productId, qty: i.qty })),
        differenceAmount
      };
      const result = await createExchange(payload);
      if (!result.ok) {
        setMessage(`Error: ${result.error.message}`);
        return;
      }
      setItemsIn([]);
      setItemsOut([]);
      setCustomerQuery("");
      setCustomerId(undefined);
      setSelectedCustomerName(undefined);
      setCustomerResults([]);
      setMessage(`Cambio registrado (#${result.data.exchangeId})`);
    });
  }

  return (
    <main className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Cambios de prenda
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Entradas y salidas. Buscá por código de barras, SKU, nombre, color o talle.
          </p>
        </header>

        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Prendas que entran</h2>
              <span className="text-sm text-slate-500">{totalItemsIn} items</span>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={barcodeIn}
                onChange={(e) => setBarcodeIn(e.target.value)}
                placeholder="Código, SKU, nombre, color o talle"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <button
                onClick={addIn}
                disabled={isPending}
                className="h-11 w-full rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
              >
                {isPending ? "Agregando..." : "Agregar"}
              </button>
            </div>
            {itemsIn.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No hay productos.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {itemsIn.map((item) => (
                  <li
                    key={item.productId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.barcode}</div>
                      <div className="text-xs text-slate-500">
                        ${item.unitPrice.toFixed(2)} c/u
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(e) =>
                          updateQty(
                            itemsIn,
                            setItemsIn,
                            item.productId,
                            Number(e.target.value)
                          )
                        }
                        className="h-9 w-20 rounded-md border border-slate-300 px-2 text-center focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      />
                      <div className="text-xs font-semibold text-slate-700">
                        ${(item.qty * item.unitPrice).toFixed(2)}
                      </div>
                      <button
                        onClick={() => removeItem(itemsIn, setItemsIn, item.productId)}
                        className="text-sm font-semibold text-rose-600 hover:text-rose-700"
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Prendas que salen</h2>
              <span className="text-sm text-slate-500">{totalItemsOut} items</span>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={barcodeOut}
                onChange={(e) => setBarcodeOut(e.target.value)}
                placeholder="Código, SKU, nombre, color o talle"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <button
                onClick={addOut}
                disabled={isPending}
                className="h-11 w-full rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
              >
                {isPending ? "Agregando..." : "Agregar"}
              </button>
            </div>
            {itemsOut.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No hay productos.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {itemsOut.map((item) => (
                  <li
                    key={item.productId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.barcode}</div>
                      <div className="text-xs text-slate-500">
                        ${item.unitPrice.toFixed(2)} c/u
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(e) =>
                          updateQty(
                            itemsOut,
                            setItemsOut,
                            item.productId,
                            Number(e.target.value)
                          )
                        }
                        className="h-9 w-20 rounded-md border border-slate-300 px-2 text-center focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      />
                      <div className="text-xs font-semibold text-slate-700">
                        ${(item.qty * item.unitPrice).toFixed(2)}
                      </div>
                      <button
                        onClick={() => removeItem(itemsOut, setItemsOut, item.productId)}
                        className="text-sm font-semibold text-rose-600 hover:text-rose-700"
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Diferencia</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Calculado automáticamente según los totales.
              </p>
            </div>
            <div className={`text-2xl font-semibold ${diffClass}`}>
              ${differenceAmount.toFixed(2)}
            </div>
          </div>
          <p className="mt-4 text-sm">
            <span className={`text-base font-semibold ${diffClass}`}>
              {differenceAmount > 0
                ? "Cliente paga"
                : differenceAmount < 0
                  ? "Saldo a favor"
                  : "Sin diferencia"}
            </span>
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 text-sm text-slate-600">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span>Total entra</span>
              <span>${totalIn.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span>Total sale</span>
              <span>${totalOut.toFixed(2)}</span>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-slate-900">Cliente</h2>
          <p className="mt-1 text-sm text-slate-500">
            Escribí nombre o teléfono; obligatorio si hay saldo a favor.
          </p>
          <input
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            placeholder="Nombre o teléfono"
            className="mt-3 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
          {customerResults.length > 0 && !customerId && (
            <ul className="mt-2 space-y-1 rounded-lg border border-slate-100 bg-slate-50/50">
              {customerResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerId(c.id);
                      setSelectedCustomerName(c.full_name);
                      setCustomerQuery("");
                      setCustomerResults([]);
                    }}
                    className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-teal-50 hover:text-slate-900"
                  >
                    {c.full_name} {c.phone ? ` · ${c.phone}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {customerId && selectedCustomerName && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5">
              <span className="text-sm font-medium text-slate-800">
                <span className="font-semibold text-teal-800">{selectedCustomerName}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setCustomerId(undefined);
                  setSelectedCustomerName(undefined);
                }}
                className="rounded px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/60"
              >
                Quitar
              </button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <button
            type="button"
            onClick={confirmExchange}
            disabled={isPending || !hasItems}
            className="h-11 w-full rounded-xl bg-teal-600 py-3 text-base font-bold text-white shadow-md transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
          >
            {isPending ? "Procesando..." : "Confirmar cambio"}
          </button>
          {!hasItems && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Agregue al menos un producto para continuar.
            </p>
          )}
          {requiresCustomer && !customerId && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Seleccione un cliente para saldo a favor.
            </p>
          )}
          {message && (
            <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${messageTone}`}>
              {message}
            </p>
          )}
        </section>

        {productPicker && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
            onClick={() => setProductPicker(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-picker-title"
          >
            <div
              className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h2 id="product-picker-title" className="text-base font-semibold text-slate-900">
                  Varios productos con ese criterio
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Elegí el artículo que querés {productPicker.mode === "in" ? "agregar a entradas" : "agregar a salidas"}.
                </p>
              </div>
              <ul className="max-h-[60vh] overflow-y-auto p-2">
                {productPicker.products.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() =>
                        productPicker.mode === "in"
                          ? addProductToIn(p)
                          : addProductToOut(p)
                      }
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-3 text-left transition hover:bg-teal-50 hover:border-teal-200"
                    >
                      <div>
                        <div className="font-medium text-slate-900">{p.name}</div>
                        <div className="flex flex-wrap gap-x-2 gap-y-0 text-xs text-slate-500">
                          {p.barcode && <span>Cód: {p.barcode}</span>}
                          {p.sku && <span>SKU: {p.sku}</span>}
                          {p.color && <span>{p.color}</span>}
                          {p.size && <span>Talle: {p.size}</span>}
                        </div>
                        <div className="text-xs font-semibold text-slate-600">
                          ${p.price.toFixed(2)} c/u
                        </div>
                      </div>
                      <span className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">
                        Traer este
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2">
                <button
                  type="button"
                  onClick={() => setProductPicker(null)}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
