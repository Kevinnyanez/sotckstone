"use server";

import { getSupabaseServerClient } from "./supabaseServer";

type SaleChannel = "PHYSICAL" | "MERCADOLIBRE";
type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "OTHER";
type SaleType = "NORMAL" | "CONDITIONAL";
type ConditionalStatus = "OPEN" | "CONFIRMED" | "RETURNED";

export type SaleItemInput = {
  productId: string;
  qty: number;
  unitPrice: number;
};

export type CreateSaleInput = {
  customerId?: string;
  channel: SaleChannel;
  items: SaleItemInput[];
  paidAmount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  saleDate?: string;
};

export type CreateConditionalSaleInput = {
  customerId: string;
  channel: SaleChannel;
  items: SaleItemInput[];
  notes?: string;
  saleDate?: string;
};

export type ConfirmConditionalSaleInput = {
  saleId: string;
  paidAmount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  paymentDate?: string;
};

export type ReturnConditionalSaleInput = {
  saleId: string;
};

export type PayAccountInput = {
  customerId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  paymentDate?: string;
};

export type ExchangeItemInput = {
  productId: string;
  qty: number;
};

export type CreateExchangeInput = {
  customerId?: string;
  itemsIn: ExchangeItemInput[];
  itemsOut: ExchangeItemInput[];
  differenceAmount: number;
  notes?: string;
  exchangeDate?: string;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; code?: string } };

type RollbackOp = {
  table: string;
  idColumn?: string;
  ids: string[];
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Error inesperado";
}

function validateItems(
  items: Array<{ productId: string; qty: number }>,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
) {
  if (!allowEmpty && (!items || items.length === 0)) {
    throw new Error("La lista de items no puede estar vacía");
  }
  for (const item of items) {
    if (!item.productId) throw new Error("Producto inválido");
    if (!Number.isFinite(item.qty) || item.qty <= 0) {
      throw new Error("Cantidad inválida");
    }
  }
}

function sumTotal(items: SaleItemInput[]): number {
  return items.reduce((acc, item) => acc + item.qty * item.unitPrice, 0);
}

async function rollback(ops: RollbackOp[]) {
  if (ops.length === 0) return;
  const supabase = getSupabaseServerClient();

  for (let i = ops.length - 1; i >= 0; i -= 1) {
    const op = ops[i];
    if (op.ids.length === 0) continue;
    const idColumn = op.idColumn ?? "id";
    await supabase.from(op.table).delete().in(idColumn, op.ids);
  }
}

async function getStocks(productIds: string[]) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("product_id, quantity")
    .in("product_id", productIds);
  if (error) throw error;

  const map = new Map<string, number>();
  for (const id of productIds) map.set(id, 0);
  for (const row of data ?? []) {
    const current = map.get(row.product_id) ?? 0;
    map.set(row.product_id, current + row.quantity);
  }
  return map;
}

async function ensureProductsExist(productIds: string[]) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .in("id", productIds);
  if (error) throw error;
  const found = new Set((data ?? []).map((p) => p.id));
  for (const id of productIds) {
    if (!found.has(id)) throw new Error("Producto inexistente");
  }
}

async function getOrCreateAccount(customerId: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data: existing, error: findError } = await supabase
    .from("current_accounts")
    .select("id")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (findError) throw findError;
  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("current_accounts")
    .insert([{ customer_id: customerId, status: "PROBANDO" }])
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}

async function getAccountBalance(accountId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("account_movements")
    .select("amount")
    .eq("account_id", accountId);
  if (error) throw error;
  return (data ?? []).reduce((acc, row) => acc + row.amount, 0);
}

