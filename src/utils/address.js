export function normalizeAddress(address) {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  return address.toLowerCase();
}

export function addressFromWord(hex) {
  if (typeof hex !== "string" || !hex.startsWith("0x")) {
    return null;
  }

  const body = hex.slice(2).padStart(64, "0");
  const tail = body.slice(-40);

  if (/^0+$/.test(tail)) {
    return null;
  }

  return `0x${tail}`.toLowerCase();
}

export function hexToBigInt(hex) {
  if (!hex || hex === "0x") {
    return 0n;
  }

  return BigInt(hex);
}

export function isZeroAddress(address) {
  return !address || /^0x0{40}$/.test(address);
}

export function isZeroCode(code) {
  return !code || code === "0x" || /^0x0+$/.test(code);
}

export function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function decodeAddressArray(hex) {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length < 128) {
    return [];
  }

  const lengthOffset = 64;
  const lengthHex = body.slice(lengthOffset, lengthOffset + 64);
  const length = Number.parseInt(lengthHex, 16);
  const values = [];

  for (let index = 0; index < length; index += 1) {
    const start = 128 + index * 64;
    const word = body.slice(start, start + 64);
    values.push(addressFromWord(`0x${word}`));
  }

  return values.filter(Boolean);
}

