export function createRpcClient(rpcUrl, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required to use the RPC client.");
  }

  let requestId = 0;

  async function request(method, params) {
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++requestId,
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`RPC request failed with HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(`RPC error ${payload.error.code}: ${payload.error.message}`);
    }

    return payload.result;
  }

  return {
    request,
    getChainId() {
      return request("eth_chainId", []);
    },
    getCode(address, blockTag = "latest") {
      return request("eth_getCode", [address, blockTag]);
    },
    getStorageAt(address, slot, blockTag = "latest") {
      return request("eth_getStorageAt", [address, slot, blockTag]);
    },
    call(address, data, blockTag = "latest") {
      return request("eth_call", [{ to: address, data }, blockTag]);
    }
  };
}

