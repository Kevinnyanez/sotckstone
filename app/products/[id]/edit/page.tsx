"use client";
 
 import Link from "next/link";
 import { useParams, useRouter } from "next/navigation";
 import { useEffect, useState, useTransition } from "react";
 import { getSupabaseClient } from "../../../../lib/supabaseClient";
 
 type ProductFormState = {
   name: string;
  sku: string;
   barcode: string;
   price: string;
  costPrice: string;
   size: string;
   color: string;
   brand: string;
 };
 
 export default function EditProductPage() {
   const params = useParams<{ id: string }>();
   const productId = Array.isArray(params.id) ? params.id[0] : params.id;
   const supabase = getSupabaseClient();
   const router = useRouter();
   const [form, setForm] = useState<ProductFormState>({
     name: "",
    sku: "",
     barcode: "",
     price: "",
    costPrice: "",
     size: "",
     color: "",
     brand: ""
   });
   const [message, setMessage] = useState<string | null>(null);
   const [loading, setLoading] = useState<boolean>(false);
   const [isPending, startTransition] = useTransition();
 
   useEffect(() => {
     if (!productId) return;
     void loadProduct(productId);
   }, [productId]);
 
   function updateField<K extends keyof ProductFormState>(
     key: K,
     value: ProductFormState[K]
   ) {
     setForm((prev) => ({ ...prev, [key]: value }));
   }
 
   async function loadProduct(id: string) {
     setLoading(true);
    const { data, error } = await supabase
       .from("products")
      .select("name, sku, barcode, price, cost, size, color, brand")
       .eq("id", id)
       .maybeSingle();
     if (error || !data) {
       setMessage("No se pudo cargar el producto");
       setLoading(false);
       return;
     }
     setForm({
       name: data.name ?? "",
      sku: data.sku ?? "",
       barcode: data.barcode ?? "",
       price: data.price !== null && data.price !== undefined ? String(data.price) : "",
      costPrice:
        data.cost !== null && data.cost !== undefined
          ? String(data.cost)
          : "",
       size: data.size ?? "",
       color: data.color ?? "",
       brand: data.brand ?? ""
     });
     setLoading(false);
   }
 
   function handleSubmit() {
     setMessage(null);
    if (!productId) {
      setMessage("Producto inválido.");
      return;
    }
    if (!form.name.trim() || !form.sku.trim() || !form.barcode.trim()) {
      setMessage("Nombre, SKU y código de barras son obligatorios.");
      return;
    }
    if (!form.price.trim() || !Number.isFinite(Number(form.price))) {
      setMessage("El precio es obligatorio y debe ser válido.");
       return;
     }
 
     startTransition(async () => {
       const payload = {
         name: form.name.trim(),
        sku: form.sku.trim(),
         barcode: form.barcode.trim(),
        price: Number(form.price),
        cost: form.costPrice && Number(form.costPrice) >= 0 ? Number(form.costPrice) : 0,
         size: form.size.trim() || null,
         color: form.color.trim() || null,
         brand: form.brand.trim() || null
       };
 
       const { error } = await supabase
         .from("products")
         .update(payload)
         .eq("id", productId);
 
       if (error) {
         setMessage(`Error al actualizar producto: ${error.message}`);
         return;
       }
 
       router.push(`/products/${productId}`);
     });
   }
 
   return (
     <main className="min-h-screen bg-slate-50 text-slate-900">
       <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
         <header className="flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-3xl font-semibold">Editar producto</h1>
             <p className="mt-1 text-sm text-slate-500">
               Actualice los datos del producto.
             </p>
           </div>
           <Link
             href={`/products/${productId}`}
             className="text-sm font-semibold text-slate-600 hover:text-slate-900"
           >
             Volver a la ficha
           </Link>
         </header>
 
         <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
           {loading && (
             <p className="text-sm text-slate-500">Cargando datos...</p>
           )}
           {!loading && (
            <div className="grid gap-4 sm:grid-cols-2">
               <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                 Nombre
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
           )}
 
           {message && (
             <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
               {message}
             </p>
           )}
 
           <div className="mt-6 flex flex-wrap gap-3">
             <button
               onClick={handleSubmit}
               disabled={isPending || loading}
               className="h-11 rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
             >
               {isPending ? "Guardando..." : "Guardar cambios"}
             </button>
             <Link
               href={`/products/${productId}`}
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
