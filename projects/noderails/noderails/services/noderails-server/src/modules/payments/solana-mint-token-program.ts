import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';

/** Returns which SPL program owns this mint (classic Token or Token-2022). */
export async function resolveMintTokenProgramId(
  conn: Connection,
  mint: PublicKey,
): Promise<PublicKey | null> {
  const info = await conn.getAccountInfo(mint, 'finalized');
  if (!info) {
    return null;
  }
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  if (info.owner.equals(TOKEN_PROGRAM_ID)) {
    return TOKEN_PROGRAM_ID;
  }
  return null;
}
