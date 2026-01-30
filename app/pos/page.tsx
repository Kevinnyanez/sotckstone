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
      .select("id, name, barcode, price, color")
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
      .select("id, name, barcode, price")
      .eq("barcode", barcode.trim())
      .maybeSingle();
    if (error) {
      setMessage("Error al buscar producto");
      return;
    }
    if (!data) {
      setMessage("Producto no encontrado");
      return;
    }
    addItem(data);
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
        notes: notes || undefined
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
      setAdjustmentType("NONE");
      setAdjustmentValue("");
      setMessage(`Venta creada correctamente (#${result.data.saleId})`);
    });
  }

  const filteredProducts = useMemo(() => {
    const term = productQuery.trim().toLowerCase();
    if (!term) return catalog.slice(0, 10);
    return catalog
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.barcode.toLowerCase().includes(term)
      )
      .slice(0, 10);
  }, [catalog, productQuery]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold">Punto de Venta</h1>
          <div className="text-sm text-slate-500">
            {items.length} items en la venta
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col gap-6">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Código de barras</h2>
              <p className="mt-1 text-sm text-slate-500">
                Escaneá o escribí el código para agregar un producto.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Código de barras"
                  autoFocus
                  className="h-12 w-full rounded-lg border border-slate-300 px-4 text-lg shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
                <button
                  onClick={searchProduct}
                  disabled={isPending}
                  className="h-12 w-full rounded-lg bg-slate-900 px-4 text-base font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
                >
                  {isPending ? "Buscando..." : "Buscar"}
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Buscar producto</h2>
              <p className="mt-1 text-sm text-slate-500">
                Filtrá por nombre o barcode y seleccioná.
              </p>
              <input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Ej: remera, jean, 750..."
                className="mt-4 h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <div className="mt-4 space-y-2">
                {isCatalogLoading && (
                  <p className="text-sm text-slate-500">Cargando productos...</p>
                )}
                {!isCatalogLoading && filteredProducts.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No hay productos que coincidan.
                  </p>
                )}
                {!isCatalogLoading &&
                  filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addItem(product)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-3 text-left transition hover:bg-slate-50"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {product.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatARS(Number(product.price ?? 0))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {product.color && (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                            {product.color}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-slate-700">
                          Stock {product.stock ?? 0}
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Productos</h2>
                <span className="text-sm text-slate-500">
                  {items.length} items
                </span>
              </div>
              {items.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No hay items.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="text-left text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 font-medium">Producto</th>
                        <th className="py-2 font-medium">Código</th>
                        <th className="py-2 text-center font-medium">Cant.</th>
                        <th className="py-2 text-right font-medium">Precio</th>
                        <th className="py-2 text-right font-medium">Total</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.productId} className="border-b border-slate-100">
                          <td className="py-3 font-medium">{item.name}</td>
                          <td className="py-3 text-slate-500">{item.barcode}</td>
                          <td className="py-3 text-center">
                            <input
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={(e) =>
                                updateQty(item.productId, Number(e.target.value))
                              }
                              className="h-9 w-20 rounded-md border border-slate-300 px-2 text-center focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                            />
                          </td>
                          <td className="py-3 text-right">
                            {item.unitPrice.toFixed(2)}
                          </td>
                          <td className="py-3 text-right font-medium">
                            {(item.qty * item.unitPrice).toFixed(2)}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => removeItem(item.productId)}
                              className="text-sm font-semibold text-rose-600 hover:text-rose-700"
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatARS(baseTotal)}</span>
                </div>
                {adjustmentType !== "NONE" && (
                  <div
                    className={`flex items-center justify-between ${
                      adjustmentAmount < 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    <span>
                      {adjustmentType === "DISCOUNT" ? "Descuento" : "Recargo"}
                    </span>
                    <span>{formatARS(adjustmentAmount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-base font-semibold text-slate-900">
                  <span>Total</span>
                  <span>{formatARS(totalForValidation)}</span>
                </div>
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Cliente</h2>
              <p className="mt-1 text-sm text-slate-500">
                Escribí nombre o teléfono; opcional para ventas parciales o fiadas.
              </p>
              <input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Nombre o teléfono"
                className="mt-4 h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              {customerResults.length > 0 && !customerId && (
                <ul className="mt-3 space-y-2">
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
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {c.full_name} {c.phone ? `(${c.phone})` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {customerId && selectedCustomerName && (
                <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <span className="text-sm font-medium text-slate-700">
                    Cliente: <span className="font-semibold">{selectedCustomerName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerId(undefined);
                      setSelectedCustomerName(undefined);
                    }}
                    className="rounded px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-200/60"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Pago</h2>
              <div className="mt-4 grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => setPaymentMethod(method.value)}
                      className={`h-11 rounded-lg border px-3 text-sm font-semibold transition ${
                        paymentMethod === method.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={0}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(Number(e.target.value))}
                  placeholder="Monto pagado"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
                <button
                  onClick={setPaidToTotal}
                  className="h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Usar total
                </button>
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
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Descuento / Recargo</h2>
              <div className="mt-4 grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustmentType("DISCOUNT")}
                    className={`h-10 rounded-lg border px-3 text-sm font-semibold ${
                      adjustmentType === "DISCOUNT"
                        ? "border-rose-600 bg-rose-600 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Descuento
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentType("SURCHARGE")}
                    className={`h-10 rounded-lg border px-3 text-sm font-semibold ${
                      adjustmentType === "SURCHARGE"
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Recargo
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustmentMode("PERCENT")}
                    className={`h-10 rounded-lg border px-3 text-sm font-semibold ${
                      adjustmentMode === "PERCENT"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentMode("AMOUNT")}
                    className={`h-10 rounded-lg border px-3 text-sm font-semibold ${
                      adjustmentMode === "AMOUNT"
                        ? "border-slate-900 bg-slate-900 text-white"
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
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
                <button
                  type="button"
                  onClick={() => {
                    setAdjustmentType("NONE");
                    setAdjustmentValue("");
                  }}
                  className="h-10 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Quitar ajuste
                </button>
              </div>
              {hasInvalidAdjustment && (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  El ajuste es inválido o supera el total.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Total venta</span>
                  <span className="text-xl font-semibold">
                    {formatARS(totalForValidation)}
                  </span>
                </div>
                {customerCredit > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm text-emerald-700">
                      <span>Crédito a favor</span>
                      <span className="font-semibold">-{formatARS(customerCredit)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                      <span className="text-sm text-slate-500">A cobrar (efectivo)</span>
                      <span className="text-2xl font-semibold text-slate-900">
                        {formatARS(totalToPayInCash)}
                      </span>
                    </div>
                  </>
                )}
                {customerCredit === 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Total a cobrar</span>
                    <span className="text-3xl font-semibold">
                      {formatARS(totalForValidation)}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={confirmSale}
                disabled={isPending || !canConfirm}
                className="mt-4 h-12 w-full rounded-lg bg-emerald-600 text-lg font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isPending ? "Procesando..." : "Cobrar"}
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
