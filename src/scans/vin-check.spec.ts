import { normalizarVin, vinEnConflicto } from './vin-check';

describe('vinEnConflicto', () => {
  const VIN_A = '5TFCZ5AN3MX255216';
  const VIN_B = '8AJBA3CD201928374';

  it('detecta que el VIN leído es de otro vehículo', () => {
    expect(vinEnConflicto(VIN_A, VIN_B)).toBe(true);
  });

  it('acepta el mismo VIN aunque cambien mayúsculas o espacios', () => {
    expect(vinEnConflicto(VIN_A, ` ${VIN_A.toLowerCase()} `)).toBe(false);
  });

  it('no hay conflicto si el vehículo no tiene VIN registrado', () => {
    expect(vinEnConflicto(null, VIN_B)).toBe(false);
    expect(vinEnConflicto('', VIN_B)).toBe(false);
  });

  it('no hay conflicto si la ECU no reportó VIN', () => {
    expect(vinEnConflicto(VIN_A, undefined)).toBe(false);
    expect(vinEnConflicto(VIN_A, '   ')).toBe(false);
  });

  it('ignora una lectura parcial del VIN', () => {
    expect(vinEnConflicto(VIN_A, '8AJBA3CD2019')).toBe(false);
  });
});

describe('normalizarVin', () => {
  it('devuelve null para valores vacíos', () => {
    expect(normalizarVin(undefined)).toBeNull();
    expect(normalizarVin('  ')).toBeNull();
  });

  it('recorta y pasa a mayúsculas', () => {
    expect(normalizarVin(' abc123 ')).toBe('ABC123');
  });
});
