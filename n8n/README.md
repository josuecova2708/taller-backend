# Flujos de n8n

Dos flujos para importar en n8n, escritos para la versión 1.80.0. No traen credenciales: se crean en n8n al importar. Todavía no se probaron importándolos en la instancia real; si algún nodo aparece con un aviso al abrirlo, basta con volver a elegir su operación.

| Archivo | Qué hace | Caso de uso |
|---|---|---|
| `taller-scan-alert.json` | Recibe del backend el aviso de una orden de trabajo nueva y lo envía por Telegram (y por correo, si se activa ese nodo) | CU17 |
| `taller-resumen-diario.json` | De lunes a sábado a las 7:30 pide al backend el resumen de órdenes sin cerrar y vehículos sin escaneo, y lo envía por Telegram (y correo) | CU19 |

El texto de cada mensaje lo redacta el backend (`src/n8n/n8n.messages.ts`); los flujos solo deciden por qué canal sale.

## Antes de importar: dos claves

Genere dos valores al azar, uno para cada clave:

```
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Guárdelos en el `.env` del backend:

```
N8N_WEBHOOK_SECRET="<primer valor>"
N8N_SERVICE_KEY="<segundo valor>"
APP_PUBLIC_URL="<dirección pública de la web>"
```

## Importar y configurar

En cada flujo: menú **⋯ → Import from file**, y luego:

### `taller-scan-alert.json`

1. Nodo **Orden creada (webhook)** → *Credential for Header Auth* → crear una nueva con **Name** `X-Webhook-Secret` y **Value** igual a `N8N_WEBHOOK_SECRET`.
2. Nodo **Avisar por Telegram** → elegir la credencial del bot y reemplazar `CAMBIAR_POR_EL_CHAT_ID` por el identificador del chat o grupo.
3. Activar el flujo y copiar la **Production URL** del webhook (termina en `/webhook/taller-scan-alert`) al `.env` del backend:

   ```
   N8N_WEBHOOK_URL="https://<su-n8n>/webhook/taller-scan-alert"
   ```

4. Reiniciar el backend.

### `taller-resumen-diario.json`

1. Nodo **Pedir resumen al backend** → ya trae la dirección del backend en Azure. En *Credential for Header Auth* crear una con **Name** `X-Service-Key` y **Value** igual a `N8N_SERVICE_KEY`. Espera hasta 60 s y reintenta dos veces, porque el backend puede tardar en despertar si estaba apagado.
2. Nodo **Enviar por Telegram** → credencial del bot e identificador del chat.
3. Activar el flujo. Para probarlo sin esperar a las 7:30, usar **Test workflow**.

### Correo (opcional)

Los nodos de correo vienen desactivados. Cuando haya un proveedor SMTP: crear la credencial SMTP, completar remitente y destinatario, y activar el nodo.

## Cómo probar

- **Alerta:** registrar un escaneo con falla (desde la app o con «Datos de demostración» en la web). Debe llegar el mensaje y, en la orden, «Aviso al equipo» pasa a «Enviado». Si n8n no estaba disponible, el botón «Enviar aviso» de la orden lo reintenta.
- **Resumen:** desde una terminal,

  ```
  curl -H "X-Service-Key: <N8N_SERVICE_KEY>" http://localhost:3000/api/n8n/daily-summary
  ```

  devuelve el resumen con el campo `mensaje` que envía el flujo.

El backend tiene que ser alcanzable desde n8n: con n8n en Azure y el backend en `localhost`, la alerta funciona (el backend llama a n8n) pero el resumen diario no (n8n no puede llamar a `localhost`) hasta que el backend esté desplegado.
