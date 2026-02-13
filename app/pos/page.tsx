"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import { createSale, getCustomerBalance, type CreateSaleInput } from "../../lib/pos";

type Product = {
  id: string;
  name: string;
  barcode: string;
  price: number | null;
  color?: string | null;
  size?: string | null;
  brand?: string | null;
  stock?: number;
};

type SaleItemUI = {
  productId: string;
  name: string;
  barcode: string;
  unitPrice: number;
  qty: number;
};

const paymentMethods = [
  { label: "EFECTIVO", value: "CASH" as const },
  { label: "TRANSFERENCIA", value: "TRANSFER" as const },
  { label: "DEBITO", value: "CARD" as const },
  { label: "CREDITO", value: "OTHER" as const }
];

type AdjustmentType = "NONE" | "DISCOUNT" | "SURCHARGE";
type AdjustmentMode = "PERCENT" | "AMOUNT";

function formatARS(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2
  }).format(value);
}

export default function PosPage() {
  const supabase = getSupabaseClient();
  const [barcode, setBarcode] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [items, setItems] = useState<SaleItemUI[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<CreateSaleInput["paymentMethod"]>("CASH");
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [adjustmentType, setAdjustmentType] =
    useState<AdjustmentType>("NONE");
  const [adjustmentMode, setAdjustmentMode] =
    useState<AdjustmentMode>("PERCENT");
  const [adjustmentValue, setAdjustmentValue] = useState<string>("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [selectedCustomerName, setSelectedCustomerName] = useState<string | undefined>();
  const [customerResults, setCustomerResults] = useState<
    { id: string; full_name: string; phone: string | null }[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [customerCredit, setCustomerCredit] = useState<number>(0);
  const [debtNote, setDebtNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const baseTotal = useMemo(
    () => items.reduce((acc, item) => acc + item.qty * item.unitPrice, 0),
    [items]
  );
  const adjustmentAmount = useMemo(() => {
    if (adjustmentType === "NONE") return 0;
    const parsed = Number(adjustmentValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    const raw =
      adjustmentMode === "PERCENT" ? (baseTotal * parsed) / 100 : parsed;
    return adjustmentType === "DISCOUNT" ? -raw : raw;
  }, [adjustmentMode, adjustmentType, adjustmentValue, baseTotal]);
  const finalTotal = useMemo(() => baseTotal + adjustmentAmount, [baseTotal, adjustmentAmount]);
  const hasInvalidAdjustment =
    adjustmentType !== "NONE" &&
    (!Number.isFinite(Number(adjustmentValue)) ||
      Number(adjustmentValue) <= 0 ||
      finalTotal < 0);
  const totalForValidation = hasInvalidAdjustment ? baseTotal : finalTotal;
  const totalToPayInCash = useMemo(
    () => Math.max(0, Number((totalForValidation - customerCredit).toFixed(2))),
    [totalForValidation, customerCredit]
  );
  const hasItems = items.length > 0;
  const hasPartialWithoutCustomer =
    paidAmount < totalToPayInCash && paidAmount > 0 && !customerId;
  const hasPaidGreaterThanTotal = paidAmount > totalToPayInCash;
  const hasFiado = Boolean(customerId && totalToPayInCash > 0 && paidAmount < totalToPayInCash);
  const canConfirm =
    hasItems &&
    !hasPartialWithoutCustomer &&
    !hasPaidGreaterThanTotal &&
    !hasInvalidAdjustment;
  const messageTone = message
    ? message.startsWith("Error")
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "";

  useEffect(() => {
    void loadCatalog();
  }, []);

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

  useEffect(() => {
    if (!customerId) {
      setCustomerCredit(0);
      return;
    }
    let cancelled = false;
    void getCustomerBalance(customerId).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data.balance < 0) {
        setCustomerCredit(-res.data.balance);
      } else {
        setCustomerCredit(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  async function loadCatalog() {
    setIsCatalogLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id, name, barcode, price, color, size, brand")
      .order("name", { ascending: true });
    if (error) {
      setIsCatalogLoading(false);
      return;
    }

    const products = (data ?? []) as Product[];
    if (products.length === 0) {
      setCatalog([]);
      setIsCatalogLoading(false);
      return;
    }

    const ids = products.map((p) => p.id);
    const { data: stockRows } = await supabase
      .from("v_stock_current")
      .select("product_id, stock")
      .in("product_id", ids);

    const stockMap = new Map<string, number>();
    for (const row of (stockRows ?? []) as { product_id: string; stock: number | null }[]) {
      stockMap.set(row.product_id, Number(row.stock ?? 0));
    }

    const withStock = products.map((p) => ({
      ...p,
      stock: stockMap.get(p.id) ?? 0
    }));
    setCatalog(withStock);
    setIsCatalogLoading(false);
  }

  async function searchProduct() {
    setMessage(null);
    if (!barcode.trim()) return;
    const { data, error } = await supabase
      .from("products")
      .select("id, name, barcode, price, color, size, brand")
      .eq("barcode", barcode.trim());
    if (error) {
      setMessage("Error al buscar producto");
      return;
    }
    const matches = (data ?? []) as Product[];
    if (matches.length === 0) {
      setMessage("Producto no encontrado");
      return;
    }
    if (matches.length === 1) {
      addItem(matches[0]);
      setBarcode("");
      return;
    }
    setProductQuery(barcode.trim());
    setBarcode("");
  }

  function addItem(product: Product) {
    setItems((prev) => {
      const existing = prev.find((p) => p.productId === product.id);
      if (existing) {
        return prev.map((p) =>
          p.productId === product.id ? { ...p, qty: p.qty + 1 } : p
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          barcode: product.barcode,
          unitPrice: Number(product.price ?? 0),
          qty: 1
        }
      ];
    });
  }

  function updateQty(productId: string, qty: number) {
    setItems((prev) =>
      prev.map((p) => (p.productId === productId ? { ...p, qty } : p))
    );
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((p) => p.productId !== productId));
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

  function setPaidToTotal() {
    setPaidAmount(totalToPayInCash);
  }

  function confirmSale() {
    setMessage(null);
    startTransition(async () => {
      const totalToUse = Number(totalForValidation.toFixed(2));
      const adjustmentLabel =
        adjustmentType === "NONE"
          ? ""
          : `${adjustmentType === "DISCOUNT" ? "Descuento" : "Recargo"} ${
              adjustmentMode === "PERCENT"
                ? `${adjustmentValue}%`
                : formatARS(Number(adjustmentValue))
            }`;
      const paymentLabel =
        paymentMethods.find((m) => m.value === paymentMethod)?.label ??
        "N/D";
      const notes = [paymentLabel ? `Metodo: ${paymentLabel}` : "", adjustmentLabel]
        .filter(Boolean)
        .join(" | ");

      let payloadItems = items.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        unitPrice: i.unitPrice
      }));

      if (baseTotal > 0 && adjustmentAmount !== 0) {
        const factor = totalToUse / baseTotal;
        let accumulated = 0;
        payloadItems = payloadItems.map((item, index) => {
          if (index === payloadItems.length - 1) {
            const remaining = totalToUse - accumulated;
            const lastUnit = remaining / item.qty;
            return { ...item, unitPrice: Number(lastUnit.toFixed(2)) };
          }
          const newUnit = Number((item.unitPrice * factor).toFixed(2));
          accumulated += newUnit * item.qty;
          return { ...item, unitPrice: newUnit };
        });
      }

      const payload: CreateSaleInput = {
        channel: "PHYSICAL",
        items: payloadItems,
        paidAmount,
        paymentMethod,
        customerId,
        notes: notes || undefined,
        debtNote: hasFiado ? (debtNote.trim() || null) : undefined
      };
      const result = await createSale(payload);
      if (!result.ok) {
        setMessage(`Error: ${result.error.message}`);
        return;
      }
      setItems([]);
      setPaidAmount(0);
      setBarcode("");
      setCustomerQuery("");
      setCustomerId(undefined);
      setSelectedCustomerName(undefined);
      setCustomerResults([]);
      setDebtNote("");
      setAdjustmentType("NONE");
      setAdjustmentValue("");
      setMessage(`Venta creada correctamente (#${result.data.saleId})`);
    });
  }

  const PRODUCT_PAGE_SIZE = 10;
  const [productPageIndex, setProductPageIndex] = useState(0);

  const filteredProducts = useMemo(() => {
    const term = productQuery.trim().toLowerCase();
    if (!term) return catalog;
    const words = term.split(/\s+/).filter(Boolean);
    return catalog.filter((p) => {
      const searchable = [p.name, p.barcode, p.color, p.size, p.brand]
        .filter((v) => v != null && String(v).trim() !== "")
        .join(" ")
        .toLowerCase();
      return words.every((word) => searchable.includes(word));
    });
  }, [catalog, productQuery]);

  const productTotalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCT_PAGE_SIZE));
  const paginatedProducts = useMemo(
    () =>
      filteredProducts.slice(
        productPageIndex * PRODUCT_PAGE_SIZE,
        productPageIndex * PRODUCT_PAGE_SIZE + PRODUCT_PAGE_SIZE
      ),
    [filteredProducts, productPageIndex]
  );

  useEffect(() => {
    setProductPageIndex(0);
  }, [productQuery]);

  return (
    <main className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Punto de Venta
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Escaneá o buscá productos y cobrá en un solo lugar.
            </p>
          </div>
          {items.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-800">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          )}
        </header>

        {/* Bloque único: agregar a la venta — código + búsqueda por nombre */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-slate-900">
            Agregar a la venta
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Código de barras o buscá por nombre y hacé clic para sumar.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchProduct()}
              placeholder="Código de barras"
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <button
              onClick={searchProduct}
              disabled={isPending}
              className="rounded-lg bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isPending ? "Buscando…" : "Buscar por código"}
            </button>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              O buscar por nombre
            </label>
            <input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Ej: remera, jean, código..."
              className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50">
              {isCatalogLoading && (
                <p className="p-3 text-sm text-slate-500">Cargando productos…</p>
              )}
              {!isCatalogLoading && filteredProducts.length === 0 && (
                <p className="p-3 text-sm text-slate-500">
                  {productQuery.trim() ? "No hay coincidencias. Escribí nombre o código." : "Escribí para ver opciones."}
                </p>
              )}
              {!isCatalogLoading &&
                paginatedProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addItem(product)}
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-0 hover:bg-teal-50/80"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {product.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Marca: {product.brand?.trim() || "—"} · Talle: {product.size?.trim() || "—"} · Color: {product.color?.trim() || "—"}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {formatARS(Number(product.price ?? 0))}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Stock {product.stock ?? 0}
                    </span>
                  </button>
                ))}
            </div>
            {!isCatalogLoading && filteredProducts.length > PRODUCT_PAGE_SIZE && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  {filteredProducts.length} resultado{filteredProducts.length !== 1 ? "s" : ""}
                  {productTotalPages > 1 && ` · Página ${productPageIndex + 1} de ${productTotalPages}`}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setProductPageIndex((p) => Math.max(0, p - 1))}
                    disabled={productPageIndex === 0}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductPageIndex((p) => Math.min(productTotalPages - 1, p + 1))}
                    disabled={productPageIndex >= productTotalPages - 1}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col gap-6">
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
                <h2 className="text-base font-semibold text-slate-900">
                  Tu venta
                </h2>
                <span className="text-sm text-slate-500">
                  {items.length} {items.length === 1 ? "producto" : "productos"}
                </span>
              </div>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                  <div className="rounded-full bg-slate-100 p-3">
                    <span className="text-2xl text-slate-400">🛒</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    Tu venta está vacía. Agregá productos arriba.
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80">
                          <th className="px-4 py-3 text-left font-medium text-slate-600">Producto</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600">Código</th>
                          <th className="px-4 py-3 text-center font-medium text-slate-600">Cant.</th>
                          <th className="px-4 py-3 text-right font-medium text-slate-600">Precio</th>
                          <th className="px-4 py-3 text-right font-medium text-slate-600">Total</th>
                          <th className="w-16 px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.productId} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                            <td className="px-4 py-3 text-slate-500">{item.barcode}</td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="number"
                                min={1}
                                value={item.qty}
                                onChange={(e) =>
                                  updateQty(item.productId, Number(e.target.value))
                                }
                                className="h-9 w-16 rounded-lg border border-slate-300 px-2 text-center text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                              />
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                              {item.unitPrice.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                              {(item.qty * item.unitPrice).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => removeItem(item.productId)}
                                className="rounded px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                              >
                                Quitar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 border-t border-slate-200 px-4 py-4 text-sm sm:px-5">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{formatARS(baseTotal)}</span>
                    </div>
                    {adjustmentType !== "NONE" && (
                      <div
                        className={`flex items-center justify-between tabular-nums ${
                          adjustmentAmount < 0 ? "text-rose-600" : "text-teal-600"
                        }`}
                      >
                        <span>
                          {adjustmentType === "DISCOUNT" ? "Descuento" : "Recargo"}
                        </span>
                        <span>{formatARS(adjustmentAmount)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                      <span>Total venta</span>
                      <span className="tabular-nums">{formatARS(totalForValidation)}</span>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-semibold text-slate-900">Cliente</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Opcional. Necesario para venta parcial o fiada.
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
              <h2 className="text-base font-semibold text-slate-900">Forma de pago</h2>
              <div className="mt-3 grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => setPaymentMethod(method.value)}
                      className={`h-10 rounded-lg border px-3 text-sm font-semibold transition ${
                        paymentMethod === method.value
                          ? "border-teal-600 bg-teal-600 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(Number(e.target.value))}
                    placeholder="Monto pagado"
                    className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                  <button
                    type="button"
                    onClick={setPaidToTotal}
                    className="h-10 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Usar total
                  </button>
                </div>
              </div>
              {hasPaidGreaterThanTotal && (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  El pago no puede ser mayor al total.
                </p>
              )}
              {hasPartialWithoutCustomer && (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  Seleccione un cliente para venta parcial o fiada.
                </p>
              )}
              {hasFiado && (
                <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                  Descripción de lo fiado (opcional)
                  <input
                    type="text"
                    value={debtNote}
                    onChange={(e) => setDebtNote(e.target.value)}
                    placeholder="Ej: Remera M, Jean 42 — aparece en la ficha del cliente"
                    className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </label>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-semibold text-slate-900">Descuento / Recargo</h2>
              <div className="mt-3 grid gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustmentType("DISCOUNT")}
                    className={`h-9 flex-1 rounded-lg border px-3 text-sm font-semibold transition ${
                      adjustmentType === "DISCOUNT"
                        ? "border-rose-500 bg-rose-500 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Descuento
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentType("SURCHARGE")}
                    className={`h-9 flex-1 rounded-lg border px-3 text-sm font-semibold transition ${
                      adjustmentType === "SURCHARGE"
                        ? "border-teal-500 bg-teal-500 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Recargo
                  </button>
                </div>
                {adjustmentType !== "NONE" && (
                  <>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjustmentMode("PERCENT")}
                        className={`h-9 w-12 rounded-lg border text-sm font-semibold transition ${
                          adjustmentMode === "PERCENT"
                            ? "border-slate-700 bg-slate-700 text-white"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustmentMode("AMOUNT")}
                        className={`h-9 w-12 rounded-lg border text-sm font-semibold transition ${
                          adjustmentMode === "AMOUNT"
                            ? "border-slate-700 bg-slate-700 text-white"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        $
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={adjustmentValue}
                      onChange={(e) => setAdjustmentValue(e.target.value)}
                      placeholder={adjustmentMode === "PERCENT" ? "Ej: 10" : "Ej: 1500"}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustmentType("NONE");
                        setAdjustmentValue("");
                      }}
                      className="h-9 w-full rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Quitar ajuste
                    </button>
                  </>
                )}
              </div>
              {hasInvalidAdjustment && (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  El ajuste es inválido o supera el total.
                </p>
              )}
            </section>

            <section className="rounded-xl border-2 border-teal-200 bg-teal-50/50 p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-sm">Total venta</span>
                  <span className="text-lg font-semibold tabular-nums text-slate-900">
                    {formatARS(totalForValidation)}
                  </span>
                </div>
                {customerCredit > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm text-teal-700">
                      <span>Crédito a favor</span>
                      <span className="font-semibold tabular-nums">-{formatARS(customerCredit)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-teal-200 pt-3">
                      <span className="text-sm font-medium text-slate-700">A cobrar</span>
                      <span className="text-2xl font-bold tabular-nums text-teal-800">
                        {formatARS(totalToPayInCash)}
                      </span>
                    </div>
                  </>
                )}
                {customerCredit === 0 && (
                  <div className="flex items-center justify-between border-t border-teal-200 pt-3">
                    <span className="text-sm font-medium text-slate-700">A cobrar</span>
                    <span className="text-2xl font-bold tabular-nums text-teal-800">
                      {formatARS(totalForValidation)}
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={confirmSale}
                disabled={isPending || !canConfirm}
                className="mt-4 h-12 w-full rounded-xl bg-teal-600 py-3 text-base font-bold text-white shadow-md transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              >
                {isPending ? "Procesando…" : "Cobrar"}
              </button>
              {message && (
                <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${messageTone}`}>
                  {message}
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
