
/**
 * Parses a human duration ('30s', '15m', '1h', '7d') into seconds.
 *
 * `@nestjs/jwt` wants `expiresIn` as a number of seconds when the type is
 * `number`, and it rejects a bare string. Parsing here keeps the `.env` value
 * human and the module option a plain number.
 */
export function parseDurationSeconds(raw: string): number {
  const match = /^\s*(\d+)\s*([smhd]?)\s*$/i.exec(raw);
  if (!match) throw new Error(`JWT_EXPIRES_IN is not a valid duration: ${raw}`);
  const n = Number(match[1]);
  switch (match[2].toLowerCase()) {
    case 's':
    case '':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      throw new Error(`JWT_EXPIRES_IN is not a valid duration: ${raw}`);
  }
}
