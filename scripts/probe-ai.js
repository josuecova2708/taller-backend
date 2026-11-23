"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const claude_provider_1 = require("../src/ai/providers/claude.provider");
const diagnosis_schema_1 = require("../src/ai/diagnosis.schema");
const PRECIOS = {
    'claude-opus-5': { entrada: 5, salida: 25 },
    'claude-sonnet-5': { entrada: 2, salida: 10 },
    'claude-haiku-4-5': { entrada: 1, salida: 5 },
};
const input = {
    vehicle: {
        plate: '5521-TAC',
        alias: 'Camioneta Rectorado',
        make: 'Toyota',
        model: 'Tacoma',
        year: 2021,
        vin: 'TESTTAC0000000001',
    },
    scan: { scannedAt: new Date(), batteryVoltage: 13.3 },
    readiness: {
        milOn: true,
        dtcCount: 4,
        monitorsCompleted: true,
        incompleteMonitors: [],
        batteryResetSuspected: false,
    },
    dtcs: [
        {
            code: 'P0300',
            type: client_1.DtcType.CONFIRMED,
            description: 'Fallo de encendido aleatorio o en múltiples cilindros detectado',
            isRecurrent: true,
        },
        {
            code: 'P0301',
            type: client_1.DtcType.CONFIRMED,
            description: 'Fallo de encendido detectado en el cilindro 1',
            isRecurrent: false,
        },
        {
            code: 'P2195',
            type: client_1.DtcType.PENDING,
            description: 'Señal del sensor de oxígeno (A/F) atascada en mezcla pobre (Banco 1 Sensor 1)',
            isRecurrent: false,
        },
    ],
    deterministic: {
        severity: client_1.ScanSeverity.CRITICAL,
        rationale: 'Se detectaron 2 códigos CONFIRMADOS (Mode 03) con recurrencia histórica (P0300). ' +
            'Se escala al asistente IA para generar hipótesis técnica.',
        recurrentCodes: ['P0300'],
    },
    history: [
        {
            scannedAt: new Date('2026-10-01T09:00:00.000Z'),
            severity: client_1.ScanSeverity.HIGH,
            codes: ['P0300'],
        },
        {
            scannedAt: new Date('2026-09-15T10:30:00.000Z'),
            severity: client_1.ScanSeverity.NONE,
            codes: [],
        },
    ],
};
async function main() {
    const model = (process.env.AI_MODEL || 'claude-sonnet-5').replace(/["']/g, '').trim();
    const effortRaw = (process.env.AI_EFFORT || 'low').replace(/["']/g, '').trim();
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').replace(/["']/g, '').trim();
    const maxTokens = Number.parseInt((process.env.AI_MAX_TOKENS || '8192').replace(/["']/g, '').trim(), 10);
    const effort = /haiku/i.test(model) ? null : effortRaw;
    console.log(`Modelo: ${model} | effort: ${effort ?? 'n/a'} | max_tokens: ${maxTokens}\n`);
    const provider = new claude_provider_1.ClaudeProvider({ apiKey, model, effort, maxTokens });
    const result = await provider.diagnose(input);
    const h = result.hypothesis;
    console.log('='.repeat(72));
    console.log('RESUMEN (hipótesis)');
    console.log('='.repeat(72));
    console.log(h.summary);
    console.log('\n' + '='.repeat(72));
    console.log(`SEVERIDAD SUGERIDA: ${h.severity}   (reglas: ${input.deterministic.severity})`);
    console.log('='.repeat(72));
    console.log('\nCAUSAS PROBABLES');
    h.probableCauses.forEach((c, i) => console.log(`  ${i + 1}. [${c.confidence}] ${c.cause}`));
    console.log('\nPASOS DE VERIFICACIÓN');
    h.verificationSteps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    console.log('\nCORRELACIONES');
    console.log(`  ${h.correlations ?? '(ninguna)'}`);
    console.log('\n' + '='.repeat(72));
    console.log('VALIDACIÓN Y COSTO');
    console.log('='.repeat(72));
    const valida = diagnosis_schema_1.DiagnosisHypothesisSchema.safeParse(h);
    console.log(`Valida contra el esquema : ${valida.success ? 'sí' : 'NO -> ' + valida.error}`);
    console.log(`Latencia                 : ${result.latencyMs} ms`);
    console.log(`Tokens totales           : ${result.tokensUsed ?? 'n/d'}`);
    const precio = PRECIOS[model];
    if (precio && result.tokensUsed) {
        const entradaAprox = Math.round(result.prompt.length / 4) + 700;
        const salidaAprox = Math.max(result.tokensUsed - entradaAprox, 0);
        const costo = (entradaAprox / 1_000_000) * precio.entrada +
            (salidaAprox / 1_000_000) * precio.salida;
        console.log(`Costo estimado           : $${costo.toFixed(5)} USD`);
        console.log(`Llamadas por $2          : ~${Math.floor(2 / costo)}`);
    }
}
main().catch((e) => {
    console.error('\nFALLÓ:', e instanceof Error ? e.message : e);
    process.exit(1);
});
//# sourceMappingURL=probe-ai.js.map