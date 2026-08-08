import { parseStructTag } from '@mysten/sui/utils';

const MOVE_TYPE_ADDRESS_HEX_LEN = 64;

/**
 * Canonical coin type string for auth preimages — must match Move
 * `std::type_name::as_string(type_name::with_defining_ids<T>())`:
 * 64-char unprefixed hex address + `::module::Name` (no `0x` prefix).
 */
export function coinTypeToMoveTypeName(coinType: string): string {
  const { address, module, name, typeParams } = parseStructTag(coinType);
  const addrHex = address.slice(2).padStart(MOVE_TYPE_ADDRESS_HEX_LEN, '0');
  const params =
    typeParams.length > 0
      ? `<${typeParams
          .map((p) => (typeof p === 'string' ? coinTypeToMoveTypeName(p) : String(p)))
          .join(',')}>`
      : '';
  return `${addrHex}::${module}::${name}${params}`;
}
