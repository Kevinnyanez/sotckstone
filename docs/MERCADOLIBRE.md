# Integración Mercado Libre – Documentación

Documentación de la funcionalidad de Mercado Libre en la app: OAuth, vinculación de productos, sincronización bidireccional de stock y flujos de venta.

---

## 1. Resumen rápido

| Qué tenés | Dónde |
|-----------|--------|
| Conexión de cuenta ML (OAuth) | Integraciones → Mercado Libre; tokens en `mercadolibre_oauth` |
| Vinculación producto app ↔ publicación ML | Integraciones → Mercado Libre (connected); tabla `external_variants` |
| **Venta en ML** → descuenta stock en la app | Webhook `POST /api/mercadolibre/webhook` + `processMercadoLibreSale` |
| **Venta en la app (POS)** → actualiza stock en ML | En `createSale` (canal PHYSICAL) se llama `syncStockToMercadoLibre` |

**Sí está configurado:** cuando vendés por la app (POS, venta física), el stock resultante se envía a ML para los productos vinculados. Cuando vendés en ML, el webhook descuenta stock en la app.

---

## 2. Componentes involucrados

### 2.1 Base de datos (Supabase)

- **`mercadolibre_oauth`**  
  Una fila por entorno: `access_token`, `refresh_token`, `expires_at`, `user_id` (seller_id de ML). Se usa para llamar a la API de ML y para validar el `user_id` del webhook.

- **`external_variants`**  
  Vinculación producto de la app ↔ ítem/variante en ML.
  - `product_id`: UUID del producto en la app.
  - `platform`: `"mercadolibre"`.
  - `external_item_id`: ID del ítem en ML (para actualizar stock con `PUT /items/{id}`).
  - `external_variation_id`: ID de la variación en ML (para identificar la variante en pedidos y webhook).

- **`stock_movements`**  
  Movimientos de stock. Los de venta ML tienen:
  - `movement_type`: `SALE_MERCADOLIBRE`
  - `reference_type`: `MERCADOLIBRE_ORDER`
  - `reference_id`: `{order_id}` o `{order_id}-{índice}` (idempotencia ante reintentos del webhook).
  - `channel`: `MERCADOLIBRE`.

### 2.2 OAuth (conexión de cuenta ML)

- **Flujo:** Usuario hace clic en “Conectar Mercado Libre” → redirige a ML → autoriza → callback a la app → se intercambia `code` por tokens y se guardan en `mercadolibre_oauth`.
- **Rutas:** `GET /api/mercadolibre/auth` (redirige a ML), `GET /api/mercadolibre/callback` (recibe `code`, guarda tokens).
- **Tokens:** `getValidAccessToken()` en `lib/mercadolibre/auth.ts` devuelve un access token válido; si faltan menos de 60 segundos para `expires_at`, renueva con `refreshAccessToken` y actualiza la fila en Supabase. No se loguean ni exponen tokens ni secretos.

### 2.3 Vinculación de productos

- **UI:** En **Integraciones → Mercado Libre** (pestaña “Conectado”) se listan productos de la app y productos vinculados a ML. Para vincular: elegís producto local, `external_item_id` e `external_variation_id` de la publicación en ML.
- **Acciones:** `createMercadoLibreLink` y `deleteMercadoLibreLink` en `lib/mercadolibre/actions.ts` (insert/delete en `external_variants`).
- Sin vinculación no hay sincronización: el webhook no puede mapear variante → producto y la app no sabe a qué ítem de ML mandar el stock.

---

## 3. Sincronización bidireccional

### 3.1 Dirección: Venta en Mercado Libre → Stock en la app

**Qué pasa cuando vendés en la cuenta de ML conectada:**

1. Mercado Libre envía una notificación (webhook) a tu servidor:  
   `POST /api/mercadolibre/webhook`  
   Payload típico: `topic: "orders"` (o `"marketplace_orders"`), `resource: "/orders/200000123456"`, `user_id`, etc.

2. El endpoint:
   - Responde **200 en todos los casos** (para no provocar reintentos de ML).
   - Comprueba que el `user_id` del webhook coincida con el `user_id` guardado en `mercadolibre_oauth`.
   - Si `topic` es de órdenes, extrae el `order_id` de `resource` (o `resource_id`).
   - Con `getValidAccessToken()` llama a `GET https://api.mercadolibre.com/orders/{order_id}`.
   - De la respuesta usa `order_items[]`: por cada ítem, `item.variation_id` y `quantity`.

3. Por cada ítem del pedido se llama a **`processMercadoLibreSale`** (`lib/mercadolibre/processSale.ts`):
   - `reference_id` = `{order_id}-{índice}` para evitar procesar dos veces el mismo ítem (idempotencia).
   - Si ya existe un movimiento con ese `reference_type` + `reference_id`, devuelve `ok: true, duplicate: true` y no hace nada.
   - Busca en `external_variants` el `product_id` asociado a ese `external_variation_id`.
   - Si hay stock suficiente, inserta en `stock_movements` un OUT (SALE_MERCADOLIBRE, MERCADOLIBRE_ORDER, channel MERCADOLIBRE).

**Resumen:** Venta en ML → webhook → descuento de stock en la app para los productos que estén vinculados. Si el producto no está vinculado o no hay stock, se registra el fallo en logs pero se responde 200.

---

### 3.2 Dirección: Venta en la app (POS) → Stock en Mercado Libre

