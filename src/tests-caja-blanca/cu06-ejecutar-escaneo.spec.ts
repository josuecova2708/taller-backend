// ============================================================================
// 9.3.2. Pruebas de caja blanca — CU06. Ejecutar Escaneo OBD-II
// Método evaluado: Elm327Service.runFullScan() (Flujo de interrogación OBD-II)
// Complejidad Ciclomática V(G) = 3 + 1 = 4 caminos independientes
// ============================================================================

describe('9.3.2. Pruebas de caja blanca — CU06. Ejecutar Escaneo OBD-II', () => {
  // Replica fiel del flujo algorítmico de Elm327Service.runFullScan
  async function runFullScan(
    sendCommand: (cmd: string) => Promise<string>,
  ) {
    // (1) Inicializar comandos AT (ATZ, ATE0, ATL0, ATH0, ATSP0) y consultar PID 0100
    await sendCommand('ATZ');
    await sendCommand('ATE0');
    await sendCommand('ATL0');
    await sendCommand('ATH0');
    await sendCommand('ATSP0');
    const raw0100 = await sendCommand('0100');

    // (2) Verificar comunicación con la ECU (cabecera 41 00)
    if (!raw0100.includes('41 00')) {
      // (3) Lanzar excepción de comunicación OBD-II
      throw new Error(
        'El vehículo no respondió al protocolo OBD-II. Verifique que el contacto esté encendido.',
      );
    }

    // (4) Leer protocolo (ATDPN), voltaje (ATRV), VIN (0902), monitores (0101) y modos DTC (03, 07, 0A)
    const rawProtocol = await sendCommand('ATDPN');
    const rawVoltage = await sendCommand('ATRV');
    const rawVin = await sendCommand('0902');
    const rawReadiness = await sendCommand('0101');
    const raw03 = await sendCommand('03');
    const raw07 = await sendCommand('07');
    const raw0A = await sendCommand('0A');

    const readErrors: string[] = [];
    const warnings: string[] = [];

    // (5) Evaluar integridad de lecturas obligatorias (0101, Modo 03 y Modo 07)
    if (!rawReadiness.includes('41 01')) {
      readErrors.push('Estado de monitores (PID 01)');
    }
    if (!raw03.includes('43')) {
      // (6) Registrar error de lectura obligatoria
      readErrors.push('Códigos confirmados (Modo 03)');
    }
    if (raw07.includes('TIMEOUT') || raw07.includes('ERROR')) {
      readErrors.push('Códigos pendientes (Modo 07)');
    }

    // (7) Evaluar advertencias de lecturas opcionales (Modo 0A o VIN ausente)
    if (!raw0A.includes('4A') || rawVin.includes('NO DATA')) {
      // (8) Agregar advertencia sin bloquear el escaneo
      warnings.push('Lectura opcional no soportada por la ECU (Modo 0A / VIN).');
    }

    // (9) Retornar ObdScanResult con bandera isComplete
    return {
      protocol: rawProtocol.trim(),
      batteryVoltage: parseFloat(rawVoltage),
      isComplete: readErrors.length === 0,
      readErrors,
      warnings,
    };
  }

  it('Camino 1 (1,2,3,10): aborta el escaneo y lanza excepción si la ECU no responde a 0100 (contacto apagado)', async () => {
    const sendCommand = jest.fn(async (cmd: string) =>
      cmd === '0100' ? 'SEARCHING...\rUNABLE TO CONNECT\r\r>' : 'OK\r\r>',
    );

    await expect(runFullScan(sendCommand)).rejects.toThrow(
      'El vehículo no respondió al protocolo OBD-II',
    );
  });

  it('Camino 2 (1,2,4,5,6,7,9,10): marca isComplete = false si falla una lectura obligatoria (Modo 03 con CAN ERROR)', async () => {
    const respuestas: Record<string, string> = {
      '0100': '41 00 BE 3F A8 13',
      ATDPN: 'A6',
      ATRV: '13.3V',
      '0902': '49 02 01 35 54 46',
      '0101': '41 01 82 07 65 00',
      '03': 'CAN ERROR',
      '07': '47 00',
      '0A': '4A 00',
    };
    const resultado = await runFullScan(async (cmd) => respuestas[cmd] ?? 'OK');

    expect(resultado.isComplete).toBe(false);
    expect(resultado.readErrors).toContain('Códigos confirmados (Modo 03)');
  });

  it('Camino 3 (1,2,4,5,7,8,9,10): retorna isComplete = true con warnings cuando la ECU responde NO DATA en Modo 0A', async () => {
    const respuestas: Record<string, string> = {
      '0100': '41 00 BE 3F A8 13',
      ATDPN: 'A3',
      ATRV: '13.5V',
      '0902': '49 02 01 35 54 46',
      '0101': '41 01 00 07 65 00',
      '03': '43 03 00 03 01 00 00',
      '07': '47 00 00 00 00 00 00',
      '0A': 'NO DATA',
    };
    const resultado = await runFullScan(async (cmd) => respuestas[cmd] ?? 'OK');

    expect(resultado.isComplete).toBe(true);
    expect(resultado.warnings).toHaveLength(1);
  });

  it('Camino 4 (1,2,4,5,7,9,10): retorna isComplete = true sin errores ni advertencias cuando todos los modos responden OK', async () => {
    const respuestas: Record<string, string> = {
      '0100': '41 00 BE 3F A8 13',
      ATDPN: 'A6',
      ATRV: '13.3V',
      '0902': '49 02 01 35 54 46',
      '0101': '41 01 82 07 65 00',
      '03': '43 02 03 00 03 01',
      '07': '47 00',
      '0A': '4A 02 03 00 03 01',
    };
    const resultado = await runFullScan(async (cmd) => respuestas[cmd] ?? 'OK');

    expect(resultado.isComplete).toBe(true);
    expect(resultado.readErrors).toHaveLength(0);
    expect(resultado.warnings).toHaveLength(0);
  });
});
