"use client";
 
 import Link from "next/link";
 import { useRouter } from "next/navigation";
 import { useState, useTransition } from "react";
 import { getSupabaseClient } from "../../../lib/supabaseClient";
 
 type ProductFormState = {
   name: string;
  sku: string;
   barcode: string;
   price: string;
  costPrice: string;
   size: string;
   color: string;
   brand: string;
  initialStock: string;
 };
 
 const initialState: ProductFormState = {
   name: "",
  sku: "",
   barcode: "",
   price: "",
  costPrice: "",
   size: "",
   color: "",
  brand: "",
  initialStock: ""
 };
 
 export default function NewProductPage() {
   const supabase = getSupabaseClient();
   const router = useRouter();
   const [form, setForm] = useState<ProductFormState>(initialState);
   const [message, setMessage] = useState<string | null>(null);
   const [isPending, startTransition] = useTransition();
 
   function updateField<K extends keyof ProductFormState>(
     key: K,
     value: ProductFormState[K]
   ) {
     setForm((prev) => ({ ...prev, [key]: value }));
   }
 
  async function createProduct() {
    const priceValue = Number(form.price);
    const initialStockValue = Number(form.initialStock);
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      barcode: form.barcode.trim(),
      price: priceValue,
      cost: form.costPrice ? Number(form.costPrice) : null,
      size: form.size.trim() || null,
      color: form.color.trim() || null,
      brand: form.brand.trim() || null
    };

    const { data, error } = await supabase
      .from("products")
      .insert([payload])
      .select("id")
      .single();

    if (error) {
      setMessage(`Error al crear producto: ${error.message}`);
      return;
    }

    if (Number.isFinite(initialStockValue) && initialStockValue > 0) {
      const { error: stockError } = await supabase.from("stock_movements").insert([
        {
          product_id: data.id,
          movement_type: "INITIAL",
          quantity: initialStockValue,
          reference_type: "INITIAL",
          reference_id: null,
          channel: "LOCAL"
        }
      ]);
      if (stockError) {
        setMessage(`Producto creado, pero fallo el stock inicial: ${stockError.message}`);
        return;
      }
    }

    router.push(`/products/${data.id}`);
  }

  function handleSubmit() {
     setMessage(null);
    if (!form.name.trim() || !form.sku.trim() || !form.barcode.trim()) {
      setMessage("Nombre, SKU y código de barras son obligatorios.");
      return;
    }
    if (!form.price.trim() || !Number.isFinite(Number(form.price))) {
      setMessage("El precio es obligatorio y debe ser válido.");
      return;
    }
    if (
      form.initialStock.trim() &&
      (!Number.isFinite(Number(form.initialStock)) ||
        Number(form.initialStock) < 0)
    ) {
      setMessage("El stock inicial debe ser un número mayor o igual a 0.");
       return;
     }
 
    startTransition(() => {
      void createProduct();
    });
   }
 
   return (
     <main className="min-h-screen bg-slate-50 text-slate-900">
       <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
         <header className="flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-3xl font-semibold">Nuevo producto</h1>
             <p className="mt-1 text-sm text-slate-500">
               Complete los datos básicos del producto.
             </p>
           </div>
           <Link
             href="/products"
             className="text-sm font-semibold text-slate-600 hover:text-slate-900"
           >
             Volver al listado
           </Link>
         </header>
 
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-800">
                Identificación
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Nombre del producto
                  <input
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    className="h-11 rounded-lg border border-slate-300 px-3 text-base font-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Ej: Remera básica"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  SKU
                  <input
                    value={form.sku}
                    onChange={(e) => updateField("sku", e.target.value)}
                    className="h-11 rounded-lg border border-slate-300 px-3 text-base font-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Ej: REM-001"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Código de barras
                  <input
                    value={form.barcode}
                    onChange={(e) => updateField("barcode", e.target.value)}
                    className="h-11 rounded-lg border border-slate-300 px-3 text-base font-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Ej: 7501234567890"
                  />
                </label>
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-800">Precios</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Precio de venta (obligatorio)
                  <input
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(e) => updateField("price", e.target.value)}
                    className="h-11 rounded-lg border border-slate-300 px-3 text-base font-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="0.00"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Costo (opcional)
                  <input
                    type="number"
                    min={0}
                    value={form.costPrice}
                    onChange={(e) => updateField("costPrice", e.target.value)}
                    className="h-11 rounded-lg border border-slate-300 px-3 text-base font-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="0.00"
                  />
                </label>
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-800">Stock inicial</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Cantidad inicial (opcional)
                  <input
                    type="number"
                    min={0}
                    value={form.initialStock}
                    onChange={(e) => updateField("initialStock", e.target.value)}
                    className="h-11 rounded-lg border border-slate-300 px-3 text-base font-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Ej: 10"
                  />
                </label>
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-800">Atributos</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Talle
                  <input
                    value={form.size}
                    onChange={(e) => updateField("size", e.target.value)}
                    className="h-11 rounded-lg border border-slate-300 px-3 text-base font-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Ej: M"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Color
                  <input
                    value={form.color}
                    onChange={(e) => updateField("color", e.target.value)}
                    className="h-11 rounded-lg border border-slate-300 px-3 text-base font-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Ej: Negro"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Marca
                  <input
                    value={form.brand}
                    onChange={(e) => updateField("brand", e.target.value)}
                    className="h-11 rounded-lg border border-slate-300 px-3 text-base font-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Ej: Stone"
                  />
                </label>
              </div>
            </div>
          </div>
 
           {message && (
             <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
               {message}
             </p>
           )}
 
           <div className="mt-6 flex flex-wrap gap-3">
             <button
               onClick={handleSubmit}
               disabled={isPending}
               className="h-11 rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
             >
               {isPending ? "Guardando..." : "Crear producto"}
             </button>
             <Link
               href="/products"
               className="h-11 rounded-lg border border-slate-300 px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50"
             >
               Cancelar
             </Link>
           </div>
         </section>
       </div>
     </main>
   );
 }