**Qué pasa cuando vendés desde la app (POS, venta física):**

1. En **`createSale`** (`lib/pos.ts`), después de registrar la venta y los movimientos de stock (canal LOCAL, SALE_PHYSICAL), si el **canal de la venta es `PHYSICAL`**:
   - Por cada ítem vendido se calcula el stock restante: `remaining = stock_inicial - cantidad_vendida`.
   - Se llama en segundo plano (sin bloquear la respuesta) a **`syncStockToMercadoLibre(productId, remaining)`**.

2. **`syncStockToMercadoLibre`** (`lib/mercadolibre/api.ts`):
   - Obtiene un token con `getValidAccessToken()`.
   - Busca en `external_variants` el/los registros con ese `product_id` y `platform = "mercadolibre"`.
   - Si no hay vinculación, no hace nada (devuelve `ok: true`).
   - Hace `PUT https://api.mercadolibre.com/items/{external_item_id}` con `body: { available_quantity: quantity }` (el `quantity` es el stock restante en la app).

**Resumen:** Venta en la app (física) → se actualiza el stock del ítem en ML con la cantidad que quedó en la app. **Esto ya está implementado y activo** para ventas con canal PHYSICAL. Si la sincronización falla (token, red, etc.), la venta en la app no se revierte; solo se intenta enviar el nuevo stock a ML.

**Nota:** La API de ML para ítems con **variaciones** puede requerir actualizar `variations[*].available_quantity` en lugar del `available_quantity` del ítem. La implementación actual asume el caso simple (un solo SKU o ítem sin variaciones). Si tenés ítems con varias variaciones en ML, puede hacer falta adaptar el payload del PUT.

---

## 4. Flujos por escenario

### 4.1 “Vendo en la cuenta de ML conectada”

- ML envía webhook → `POST /api/mercadolibre/webhook`.
- Se obtiene la orden, se descuenta stock en la app por cada ítem vinculado (vía `processMercadoLibreSale`).
- No se hace ninguna llamada “hacia ML” para esa venta (la venta ya ocurrió en ML).

### 4.2 “Vendo desde la app (POS, venta en local)”

- Se registra la venta y los movimientos de stock en la app.
- Para cada producto vendido que esté vinculado a ML, se llama a `syncStockToMercadoLibre(productId, stock_restante)` en segundo plano.
- ML recibe el nuevo `available_quantity` vía `PUT /items/{external_item_id}`. **Ya está configurado.**

### 4.3 “Venta en la app con canal MERCADOLIBRE”

- Si en el POS se registra una venta con canal `MERCADOLIBRE`, se guardan movimientos con `SALE_MERCADOLIBRE` y channel MERCADOLIBRE, pero **no** se llama a `syncStockToMercadoLibre` en ese camino (esa llamada solo se hace cuando el canal es `PHYSICAL`).  
- El descuento “real” por venta en ML se hace cuando llega el webhook; el canal MERCADOLIBRE en la app sirve para reflejar ventas que ya se descontaron por webhook o para coherencia de reportes.

---

## 5. Endpoints y rutas

| Ruta | Método | Uso |
|------|--------|-----|
| `/api/mercadolibre/auth` | GET | Redirige a ML para autorizar (OAuth). |
| `/api/mercadolibre/callback` | GET | Recibe `code`, guarda tokens en `mercadolibre_oauth`. |
| `/api/mercadolibre/status` | GET | Estado de configuración (Client ID, Secret, Redirect URI, si hay cuenta conectada). No expone secretos. |
| `/api/mercadolibre/webhook` | POST | Recibe notificaciones de ML (órdenes). Responde 200, valida `user_id`, obtiene orden, descuenta stock con `processMercadoLibreSale`. |
| `/api/simulate/mercadolibre-sale` | POST | Prueba manual: body `{ external_variation_id, quantity?, reference_id? }`. Usa la misma lógica que el webhook (`processMercadoLibreSale`). |

Para producción, en el panel de integraciones de Mercado Libre hay que configurar la URL del webhook:  
`https://tu-dominio.com/api/mercadolibre/webhook`  
y suscribir el tema de órdenes (por ejemplo `orders` o el que indique la documentación de tu app).

---

## 6. Variables de entorno

- `MERCADOLIBRE_CLIENT_ID`: Client ID de la aplicación en el DevCenter de ML.
- `MERCADOLIBRE_CLIENT_SECRET`: Client Secret.
- `MERCADOLIBRE_REDIRECT_URI`: URL de callback (debe coincidir exactamente con la configurada en ML), por ejemplo `https://tu-dominio.com/api/mercadolibre/callback`.

---

## 7. Resumen: qué está y qué no

- **OAuth:** Implementado (conexión de cuenta, refresh, guardado en Supabase).
- **Vinculación producto ↔ ML:** Implementado (UI en integraciones + `external_variants`).
- **Venta en ML → descuenta en app:** Implementado (webhook + `processMercadoLibreSale`).
- **Venta en app (POS física) → actualiza stock en ML:** Implementado (`syncStockToMercadoLibre` al vender por canal PHYSICAL).
- **Ítems con varias variaciones en ML:** Caso simple cubierto (un ítem, un `available_quantity`); variaciones múltiples pueden requerir ajuste del PUT al ítem/variaciones.

Si querés, en un siguiente paso se puede bajar esto a un diagrama de flujo (Mermaid) o a una sección “Cómo probar” paso a paso.
