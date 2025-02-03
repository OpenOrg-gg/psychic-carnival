import { defineChain } from "viem";

export const abstractMainnet2741 = defineChain({
  id: 2741,
  name: "Abstract Mainnet",
  network: "abstract",
  nativeCurrency: {
    name: "ETH",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://api.mainnet.abs.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Abscan",
      url: "https://explorer.mainnet.abs.xyz",
    },
  },
  // You can optionally define "contracts" here, e.g. multicall3, if needed.
});
