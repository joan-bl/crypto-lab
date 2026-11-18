// Ethereum de pruebas (red Sepolia). Mismas 12 palabras, otra ruta de derivación.

import { HDNodeWallet, JsonRpcProvider, Network, formatEther, parseEther, isAddress, getAddress } from "ethers";

export const SEPOLIA = {
  chainId: 11155111n,
  label: "Sepolia",
  rpc: "https://ethereum-sepolia-rpc.publicnode.com",
  explorer: "https://sepolia.etherscan.io",
  blockscout: "https://eth-sepolia.blockscout.com/api/v2",
};
export const MAINNET_RPC = "https://ethereum-rpc.publicnode.com";
export const ETH_PATH = "m/44'/60'/0'/0/0";

let _provider;
export function sepoliaProvider() {
  if (!_provider) {
    // staticNetwork: no pregunta la red en cada llamada, y garantiza que es Sepolia
    _provider = new JsonRpcProvider(SEPOLIA.rpc, Network.from(Number(SEPOLIA.chainId)), { staticNetwork: true });
  }
  return _provider;
}

export function ethWallet(mnemonic) {
  return HDNodeWallet.fromPhrase(mnemonic, undefined, ETH_PATH);
}

export async function ethBalance(address) {
  return sepoliaProvider().getBalance(address);
}

export async function ethFees() {
  const fd = await sepoliaProvider().getFeeData();
  return fd; // { gasPrice, maxFeePerGas, maxPriorityFeePerGas }
}

/** Prepara una transferencia y calcula su coste máximo. No la envía. */
export async function prepareEthTransfer(wallet, to, amountEth) {
  if (!isAddress(to)) throw new Error("La dirección de destino no es válida (0x… de 40 caracteres).");
  const value = parseEther(String(amountEth));
  if (value <= 0n) throw new Error("La cantidad tiene que ser mayor que 0.");
  const provider = sepoliaProvider();
  const net = await provider.getNetwork();
  if (net.chainId !== SEPOLIA.chainId) throw new Error("Seguridad: el nodo no es de Sepolia. No se envía nada.");
  const [fee, nonce, balance] = await Promise.all([
    provider.getFeeData(),
    provider.getTransactionCount(wallet.address, "pending"),
    provider.getBalance(wallet.address),
  ]);
  const gasLimit = 21000n;
  const maxFeePerGas = fee.maxFeePerGas ?? fee.gasPrice;
  const maxPriorityFeePerGas = fee.maxPriorityFeePerGas ?? 1_000_000_000n;
  const maxCost = gasLimit * maxFeePerGas;
  if (balance < value + maxCost) throw new Error("Saldo insuficiente para esa cantidad más el gas.");
  return {
    tx: { to: getAddress(to), value, gasLimit, maxFeePerGas, maxPriorityFeePerGas, nonce, chainId: SEPOLIA.chainId, type: 2 },
    maxCost,
    balance,
  };
}

export async function sendEth(wallet, prepared) {
  const signer = wallet.connect(sepoliaProvider());
  const sent = await signer.sendTransaction(prepared.tx);
  return sent.hash;
}

export async function ethHistory(address) {
  const r = await fetch(`${SEPOLIA.blockscout}/addresses/${address}/transactions`);
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Blockscout ${r.status}`);
  const data = await r.json();
  return data.items || [];
}

/** Precio actual del gas en la red principal (solo lectura), en gwei. */
export async function mainnetGas() {
  const r = await fetch(MAINNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_feeHistory", params: [5, "latest", [50]] }),
  });
  const j = await r.json();
  const base = parseInt(j.result.baseFeePerGas.at(-1), 16);
  const tips = j.result.reward.map((x) => parseInt(x[0], 16));
  const tip = tips.reduce((a, b) => a + b, 0) / tips.length;
  return { baseGwei: base / 1e9, tipGwei: tip / 1e9, totalGwei: (base + tip) / 1e9 };
}

export { formatEther };
