"use client";
 
 import Link from "next/link";
 import { useRouter } from "next/navigation";
 import { useState, useTransition } from "react";
 import { getSupabaseClient } from "../../../lib/supabaseClient";
 
 type CustomerFormState = {
   name: string;
   phone: string;
   email: string;
 };
 
 const initialState: CustomerFormState = {
   name: "",
   phone: "",
   email: ""
 };
 
 export default function NewCustomerPage() {
   const supabase = getSupabaseClient();
   const router = useRouter();
   const [form, setForm] = useState<CustomerFormState>(initialState);
   const [message, setMessage] = useState<string | null>(null);
   const [isPending, startTransition] = useTransition();
 
   function updateField<K extends keyof CustomerFormState>(
     key: K,
     value: CustomerFormState[K]
   ) {
     setForm((prev) => ({ ...prev, [key]: value }));
   }
 
   async function createCustomer() {
     const payload: Record<string, string | null> = {
       full_name: form.name.trim(),
       phone: form.phone.trim() || null
     };
     if (form.email.trim()) payload.email = form.email.trim();
 
     const { data, error } = await supabase
       .from("customers")
       .insert([payload])
       .select("id")
       .single();
 
     if (error) {
       setMessage(`Error al crear cliente: ${error.message}`);
       return;
     }
 
     router.push(`/accounts/${data.id}`);
   }
 
   function handleSubmit() {
     setMessage(null);
     if (!form.name.trim()) {
       setMessage("El nombre es obligatorio.");
       return;
     }
 
     startTransition(() => {
       void createCustomer();
     });
   }
 
   return (
     <main className="min-h-screen bg-slate-100/80 text-slate-900">
       <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
         <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Nuevo cliente</h1>
             <p className="mt-0.5 text-sm text-slate-500">
               Cargue los datos principales para crear la ficha.
             </p>
           </div>
           <Link
             href="/accounts"
             className="text-sm font-semibold text-slate-600 hover:text-teal-700"
           >
             Volver al listado
           </Link>
         </header>

         <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
           <div className="grid gap-4 sm:grid-cols-2">
             <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
               Nombre
               <input
                 value={form.name}
                 onChange={(e) => updateField("name", e.target.value)}
                 className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                 placeholder="Ej: María Pérez"
               />
             </label>
             <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
               Teléfono
               <input
                 value={form.phone}
                 onChange={(e) => updateField("phone", e.target.value)}
                 className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                 placeholder="Ej: 11 5555 0000"
               />
             </label>
             <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
               Email (opcional)
               <input
                 type="email"
                 value={form.email}
                 onChange={(e) => updateField("email", e.target.value)}
                 className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                 placeholder="Ej: cliente@mail.com"
               />
             </label>
           </div>

           {message && (
             <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
               {message}
             </p>
           )}

           <div className="mt-6 flex flex-wrap gap-3">
             <button
               type="button"
               onClick={handleSubmit}
               disabled={isPending}
               className="h-11 rounded-lg bg-teal-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
             >
               {isPending ? "Guardando…" : "Crear cliente"}
             </button>
             <Link
               href="/accounts"
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
