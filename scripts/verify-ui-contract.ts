/**
 * Verifica que el backend devuelva exactamente las formas que consumen las
 * páginas del dashboard.
 *
 * Motivo: la lista de escaneos tipeaba `diagnosis.recommendations` como
 * `string[]` y lo renderizaba con `.map()`. Al pasar a un objeto estructurado,
 * `Array.isArray()` daba false y la hipótesis desaparecía de la pantalla SIN
 * error visible. Un desajuste de forma no rompe el build ni los tests: hay que
 * comprobarlo contra el servidor.
 *
 * Uso: PORT=3100 AI_PROVIDER=mock node dist/main.js  (en otra terminal)
 *      npx ts-node scripts/verify-ui-contract.ts
 */
import 'dotenv/config';

const API = process.env.VERIFY_API ?? 'http://localhost:3100/api';

let fallos = 0;

function check(nombre: string, condicion: boolean, detalle?: string) {
  if (condicion) {
    console.log(`  ok    ${nombre}`);
  } else {
    fallos += 1;
    console.log(`  FALLA ${nombre}${detalle ? ' -> ' + detalle : ''}`);
  }
}

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function get(path: string, token: string) {
  const res = await fetch(API + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function patch(path: string, body: unknown, token: string) {
  const res = await fetch(API + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function del(path: string, token: string) {
  const res = await fetch(API + path, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.status;
}

async function main() {
  const login = await post('/auth/login', {
    email: 'admin@uagrm.edu.bo',
    password: 'taller123',
  });
  if (login.status !== 200) {
    throw new Error('No se pudo autenticar: ' + JSON.stringify(login.body));
  }
  const token = login.body.accessToken as string;

  console.log('\n[1] Sesión que consume AuthProvider');
  check('user.permissions es un arreglo', Array.isArray(login.body.user?.permissions));
  check('user.roleLabel presente', typeof login.body.user?.roleLabel === 'string');

  const vehiculo = await post(
    '/vehicles',
    { plate: 'UI-CONTRACT', make: 'Toyota', model: 'Hilux', year: 2019 },
    token,
  );
  const vehicleId = vehiculo.body?.id as string;

  try {
    const scan = await post(
      '/scans',
      {
        vehicleId,
        batteryVoltage: 13.2,
        readinessStatus: {
          milOn: true,
          dtcCount: 2,
          monitorsCompleted: true,
          incompleteMonitors: [],
          compressionIgnition: false,
          rawHex: '41 01 82 07 65 00',
        },
        protocol: {
          number: '6',
          automatic: true,
          isCan: true,
          label: 'ISO 15765-4 CAN (11 bit, 500 kbaud)',
          raw: 'A6',
        },
        dtcs: [
          { code: 'P0300', type: 'CONFIRMED' },
          { code: 'P0301', type: 'CONFIRMED' },
        ],
      },
      token,
    );

    console.log('\n[2] Respuesta de POST /scans que lee la lista');
    check('status 201', scan.status === 201, String(scan.status));
    check('diagnosis.requested presente', typeof scan.body?.diagnosis?.requested === 'boolean');
    check('workOrderId presente', typeof scan.body?.workOrderId === 'string');

    const scanId = scan.body.scan.id as string;

    // El proveedor mock responde al instante, pero la escritura va en segundo
    // plano: se espera un momento antes de leer.
    await new Promise((r) => setTimeout(r, 2500));

    const detalle = await get(`/scans/${scanId}`, token);
    const s = detalle.body;

    console.log('\n[3] GET /scans/:id — contrato de la página de detalle');
    check('status 200', detalle.status === 200);
    check('aiProcessed es booleano', typeof s?.aiProcessed === 'boolean');
    check('protocol.label legible', typeof s?.protocol?.label === 'string', s?.protocol?.label);
    check(
      'readinessStatus.compressionIgnition presente',
      typeof s?.readinessStatus?.compressionIgnition === 'boolean',
    );
    check('dtcEntries[].description presente', typeof s?.dtcEntries?.[0]?.description === 'string');
    check('notes (dictamen determinístico) presente', typeof s?.notes === 'string');
    check('vehicle.plate presente', typeof s?.vehicle?.plate === 'string');
    check('scannedBy.name presente', typeof s?.scannedBy?.name === 'string');
    check('workOrder embebido', typeof s?.workOrder?.id === 'string');

    console.log('\n[4] Forma de la hipótesis (el desajuste que se corrigió)');
    const d = s?.diagnosis;
    check('diagnosis presente', !!d);
    check('summary es string', typeof d?.summary === 'string');
    check('severity es string', typeof d?.severity === 'string');
    check(
      'recommendations NO es un arreglo (es objeto estructurado)',
      !!d?.recommendations && !Array.isArray(d.recommendations),
    );
    check(
      'recommendations.probableCauses es arreglo',
      Array.isArray(d?.recommendations?.probableCauses),
    );
    check(
      'probableCauses[].confidence en {ALTA,MEDIA,BAJA}',
      ['ALTA', 'MEDIA', 'BAJA'].includes(d?.recommendations?.probableCauses?.[0]?.confidence),
      d?.recommendations?.probableCauses?.[0]?.confidence,
    );
    check(
      'recommendations.verificationSteps es arreglo de strings',
      Array.isArray(d?.recommendations?.verificationSteps) &&
        typeof d.recommendations.verificationSteps[0] === 'string',
    );
    check(
      'recommendations.correlations es string o null',
      d?.recommendations?.correlations === null ||
        typeof d?.recommendations?.correlations === 'string',
    );

    const orderId = s?.workOrder?.id as string;

    const orden = await get(`/work-orders/${orderId}`, token);
    const o = orden.body;

    console.log('\n[5] GET /work-orders/:id — contrato de la página de orden');
    check('status 200', orden.status === 200);
    check('vehicle.status presente', typeof o?.vehicle?.status === 'string');
    check('scan.dtcEntries presente', Array.isArray(o?.scan?.dtcEntries));
    check('diagnosis embebido', !!o?.diagnosis);
    check(
      'diagnosis.recommendations.probableCauses accesible',
      Array.isArray(o?.diagnosis?.recommendations?.probableCauses),
    );

    console.log('\n[6] Acciones que disparan los botones de la UI');
    const avance = await patch(
      `/work-orders/${orderId}/status`,
      { status: 'IN_PROGRESS', notes: 'Revisando bobinas del cilindro 1.' },
      token,
    );
    check('PATCH /:id/status acepta {status, notes}', avance.status === 200, String(avance.status));

    const users = await get('/auth/users', token);
    check('GET /auth/users para el selector', users.status === 200 && Array.isArray(users.body));

    const asignacion = await patch(
      `/work-orders/${orderId}/assign`,
      { assignedToId: users.body?.find((u: any) => u.role === 'MECHANIC')?.id ?? null },
      token,
    );
    check('PATCH /:id/assign acepta {assignedToId}', asignacion.status === 200);

    const cierre = await post(
      `/work-orders/${orderId}/close`,
      { status: 'COMPLETED', resolution: 'Bobina reemplazada y verificada.' },
      token,
    );
    check('POST /:id/close acepta {status, resolution}', cierre.status === 201, String(cierre.status));
    check(
      'close devuelve vehicleStatus para el aviso de la UI',
      'vehicleStatus' in (cierre.body ?? {}),
      JSON.stringify(cierre.body?.vehicleStatus),
    );

    const rechazo = await post(
      `/work-orders/${orderId}/close`,
      { status: 'COMPLETED', resolution: 'otra vez' },
      token,
    );
    check('cerrar dos veces es rechazado', rechazo.status === 409, String(rechazo.status));
  } finally {
    if (vehicleId) {
      const estado = await del(`/vehicles/${vehicleId}`, token);
      console.log(`\n[limpieza] DELETE vehículo de prueba -> ${estado}`);
    }
  }

  console.log(
    fallos === 0
      ? '\nTodas las comprobaciones de contrato pasaron.'
      : `\n${fallos} comprobación(es) fallaron.`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nERROR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
