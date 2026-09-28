/**
 * Validación de variables de entorno al arrancar.
 *
 * Motivo: un `JWT_SECRET` ausente con valor por defecto permitiría a cualquiera
 * firmar tokens válidos. El sistema debe negarse a arrancar antes que arrancar
 * de forma insegura.
 */
const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET'] as const;

const INSECURE_SECRETS = [
  'default-secret',
  'your-secret-key-here',
  'secret',
  'changeme',
];

const MIN_SECRET_LENGTH = 32;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED_VARS.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Variables de entorno obligatorias ausentes: ${missing.join(', ')}. ` +
        'Copie .env.example a .env y complete los valores antes de iniciar el backend.',
    );
  }

  const jwtSecret = String(config.JWT_SECRET).trim();

  if (INSECURE_SECRETS.includes(jwtSecret.toLowerCase())) {
    throw new Error(
      'JWT_SECRET tiene un valor de ejemplo. Genere uno real, por ejemplo con: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }

  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres (actual: ${jwtSecret.length}).`,
    );
  }

  return config;
}