/** Saldo de la cuenta del cliente. Negativo = crédito a favor. */
export async function getCustomerBalance(
  customerId: string
): Promise<ActionResult<{ balance: number }>> {
  try {
    const supabase = getSupabaseServerClient();
    const { data: account, error: accError } = await supabase
      .from("current_accounts")
      .select("id")
      .eq("customer_id", customerId)
      .maybeSingle();
    if (accError) throw accError;
    if (!account?.id) return { ok: true, data: { balance: 0 } };
    const balance = await getAccountBalance(account.id);
    return { ok: true, data: { balance } };
  } catch (error) {
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

async function updateAccountStatus(accountId: string, balance: number) {
  const supabase = getSupabaseServerClient();
  const status = balance > 0 ? "DEUDA" : "CANCELADO";
  await supabase.from("current_accounts").update({ status }).eq("id", accountId);
}

export async function createSale(
  input: CreateSaleInput
): Promise<ActionResult<{ saleId: string; total: number; pending: number }>> {
  const rollbackOps: RollbackOp[] = [];

  try {
    validateItems(input.items);
    for (const item of input.items) {
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
        throw new Error("Precio inválido");
      }
    }

    if (!Number.isFinite(input.paidAmount) || input.paidAmount < 0) {
      throw new Error("Pago inválido");
    }

    const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
    await ensureProductsExist(productIds);

    const stocks = await getStocks(productIds);
    for (const item of input.items) {
      const stock = stocks.get(item.productId) ?? 0;
      if (stock < item.qty) throw new Error("Stock insuficiente");
    }

    const total = sumTotal(input.items);
    if (input.paidAmount > total) {
      throw new Error("Pago mayor al total");
    }

    let pending = total - input.paidAmount;
    if (pending > 0 && !input.customerId) {
      throw new Error("Cliente requerido para venta fiada o parcial");
    }

    let creditToApply = 0;
    let accountIdForCustomer: string | null = null;
    if (input.customerId && pending > 0) {
      accountIdForCustomer = await getOrCreateAccount(input.customerId);
      const balance = await getAccountBalance(accountIdForCustomer);
      if (balance < 0) {
        creditToApply = Math.min(-balance, pending);
      }
    }
    const effectivePaid = input.paidAmount + creditToApply;
    const effectivePending = pending - creditToApply;

    const supabase = getSupabaseServerClient();

    const baseSalePayload = {
      sale_date: input.saleDate ?? new Date().toISOString(),
      channel: input.channel,
      customer_id: input.customerId ?? null,
      total_amount: total,
      paid_amount: effectivePaid,
      is_fiado: effectivePending > 0,
      notes: input.notes ?? null
    };

    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .insert([
        {
          ...baseSalePayload,
          payment_method: input.paymentMethod
        }
      ])
      .select("id")
      .single();
    if (saleError) {
      if (saleError.message?.includes("payment_method")) {
        const { data: fallbackSale, error: fallbackError } = await supabase
          .from("sales")
          .insert([baseSalePayload])
          .select("id")
          .single();
        if (fallbackError) throw fallbackError;
        rollbackOps.push({ table: "sales", ids: [fallbackSale.id] });
        const saleItemsPayload = input.items.map((item) => ({
          sale_id: fallbackSale.id,
          product_id: item.productId,
          quantity: item.qty,
          unit_price: item.unitPrice,
          total_price: item.qty * item.unitPrice
        }));
        const { data: saleItems, error: saleItemsError } = await supabase
          .from("sale_items")
          .insert(saleItemsPayload)
          .select("id");
        if (saleItemsError) throw saleItemsError;
        rollbackOps.push({
          table: "sale_items",
          ids: (saleItems ?? []).map((s) => s.id)
        });

        const stockChannel = input.channel === "MERCADOLIBRE" ? "MERCADOLIBRE" : "LOCAL";
        const stockMovementsPayload = input.items.map((item) => ({
          product_id: item.productId,
          movement_type:
            input.channel === "MERCADOLIBRE"
              ? "SALE_MERCADOLIBRE"
              : "SALE_PHYSICAL",
          quantity: -item.qty,
          reference_type: "SALE",
          reference_id: fallbackSale.id,
          channel: stockChannel
        }));
        const { data: stockMovements, error: stockError } = await supabase
          .from("stock_movements")
          .insert(stockMovementsPayload)
          .select("id");
        if (stockError) throw stockError;
        rollbackOps.push({
          table: "stock_movements",
          ids: (stockMovements ?? []).map((s) => s.id)
        });

        if (input.paidAmount > 0) {
          const { data: cashMovements, error: cashError } = await supabase
            .from("cash_movements")
            .insert([
              {
                movement_type: "SALE",
                direction: "IN",
                amount: input.paidAmount,
                reference_type: "SALE",
                reference_id: fallbackSale.id,
                payment_method: input.paymentMethod
              }
            ])
            .select("id");
          if (cashError) throw cashError;
          rollbackOps.push({
            table: "cash_movements",
            ids: (cashMovements ?? []).map((c) => c.id)
          });
        }

        if (creditToApply > 0 && accountIdForCustomer) {
          const { data: consumeMovs, error: consumeError } = await supabase
            .from("account_movements")
            .insert([
              {
                account_id: accountIdForCustomer,
                movement_type: "CONSUME_CREDIT",
                amount: creditToApply,
                reference_type: "SALE",
                reference_id: fallbackSale.id
              }
            ])
            .select("id");
          if (consumeError) throw consumeError;
          rollbackOps.push({
            table: "account_movements",
            ids: (consumeMovs ?? []).map((a) => a.id)
          });
        }

        if (effectivePending > 0 && accountIdForCustomer) {
          const { data: accMovs, error: accError } = await supabase
            .from("account_movements")
            .insert([
              {
                account_id: accountIdForCustomer,
                movement_type: "DEBT",
                amount: effectivePending,
                reference_type: "SALE",
                reference_id: fallbackSale.id
              }
            ])
            .select("id");
          if (accError) throw accError;
          rollbackOps.push({
            table: "account_movements",
            ids: (accMovs ?? []).map((a) => a.id)
          });

          const newBalance = (await getAccountBalance(accountIdForCustomer)) || 0;
          await updateAccountStatus(accountIdForCustomer, newBalance);
        } else if (effectivePending <= 0 && creditToApply > 0 && accountIdForCustomer) {
          const newBalance = (await getAccountBalance(accountIdForCustomer)) || 0;
          await updateAccountStatus(accountIdForCustomer, newBalance);
        }

        return { ok: true, data: { saleId: fallbackSale.id, total, pending: effectivePending } };
      }
      throw saleError;
    }
    rollbackOps.push({ table: "sales", ids: [sale.id] });

    const saleItemsPayload = input.items.map((item) => ({
      sale_id: sale.id,
      product_id: item.productId,
      quantity: item.qty,
      unit_price: item.unitPrice,
      total_price: item.qty * item.unitPrice
    }));
    const { data: saleItems, error: saleItemsError } = await supabase
      .from("sale_items")
      .insert(saleItemsPayload)
      .select("id");
    if (saleItemsError) throw saleItemsError;
    rollbackOps.push({
      table: "sale_items",
      ids: (saleItems ?? []).map((s) => s.id)
    });

    const stockChannel = input.channel === "MERCADOLIBRE" ? "MERCADOLIBRE" : "LOCAL";
    const stockMovementsPayload = input.items.map((item) => ({
      product_id: item.productId,
      movement_type:
        input.channel === "MERCADOLIBRE" ? "SALE_MERCADOLIBRE" : "SALE_PHYSICAL",
      quantity: -item.qty,
      reference_type: "SALE",
      reference_id: sale.id,
      channel: stockChannel
    }));
    const { data: stockMovements, error: stockError } = await supabase
      .from("stock_movements")
      .insert(stockMovementsPayload)
      .select("id");
    if (stockError) throw stockError;
    rollbackOps.push({
      table: "stock_movements",
      ids: (stockMovements ?? []).map((s) => s.id)
    });

    if (input.paidAmount > 0) {
      const { data: cashMovements, error: cashError } = await supabase
        .from("cash_movements")
        .insert([
          {
            movement_type: "SALE",
            direction: "IN",
            amount: input.paidAmount,
            reference_type: "SALE",
            reference_id: sale.id,
            payment_method: input.paymentMethod
          }
        ])
        .select("id");
      if (cashError) throw cashError;
      rollbackOps.push({
        table: "cash_movements",
        ids: (cashMovements ?? []).map((c) => c.id)
      });
    }

    if (creditToApply > 0 && accountIdForCustomer) {
      const { data: consumeMovs, error: consumeError } = await supabase
        .from("account_movements")
        .insert([
          {
            account_id: accountIdForCustomer,
            movement_type: "CONSUME_CREDIT",
            amount: creditToApply,
            reference_type: "SALE",
            reference_id: sale.id
          }
        ])
        .select("id");
      if (consumeError) throw consumeError;
      rollbackOps.push({
        table: "account_movements",
        ids: (consumeMovs ?? []).map((a) => a.id)
      });
    }

    if (effectivePending > 0 && accountIdForCustomer) {
      const { data: accMovs, error: accError } = await supabase
        .from("account_movements")
        .insert([
          {
            account_id: accountIdForCustomer,
            movement_type: "DEBT",
            amount: effectivePending,
            reference_type: "SALE",
            reference_id: sale.id
          }
        ])
        .select("id");
      if (accError) throw accError;
      rollbackOps.push({
        table: "account_movements",
        ids: (accMovs ?? []).map((a) => a.id)
      });

      const newBalance = (await getAccountBalance(accountIdForCustomer)) || 0;
      await updateAccountStatus(accountIdForCustomer, newBalance);
    } else if (effectivePending <= 0 && creditToApply > 0 && accountIdForCustomer) {
      const newBalance = (await getAccountBalance(accountIdForCustomer)) || 0;
      await updateAccountStatus(accountIdForCustomer, newBalance);
    }

    return { ok: true, data: { saleId: sale.id, total, pending: effectivePending } };
  } catch (error) {
    await rollback(rollbackOps);
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

export type CancelSaleInput = { saleId: string };

/** Anula una venta: revierte stock, caja y movimientos de cuenta. */
export async function cancelSale(
  input: CancelSaleInput
): Promise<ActionResult<{ saleId: string }>> {
  const rollbackOps: RollbackOp[] = [];

  try {
    const supabase = getSupabaseServerClient();

    let sale: { id: string; paid_amount?: number | null; customer_id?: string | null; channel?: string | null; sale_type?: string | null; conditional_status?: string | null; payment_method?: string | null } | null = null;
    const { data: saleWithMethod, error: saleError } = await supabase
      .from("sales")
      .select("id, paid_amount, payment_method, customer_id, channel, sale_type, conditional_status")
      .eq("id", input.saleId)
      .maybeSingle();
    if (saleError) {
      if (saleError.message?.includes("payment_method")) {
        const { data: saleBasic, error: saleBasicError } = await supabase
          .from("sales")
          .select("id, paid_amount, customer_id, channel, sale_type, conditional_status")
          .eq("id", input.saleId)
          .maybeSingle();
        if (saleBasicError) throw saleBasicError;
        sale = saleBasic as typeof sale;
      } else {
        throw saleError;
      }
    } else {
      sale = saleWithMethod as typeof sale;
    }
    if (!sale) throw new Error("Venta inexistente");

    const cancelledAt = (sale as { cancelled_at?: string | null }).cancelled_at;
    if (cancelledAt) throw new Error("La venta ya está anulada");

    const saleType = sale.sale_type as SaleType | null;
    const condStatus = sale.conditional_status as ConditionalStatus | null;
    if (saleType === "CONDITIONAL" && condStatus === "OPEN") {
      throw new Error("Use devolución para ventas condicionales abiertas");
    }

    const { data: items, error: itemsError } = await supabase
      .from("sale_items")
      .select("product_id, quantity")
      .eq("sale_id", sale.id);
    if (itemsError) throw itemsError;
    if (!items?.length) throw new Error("La venta no tiene items");

    const paidAmount = Number(sale.paid_amount ?? 0);
    const paymentMethod = sale.payment_method ?? "CASH";
    const channel = (sale.channel === "MERCADOLIBRE" ? "MERCADOLIBRE" : "LOCAL") as string;

    // 1. Devolver stock
    const stockPayload = items.map((item: { product_id: string; quantity: number }) => ({
      product_id: item.product_id,
      movement_type: "ADJUSTMENT",
      quantity: item.quantity,
      reference_type: "SALE_CANCELLATION",
      reference_id: sale.id,
      channel
    }));
    const { data: stockMovs, error: stockErr } = await supabase
      .from("stock_movements")
      .insert(stockPayload)
      .select("id");
    if (stockErr) throw stockErr;
    rollbackOps.push({ table: "stock_movements", ids: (stockMovs ?? []).map((s: { id: string }) => s.id) });

    // 2. Revertir caja (salida por el mismo monto)
    if (paidAmount > 0) {
      const { data: cashMovs, error: cashErr } = await supabase
        .from("cash_movements")
        .insert([
          {
            movement_type: "SALE",
            direction: "OUT",
            amount: paidAmount,
            reference_type: "SALE_CANCELLATION",
            reference_id: sale.id,
            payment_method: paymentMethod
          }
        ])
        .select("id");
      if (cashErr) throw cashErr;
      rollbackOps.push({ table: "cash_movements", ids: (cashMovs ?? []).map((c: { id: string }) => c.id) });
    }

    // 3. Revertir movimientos de cuenta (CONSUME_CREDIT y DEBT de esta venta)
    if (sale.customer_id) {
      const { data: accountRow } = await supabase
        .from("current_accounts")
        .select("id")
        .eq("customer_id", sale.customer_id)
        .maybeSingle();
      if (accountRow?.id) {
        const { data: movs } = await supabase
          .from("account_movements")
          .select("movement_type, amount")
          .eq("account_id", accountRow.id)
          .eq("reference_type", "SALE")
          .eq("reference_id", sale.id);
        let creditToReverse = 0;
        let debtToReverse = 0;
        for (const m of movs ?? []) {
          const amt = Number(m.amount ?? 0);
          if (m.movement_type === "CONSUME_CREDIT") creditToReverse += amt;
          if (m.movement_type === "DEBT") debtToReverse += amt;
        }
        if (creditToReverse > 0) {
          const { data: revCredit, error: eCredit } = await supabase
            .from("account_movements")
            .insert([
              {
                account_id: accountRow.id,
                movement_type: "CREDIT",
                amount: -creditToReverse,
                reference_type: "SALE_CANCELLATION",
                reference_id: sale.id
              }
            ])
            .select("id");
          if (eCredit) throw eCredit;
          rollbackOps.push({ table: "account_movements", ids: (revCredit ?? []).map((a: { id: string }) => a.id) });
        }
        if (debtToReverse > 0) {
          const { data: revDebt, error: eDebt } = await supabase
            .from("account_movements")
            .insert([
              {
                account_id: accountRow.id,
                movement_type: "PAYMENT",
                amount: -debtToReverse,
                reference_type: "SALE_CANCELLATION",
                reference_id: sale.id
              }
            ])
            .select("id");
          if (eDebt) throw eDebt;
          rollbackOps.push({ table: "account_movements", ids: (revDebt ?? []).map((a: { id: string }) => a.id) });
        }
        const newBalance = (await getAccountBalance(accountRow.id)) || 0;
        await updateAccountStatus(accountRow.id, newBalance);
      }
    }

    // 4. Marcar venta como anulada
    const { error: updateErr } = await supabase
      .from("sales")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", sale.id);
    if (updateErr) throw updateErr;

    return { ok: true, data: { saleId: sale.id } };
  } catch (error) {
    await rollback(rollbackOps);
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

export async function createConditionalSale(
  input: CreateConditionalSaleInput
): Promise<ActionResult<{ saleId: string; total: number }>> {
  const rollbackOps: RollbackOp[] = [];

  try {
    if (!input.customerId) {
      throw new Error("Cliente requerido para venta condicional");
    }

    validateItems(input.items);
    for (const item of input.items) {
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
        throw new Error("Precio inválido");
      }
    }

    const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
    await ensureProductsExist(productIds);

    const stocks = await getStocks(productIds);
    for (const item of input.items) {
      const stock = stocks.get(item.productId) ?? 0;
      if (stock < item.qty) throw new Error("Stock insuficiente");
    }

    const total = sumTotal(input.items);
    if (total <= 0) {
      throw new Error("Total inválido");
    }

    const supabase = getSupabaseServerClient();

    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .insert([
        {
          sale_date: input.saleDate ?? new Date().toISOString(),
          channel: input.channel,
          customer_id: input.customerId,
          total_amount: total,
          paid_amount: 0,
          is_fiado: false,
          notes: input.notes ?? null,
          sale_type: "CONDITIONAL" satisfies SaleType,
          conditional_status: "OPEN" satisfies ConditionalStatus
        }
      ])
      .select("id")
      .single();
    if (saleError) throw saleError;
    rollbackOps.push({ table: "sales", ids: [sale.id] });

    const saleItemsPayload = input.items.map((item) => ({
      sale_id: sale.id,
      product_id: item.productId,
      quantity: item.qty,
      unit_price: item.unitPrice,
      total_price: item.qty * item.unitPrice
    }));
    const { data: saleItems, error: saleItemsError } = await supabase
      .from("sale_items")
      .insert(saleItemsPayload)
      .select("id");
    if (saleItemsError) throw saleItemsError;
    rollbackOps.push({
      table: "sale_items",
      ids: (saleItems ?? []).map((s) => s.id)
    });

    const stockChannel = input.channel === "MERCADOLIBRE" ? "MERCADOLIBRE" : "LOCAL";
    const stockMovementsPayload = input.items.map((item) => ({
      product_id: item.productId,
      movement_type:
        input.channel === "MERCADOLIBRE" ? "SALE_MERCADOLIBRE" : "SALE_PHYSICAL",
      quantity: -item.qty,
      reference_type: "SALE",
      reference_id: sale.id,
      channel: stockChannel
    }));
    const { data: stockMovements, error: stockError } = await supabase
      .from("stock_movements")
      .insert(stockMovementsPayload)
      .select("id");
    if (stockError) throw stockError;
    rollbackOps.push({
      table: "stock_movements",
      ids: (stockMovements ?? []).map((s) => s.id)
    });

    return { ok: true, data: { saleId: sale.id, total } };
  } catch (error) {
    await rollback(rollbackOps);
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

export async function confirmConditionalSale(
  input: ConfirmConditionalSaleInput
): Promise<ActionResult<{ saleId: string; total: number; pending: number }>> {
  const rollbackOps: RollbackOp[] = [];

  try {
    if (!Number.isFinite(input.paidAmount) || input.paidAmount < 0) {
      throw new Error("Pago inválido");
    }

    const supabase = getSupabaseServerClient();

    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .select(
        "id, total_amount, paid_amount, customer_id, sale_type, conditional_status"
      )
      .eq("id", input.saleId)
      .maybeSingle();
    if (saleError) throw saleError;
    if (!sale) throw new Error("Venta inexistente");

    const currentSaleType = sale.sale_type as SaleType | null;
    const currentStatus = sale.conditional_status as ConditionalStatus | null;

    if (currentSaleType !== "CONDITIONAL") {
      throw new Error("La venta no es condicional");
    }
    if (currentStatus !== "OPEN") {
      throw new Error("La venta condicional no está abierta");
    }

    if (!sale.customer_id) {
      throw new Error("La venta condicional debe tener cliente");
    }

    const total = sale.total_amount as number;
    const alreadyPaid = (sale.paid_amount as number | null) ?? 0;
    const newPaidTotal = alreadyPaid + input.paidAmount;

    if (newPaidTotal > total) {
      throw new Error("Pago mayor al total");
    }

    const pending = total - newPaidTotal;

    if (pending > 0 && !sale.customer_id) {
      throw new Error("Cliente requerido para saldo pendiente");
    }

    // Registrar pago en caja (si corresponde)
    if (input.paidAmount > 0) {
      const { data: cashMovs, error: cashError } = await supabase
        .from("cash_movements")
        .insert([
          {
            movement_type: "SALE",
            direction: "IN",
            amount: input.paidAmount,
            reference_type: "SALE",
            reference_id: sale.id,
            note: input.notes ?? null,
            payment_method: input.paymentMethod
          }
        ])
        .select("id");
      if (cashError) throw cashError;
      rollbackOps.push({
        table: "cash_movements",
        ids: (cashMovs ?? []).map((c) => c.id)
      });
    }

    // Registrar deuda (si corresponde)
    if (pending > 0) {
      const accountId = await getOrCreateAccount(sale.customer_id);
      const { data: accMovs, error: accError } = await supabase
        .from("account_movements")
        .insert([
          {
            account_id: accountId,
            movement_type: "DEBT",
            amount: pending,
            reference_type: "SALE",
            reference_id: sale.id
          }
        ])
        .select("id");
      if (accError) throw accError;
      rollbackOps.push({
        table: "account_movements",
        ids: (accMovs ?? []).map((a) => a.id)
      });

      const newBalance = (await getAccountBalance(accountId)) || 0;
      await updateAccountStatus(accountId, newBalance);
    }

    // Actualizar estado de la venta condicional
    const baseUpdate = {
      paid_amount: newPaidTotal,
      is_fiado: pending > 0,
      sale_type: "CONDITIONAL" as SaleType,
      conditional_status: "CONFIRMED" as ConditionalStatus
    };

    const { error: updateError } = await supabase
      .from("sales")
      .update({
        ...baseUpdate,
        payment_method: input.paymentMethod
      })
      .eq("id", sale.id);

    if (updateError) {
      if (updateError.message?.includes("payment_method")) {
        const { error: fallbackError } = await supabase
          .from("sales")
          .update(baseUpdate)
          .eq("id", sale.id);
        if (fallbackError) throw fallbackError;
      } else {
        throw updateError;
      }
    }

    return { ok: true, data: { saleId: sale.id, total, pending } };
  } catch (error) {
    await rollback(rollbackOps);
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

export async function returnConditionalSale(
  input: ReturnConditionalSaleInput
): Promise<ActionResult<{ saleId: string }>> {
  const rollbackOps: RollbackOp[] = [];

  try {
    const supabase = getSupabaseServerClient();

    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .select("id, sale_type, conditional_status")
      .eq("id", input.saleId)
      .maybeSingle();
    if (saleError) throw saleError;
    if (!sale) throw new Error("Venta inexistente");

    const currentSaleType = sale.sale_type as SaleType | null;
    const currentStatus = sale.conditional_status as ConditionalStatus | null;

    if (currentSaleType !== "CONDITIONAL") {
      throw new Error("La venta no es condicional");
    }
    if (currentStatus !== "OPEN") {
      throw new Error("Solo se pueden devolver condicionales abiertas");
    }

    const { data: items, error: itemsError } = await supabase
      .from("sale_items")
      .select("product_id, quantity")
      .eq("sale_id", sale.id);
    if (itemsError) throw itemsError;

    if (!items || items.length === 0) {
      throw new Error("La venta no tiene items");
    }

    const stockMovementsPayload = items.map((item) => ({
      product_id: item.product_id,
      movement_type: "ADJUSTMENT",
      quantity: item.quantity,
      reference_type: "SALE",
      reference_id: sale.id,
      channel: "LOCAL"
    }));

    const { data: stockMovements, error: stockError } = await supabase
      .from("stock_movements")
      .insert(stockMovementsPayload)
      .select("id");
    if (stockError) throw stockError;
    rollbackOps.push({
      table: "stock_movements",
      ids: (stockMovements ?? []).map((s) => s.id)
    });

    const { error: updateError } = await supabase
      .from("sales")
      .update({
        conditional_status: "RETURNED" as ConditionalStatus
      })
      .eq("id", sale.id);
    if (updateError) throw updateError;

    return { ok: true, data: { saleId: sale.id } };
  } catch (error) {
    await rollback(rollbackOps);
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

export async function payAccount(
  input: PayAccountInput
): Promise<ActionResult<{ accountId: string; balance: number }>> {
  const rollbackOps: RollbackOp[] = [];

  try {
    if (!input.customerId) throw new Error("Cliente inválido");
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("Monto inválido");
    }

    const supabase = getSupabaseServerClient();
    const { data: account, error: accountError } = await supabase
      .from("current_accounts")
      .select("id")
      .eq("customer_id", input.customerId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account?.id) throw new Error("Cuenta corriente inexistente");

    const balance = await getAccountBalance(account.id);
    if (balance <= 0) throw new Error("La cuenta no tiene deuda");
    if (input.amount > balance) throw new Error("Pago mayor al saldo");

    const { data: accMovs, error: accError } = await supabase
      .from("account_movements")
      .insert([
        {
          account_id: account.id,
          movement_type: "PAYMENT",
          amount: -input.amount,
          reference_type: "PAYMENT",
          note: input.notes ?? null
        }
      ])
      .select("id");
    if (accError) throw accError;
    rollbackOps.push({
      table: "account_movements",
      ids: (accMovs ?? []).map((a) => a.id)
    });

    const { data: cashMovs, error: cashError } = await supabase
      .from("cash_movements")
      .insert([
        {
          movement_type: "ACCOUNT_PAYMENT",
          direction: "IN",
          amount: input.amount,
          reference_type: "PAYMENT",
          note: input.notes ?? null,
          payment_method: input.paymentMethod
        }
      ])
      .select("id");
    if (cashError) throw cashError;
    rollbackOps.push({
      table: "cash_movements",
      ids: (cashMovs ?? []).map((c) => c.id)
    });

    const newBalance = balance - input.amount;
    await updateAccountStatus(account.id, newBalance);

    return { ok: true, data: { accountId: account.id, balance: newBalance } };
  } catch (error) {
    await rollback(rollbackOps);
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

export type ReversePaymentInput = { accountMovementId: string };

/** Anula un pago registrado: vuelve a sumar la deuda y saca el dinero de caja. */
export async function reversePayment(
  input: ReversePaymentInput
): Promise<ActionResult<{ accountId: string; balance: number }>> {
  const rollbackOps: RollbackOp[] = [];

  try {
    const supabase = getSupabaseServerClient();

    const { data: mov, error: movError } = await supabase
      .from("account_movements")
      .select("id, account_id, movement_type, amount")
      .eq("id", input.accountMovementId)
      .maybeSingle();
    if (movError) throw movError;
    if (!mov) throw new Error("Movimiento inexistente");
    if (mov.movement_type !== "PAYMENT") {
      throw new Error("Solo se puede anular un movimiento de tipo Pago");
    }
    const amount = Number(mov.amount ?? 0);
    if (amount >= 0) throw new Error("Movimiento de pago inválido");
    const absAmount = Math.abs(amount);

    const { data: accRow } = await supabase
      .from("current_accounts")
      .select("id")
      .eq("id", mov.account_id)
      .maybeSingle();
    if (!accRow?.id) throw new Error("Cuenta inexistente");

    const { data: debtMov, error: debtErr } = await supabase
      .from("account_movements")
      .insert([
        {
          account_id: mov.account_id,
          movement_type: "DEBT",
          amount: absAmount,
          reference_type: "PAYMENT_REVERSAL",
          reference_id: mov.id
        }
      ])
      .select("id")
      .single();
    if (debtErr) throw debtErr;
    rollbackOps.push({ table: "account_movements", ids: [debtMov.id] });

    const { data: cashMov, error: cashErr } = await supabase
      .from("cash_movements")
      .insert([
        {
          movement_type: "ACCOUNT_PAYMENT",
          direction: "OUT",
          amount: absAmount,
          reference_type: "PAYMENT_REVERSAL",
          reference_id: mov.id,
          payment_method: "CASH"
        }
      ])
      .select("id")
      .single();
    if (cashErr) throw cashErr;
    rollbackOps.push({ table: "cash_movements", ids: [cashMov.id] });

    const newBalance = (await getAccountBalance(accRow.id)) || 0;
    await updateAccountStatus(accRow.id, newBalance);

    return { ok: true, data: { accountId: accRow.id, balance: newBalance } };
  } catch (error) {
    await rollback(rollbackOps);
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

export type AddDebtInput = {
  customerId: string;
  amount: number;
  note?: string;
};

/** Agrega una deuda manual a la cuenta del cliente (sin venta). */
export async function addDebt(
  input: AddDebtInput
): Promise<ActionResult<{ accountId: string; balance: number }>> {
  try {
    if (!input.customerId) throw new Error("Cliente inválido");
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("El monto debe ser mayor a cero");
    }

    const accountId = await getOrCreateAccount(input.customerId);

    const supabase = getSupabaseServerClient();
    const { data: debtMov, error: debtErr } = await supabase
      .from("account_movements")
      .insert([
        {
          account_id: accountId,
          movement_type: "DEBT",
          amount: input.amount,
          reference_type: "MANUAL",
          note: input.note ?? null
        }
      ])
      .select("id")
      .single();
    if (debtErr) throw debtErr;

    const newBalance = (await getAccountBalance(accountId)) || 0;
    await updateAccountStatus(accountId, newBalance);

    return { ok: true, data: { accountId, balance: newBalance } };
  } catch (error) {
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

export async function createExchange(
  input: CreateExchangeInput
): Promise<ActionResult<{ exchangeId: string }>> {
  const rollbackOps: RollbackOp[] = [];

  try {
    if (!input.itemsIn?.length && !input.itemsOut?.length) {
      throw new Error("El cambio debe tener items");
    }

    validateItems(input.itemsIn ?? [], { allowEmpty: true });
    validateItems(input.itemsOut ?? [], { allowEmpty: true });

    if (!Number.isFinite(input.differenceAmount)) {
      throw new Error("Diferencia inválida");
    }

    const productIds = Array.from(
      new Set([
        ...input.itemsIn.map((i) => i.productId),
        ...input.itemsOut.map((i) => i.productId)
      ])
    );
    await ensureProductsExist(productIds);

    const stocks = await getStocks(productIds);
    for (const item of input.itemsOut) {
      const stock = stocks.get(item.productId) ?? 0;
      if (stock < item.qty) throw new Error("Stock insuficiente para entregar");
    }

    const supabase = getSupabaseServerClient();
    const { data: exchange, error: exchangeError } = await supabase
      .from("exchanges")
      .insert([
        {
          exchange_date: input.exchangeDate ?? new Date().toISOString(),
          customer_id: input.customerId ?? null,
          difference_amount: input.differenceAmount,
          note: input.notes ?? null
        }
      ])
      .select("id")
      .single();
    if (exchangeError) throw exchangeError;
    rollbackOps.push({ table: "exchanges", ids: [exchange.id] });

    if (input.itemsIn.length > 0) {
      const inPayload = input.itemsIn.map((item) => ({
        exchange_id: exchange.id,
        product_id: item.productId,
        quantity: item.qty
      }));
      const { data: itemsIn, error: inError } = await supabase
        .from("exchange_items_in")
        .insert(inPayload)
        .select("id");
      if (inError) throw inError;
      rollbackOps.push({
        table: "exchange_items_in",
        ids: (itemsIn ?? []).map((i) => i.id)
      });

      const stockInPayload = input.itemsIn.map((item) => ({
        product_id: item.productId,
        movement_type: "EXCHANGE_IN",
        quantity: item.qty,
        reference_type: "EXCHANGE",
        reference_id: exchange.id,
        channel: "LOCAL"
      }));
      const { data: stockIn, error: stockInError } = await supabase
        .from("stock_movements")
        .insert(stockInPayload)
        .select("id");
      if (stockInError) throw stockInError;
      rollbackOps.push({
        table: "stock_movements",
        ids: (stockIn ?? []).map((s) => s.id)
      });
    }

    if (input.itemsOut.length > 0) {
      const outPayload = input.itemsOut.map((item) => ({
        exchange_id: exchange.id,
        product_id: item.productId,
        quantity: item.qty
      }));
      const { data: itemsOut, error: outError } = await supabase
        .from("exchange_items_out")
        .insert(outPayload)
        .select("id");
      if (outError) throw outError;
      rollbackOps.push({
        table: "exchange_items_out",
        ids: (itemsOut ?? []).map((i) => i.id)
      });

      const stockOutPayload = input.itemsOut.map((item) => ({
        product_id: item.productId,
        movement_type: "EXCHANGE_OUT",
        quantity: -item.qty,
        reference_type: "EXCHANGE",
        reference_id: exchange.id,
        channel: "LOCAL"
      }));
      const { data: stockOut, error: stockOutError } = await supabase
        .from("stock_movements")
        .insert(stockOutPayload)
        .select("id");
      if (stockOutError) throw stockOutError;
      rollbackOps.push({
        table: "stock_movements",
        ids: (stockOut ?? []).map((s) => s.id)
      });
    }

    if (input.differenceAmount !== 0) {
      const isIn = input.differenceAmount > 0;
      const absAmount = Math.abs(input.differenceAmount);

      const { data: cashMovs, error: cashError } = await supabase
        .from("cash_movements")
        .insert([
          {
            movement_type: "ADJUSTMENT",
            direction: isIn ? "IN" : "OUT",
            amount: absAmount,
            reference_type: "EXCHANGE",
            reference_id: exchange.id,
            payment_method: "CASH"
          }
        ])
        .select("id");
      if (cashError) throw cashError;
      rollbackOps.push({
        table: "cash_movements",
        ids: (cashMovs ?? []).map((c) => c.id)
      });

      // Si differenceAmount < 0, el cliente queda con saldo a favor (CREDIT)
      if (!isIn && input.customerId) {
        const accountId = await getOrCreateAccount(input.customerId);
        const creditAmount = absAmount;

        const { data: accMovs, error: accError } = await supabase
          .from("account_movements")
          .insert([
            {
              account_id: accountId,
              movement_type: "CREDIT",
              // CREDIT disminuye el saldo deudor (saldo a favor del cliente)
              amount: -creditAmount,
              reference_type: "EXCHANGE",
              reference_id: exchange.id
            }
          ])
          .select("id");
        if (accError) throw accError;
        rollbackOps.push({
          table: "account_movements",
          ids: (accMovs ?? []).map((a) => a.id)
        });

        const newBalance = (await getAccountBalance(accountId)) || 0;
        await updateAccountStatus(accountId, newBalance);
      }
    }

    return { ok: true, data: { exchangeId: exchange.id } };
  } catch (error) {
    await rollback(rollbackOps);
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}
