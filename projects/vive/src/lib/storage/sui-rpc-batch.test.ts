import { describe, expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import { DirEntry } from "../../contracts/content_vault/directory";
import {
  deriveDynamicFieldId,
  skipDynamicFieldWrapper,
} from "./sui-rpc-batch";

describe("sui-rpc-batch", () => {
  test("skipDynamicFieldWrapper extracts inline table values", () => {
    const nameBcs = bcs.vector(bcs.u8()).serialize([1, 2, 3]).toBytes();
    const valueBcs = DirEntry.serialize({
      is_directory: false,
      object_id: "0x" + "ab".repeat(32),
    }).toBytes();
    const fieldContent = new Uint8Array(32 + nameBcs.length + valueBcs.length);
    fieldContent.set(new Uint8Array(32), 0);
    fieldContent.set(nameBcs, 32);
    fieldContent.set(valueBcs, 32 + nameBcs.length);

    const extracted = skipDynamicFieldWrapper(fieldContent, nameBcs.length);
    expect(extracted).not.toBeNull();
    const parsed = DirEntry.parse(extracted!);
    expect(parsed.is_directory).toBe(false);
    expect(parsed.object_id).toBe("0x" + "ab".repeat(32));
  });

  test("deriveDynamicFieldId is stable for u64 version keys", () => {
    const parentId = "0x" + "01".repeat(32);
    const key = bcs.u64().serialize(3).toBytes();
    const first = deriveDynamicFieldId(parentId, "u64", key);
    const second = deriveDynamicFieldId(parentId, "u64", key);
    expect(first).toBe(second);
    expect(first.startsWith("0x")).toBe(true);
  });
});
