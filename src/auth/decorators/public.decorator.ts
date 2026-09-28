import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como accesible sin token.
 *
 * El `JwtAuthGuard` está registrado de forma global: todo endpoint exige token
 * salvo que lleve este decorador explícitamente. El default es cerrado.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
