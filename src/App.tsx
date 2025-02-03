/********************************************************************
 * App.tsx
 *
 * Production-ready DApp:
 *   - Abstract Global Wallet for login
 *   - Five main pages (Home, Docs, Stats, Trade, FAQ) + new ToS page
 *   - Collapsible Bootstrap navbar
 *   - Text box above the oracle table
 *   - Footer with link to /tos
 ********************************************************************/

import React, { useState, useEffect, ChangeEvent } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
} from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css"; // Ensure bootstrap installed

// Abstract Global Wallet & hooks
import {
  AbstractWalletProvider,
  useLoginWithAbstract,
  useAbstractClient,
  useGlobalWalletSignerAccount,
} from "@abstract-foundation/agw-react";

// Viem & TanStack Query
import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { QueryClient } from "@tanstack/react-query";

// Wagmi & RelayKit
import { createConfig, WagmiProvider } from "wagmi";
import {
  convertViemChainToRelayChain,
  MAINNET_RELAY_API,
} from "@reservoir0x/relay-sdk";
import {
  RelayKitProvider,
  SwapWidget,
  RelayKitTheme,
} from "@reservoir0x/relay-kit-ui";

import "@reservoir0x/relay-kit-ui/styles.css"; // Keep default RelayKit UI styles

// Our chain & oracles
import { abstractMainnet2741 } from "./chains/abstractMainnet";
import oraclesJson from "./oracles.json";

// Additional function to derive SC address from EOA
import { getSmartAccountAddressFromInitialSigner } from "@abstract-foundation/agw-client";

/* -------------------- Custom RelayKit Theme (example) -------------------- */
const customRelayTheme: RelayKitTheme = {
  font: "Inter, -apple-system, Helvetica, sans-serif",
  primaryColor: "#09F9E9",
  focusColor: "#08DECF",
};

/* 
  Parse the Dune API key from .env (e.g. REACT_APP_DUNE_API_KEY or VITE_DUNE_API_KEY).
  Adjust the variable name as needed to match your environment's naming scheme.
*/
const duneApiKey = import.meta.env.VITE_DUNE_API_KEY || "";

/* -------------------------- Global Setup -------------------------- */
const publicClient = createPublicClient({
  chain: abstractMainnet2741,
  transport: http("https://api.mainnet.abs.xyz"),
});
const queryClient = new QueryClient();

const typedOracles = (oraclesJson as {
  assetPair: string;
  wrapperAddress: string;
  pythFeedId: string;
}[]).map((o) => ({
  assetPair: o.assetPair,
  wrapperAddress: getAddress(o.wrapperAddress) as `0x${string}`,
  pythFeedId: o.pythFeedId,
}));

/* ------------------ Contract ABIs & Addresses ------------------ */
const WRAPPER_ABI = parseAbi([
  "function updatePrice(bytes[] calldata updateData) external payable",
  "function getRequiredFee(bytes[] calldata updateData) public view returns (uint256)",
  "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
]);
const ERC20_ABI = parseAbi([
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)",
]);
const UNISWAP_V2_PAIR_ABI = parseAbi([
  "function getReserves() public view returns (uint112, uint112, uint32)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
]);

// Example addresses (replace with your actual):
const FIRE_TOKEN_ADDRESS = getAddress("0x9cd21700099008e23887e15a4aeed36a3397f0ed");
const DEV_WALLET_ADDRESS = getAddress("0xBb62D22C55430Bed86f18da8fC0e2923568fC90a");
const UNISWAP_PAIR_ADDRESS = getAddress("0xCd872190515901567fc9617F7795d616D148Cd9C");

/* -------------------------- Header Component -------------------------- */
function Header() {
  const { login, logout } = useLoginWithAbstract();
  const { data: agwClient } = useAbstractClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setConnected(!!agwClient);
  }, [agwClient]);

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-3">
      <Link to="/" className="navbar-brand d-flex align-items-center">
        <img
          src="../public/bonfire.png"
          alt="Logo"
          style={{ marginRight: 8, height: 50, width: 50 }}
        />
        <span style={{ fontSize: 18, fontWeight: "bold" }}>
          Bonfire - An Oracle Rewards Protocol
        </span>
      </Link>

      {/* The collapsible toggler for smaller screens */}
      <button
        className="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarSupportedContent"
        aria-controls="navbarSupportedContent"
        aria-expanded="false"
        aria-label="Toggle navigation"
      >
        <span className="navbar-toggler-icon" />
      </button>

      <div
        className="collapse navbar-collapse"
        id="navbarSupportedContent"
        style={{ marginLeft: 20 }}
      >
        <ul className="navbar-nav me-auto">
          <li className="nav-item">
            <Link to="/" className="nav-link">Home</Link>
          </li>
          <li className="nav-item">
            <Link to="/docs" className="nav-link">Docs</Link>
          </li>
          <li className="nav-item">
            <Link to="/stats" className="nav-link">Stats</Link>
          </li>
          <li className="nav-item">
            <Link to="/trade" className="nav-link">Trade</Link>
          </li>
          <li className="nav-item">
            <Link to="/faq" className="nav-link">FAQ</Link>
          </li>
        </ul>
        {connected ? (
          <button className="btn btn-outline-light" onClick={() => logout()}>
            Disconnect
          </button>
        ) : (
          <button className="btn btn-success" onClick={() => login()}>
            Connect AGW
          </button>
        )}
      </div>
    </nav>
  );
}

/* -------------------------- Home Page (Oracle Table) -------------------------- */
interface OracleRow {
  oracle: {
    assetPair: string;
    wrapperAddress: `0x${string}`;
    pythFeedId: string;
  };
  lastOnChainPrice: number;
  freshPrice: number;
  lastUpdateTime: number;
  isUpdating: boolean;
}

function Home() {
  const { data: agwClient } = useAbstractClient();
  const [rows, setRows] = useState<OracleRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Add text box state
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!agwClient) return;

    async function loadData() {
      setIsLoading(true);

      // 1) Hermes fetch
      const hermesMap: Record<string, { freshPrice: number }> = {};
      for (const o of typedOracles) {
        try {
          const hermesUrl = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${o.pythFeedId}`;
          const resp = await fetch(hermesUrl);
          if (!resp.ok) {
            throw new Error(`Hermes fetch failed: ${resp.status}`);
          }
          const data = await resp.json();
          const parsedArr = data.parsed || [];
          let freshPrice = 0;
          if (parsedArr.length > 0) {
            const p = parsedArr[0];
            const rawPriceStr = p.price?.price ?? "0";
            const expo = p.price?.expo ?? 0;
            freshPrice = Number(rawPriceStr) * 10 ** expo;
          }
          hermesMap[o.pythFeedId] = { freshPrice };
        } catch (e) {
          hermesMap[o.pythFeedId] = { freshPrice: 0 };
        }
      }

      // 2) On‑chain data
      const newRows: OracleRow[] = [];
      for (const o of typedOracles) {
        try {
          const result = (await publicClient.readContract({
            address: o.wrapperAddress,
            abi: WRAPPER_ABI,
            functionName: "latestRoundData",
          })) as [bigint, bigint, bigint, bigint, bigint];
          const [, answer, , updatedAt] = result;
          const lastOnChainPrice = Number(answer) / 1e8;
          const lastUpdateTime = Number(updatedAt);
          newRows.push({
            oracle: o,
            lastOnChainPrice,
            freshPrice: hermesMap[o.pythFeedId]?.freshPrice ?? 0,
            lastUpdateTime,
            isUpdating: false,
          });
        } catch (err) {
          newRows.push({
            oracle: o,
            lastOnChainPrice: 0,
            freshPrice: 0,
            lastUpdateTime: 0,
            isUpdating: false,
          });
        }
      }
      setRows(newRows);
      setIsLoading(false);
    }
    loadData();
  }, [agwClient]);

  function handleTextChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setNotes(e.target.value);
  }

  async function handleUpdate(row: OracleRow) {
    if (!agwClient) {
      alert("Connect with Abstract first.");
      return;
    }
    setRows((old) =>
      old.map((r) =>
        r.oracle.wrapperAddress === row.oracle.wrapperAddress
          ? { ...r, isUpdating: true }
          : r
      )
    );
    try {
      const hermesUrl = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${row.oracle.pythFeedId}`;
      const hermesResp = await fetch(hermesUrl);
      if (!hermesResp.ok) {
        throw new Error(`Hermes request failed: ${hermesResp.status}`);
      }
      const hermesData = await hermesResp.json();
      const updateDataHexArray: `0x${string}`[] = hermesData.binary.data.map(
        (hex: string) =>
          hex.startsWith("0x")
            ? (hex as `0x${string}`)
            : (`0x${hex}` as `0x${string}`)
      );
      const requiredFee = (await publicClient.readContract({
        address: row.oracle.wrapperAddress,
        abi: WRAPPER_ABI,
        functionName: "getRequiredFee",
        args: [updateDataHexArray],
      })) as bigint;
      const txHash = await agwClient.writeContract({
        address: row.oracle.wrapperAddress,
        abi: WRAPPER_ABI,
        functionName: "updatePrice",
        args: [updateDataHexArray],
        value: requiredFee,
      });
      alert(`TX sent: ${txHash}`);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setRows((old) =>
        old.map((r) =>
          r.oracle.wrapperAddress === row.oracle.wrapperAddress
            ? { ...r, isUpdating: false }
            : r
        )
      );
    }
  }

  if (isLoading) return <p className="m-4">Loading Oracles...</p>;
  if (!rows.length) return <p className="m-4">No oracles found or user not connected.</p>;

  const nowSec = Math.floor(Date.now() / 1000);

  function colorTime(minutes: number): string {
    if (minutes < 15) return "green";
    if (minutes < 30) return "goldenrod";
    return "red";
  }
  function colorDiff(diff: number): string {
    return Math.abs(diff) < 0.02 ? "green" : "red";
  }

  return (
    <div className="container my-4">
      <h2>Bonfire</h2>
      {/* Text box above the table */}
      <div>
        <p>
          Bonfire is a micro protocol by the Club Huddle team, which rewards users
          for helping keep oracles up to date on chain.
        </p>
        <p>
          Pyth's pull oracles return signed offchain data when requested, but,
          teams must rely on centralized infrastructure to make these requests and
          ensure they are up to date.
        </p>
        <p>
          Bonfire creates Chainlink style wrappers around Pyth's oracles, with
          onchain feeds that anyone can update in order to earn a reward.
          Ensuring reliable, up-to-date, onchain data without a singular
          centralized dependency.
        </p>
        <p>
          If an oracle feed below shows a red number in the "Time Since Update" or
          "Diff %" column, then you can send the update command to help update the
          oracle and earn rewards.
        </p>
        <p>
          This is the Alpha release of Bonfire, and you should read the FAQ page to
          learn more.
        </p>
      </div>

      <table className="table table-striped mt-3">
        <thead className="table-dark">
          <tr>
            <th>Asset Pair</th>
            <th>On‑Chain Price</th>
            <th>Fresh Price</th>
            <th>Diff %</th>
            <th>Time Since Update</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const diffRatio =
              r.lastOnChainPrice === 0
                ? 0
                : (r.freshPrice - r.lastOnChainPrice) / r.lastOnChainPrice;
            const diffPct = (diffRatio * 100).toFixed(2) + "%";
            const minsSince = (nowSec - r.lastUpdateTime) / 60;
            return (
              <tr key={r.oracle.wrapperAddress}>
                <td>{r.oracle.assetPair}</td>
                <td>{r.lastOnChainPrice.toFixed(2)}</td>
                <td>{r.freshPrice.toFixed(2)}</td>
                <td style={{ color: colorDiff(diffRatio) }}>{diffPct}</td>
                <td style={{ color: colorTime(minsSince) }}>
                  {minsSince.toFixed(1)} min
                </td>
                <td>
                  <button
                    className="btn btn-primary"
                    disabled={r.isUpdating}
                    onClick={() => handleUpdate(r)}
                  >
                    {r.isUpdating ? "Updating..." : "Update for Reward"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------- Docs Page -------------------------- */
function Docs() {
  return (
    <div className="container my-4">
      <h2>How to Integrate:</h2>
      <p>
        Any Bonfire Oracle can be called using the standard Chainlink interface
        function to return the latest round:
      </p>
      <p>
        <i>
          "function latestRoundData() external view returns (uint80, int256,
          uint256, uint256, uint80)",
        </i>
      </p>

      <p>
        Currently all read fees and whitelisting is disabled so anyone can freely
        read the Bonfire oracles. The Bonfire team has covered all initial costs
        to ensure reliable onchain oracles for building early defi on Abstract.
      </p>
      <p>
        Additional documentation coming soon - but feel free to read the detailed
        breakdown of functionality on the FAQ page.
      </p>
    </div>
  );
}

/* -------------------------- Stats Page -------------------------- */
function Stats() {
  const [loading, setLoading] = useState(false);
  const [circSupply, setCircSupply] = useState(0);
  const [burned, setBurned] = useState(0);
  const [firePriceEth, setFirePriceEth] = useState(0);
  const [firePriceUsd, setFirePriceUsd] = useState(0);
  const [marketCap, setMarketCap] = useState(0);
  const [burnedValue, setBurnedValue] = useState(0);
  const [ethUsdPrice, setEthUsdPrice] = useState(0);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const totalSupply = (await publicClient.readContract({
          address: FIRE_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: "totalSupply",
        })) as bigint;
        const devBal = (await publicClient.readContract({
          address: FIRE_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [DEV_WALLET_ADDRESS],
        })) as bigint;
        const burnedBal = (await publicClient.readContract({
          address: FIRE_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: ["0x0000000000000000000000000000000000000000"],
        })) as bigint;

        const circ = Number(totalSupply - devBal - burnedBal) / 1e18;
        setCircSupply(circ);
        setBurned(Number(burnedBal) / 1e18);

        const token0 = (await publicClient.readContract({
          address: UNISWAP_PAIR_ADDRESS,
          abi: UNISWAP_V2_PAIR_ABI,
          functionName: "token0",
        })) as `0x${string}`;
        const token1 = (await publicClient.readContract({
          address: UNISWAP_PAIR_ADDRESS,
          abi: UNISWAP_V2_PAIR_ABI,
          functionName: "token1",
        })) as `0x${string}`;
        const reserves = (await publicClient.readContract({
          address: UNISWAP_PAIR_ADDRESS,
          abi: UNISWAP_V2_PAIR_ABI,
          functionName: "getReserves",
        })) as [bigint, bigint, number];
        let reserveFire = 0;
        let reserveEth = 0;
        if (getAddress(token0) === FIRE_TOKEN_ADDRESS) {
          reserveFire = Number(reserves[0]);
          reserveEth = Number(reserves[1]);
        } else {
          reserveEth = Number(reserves[0]);
          reserveFire = Number(reserves[1]);
        }
        const firePriceInEth = reserveEth / reserveFire;
        setFirePriceEth(firePriceInEth);

        const foundEthUsdFeed = typedOracles.find((o) => o.assetPair === "ETH/USD");
        let ethPriceUsd = 0;
        if (foundEthUsdFeed) {
          const hermesUrl = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${foundEthUsdFeed.pythFeedId}`;
          const hermesResp = await fetch(hermesUrl);
          if (hermesResp.ok) {
            const hermesData = await hermesResp.json();
            const p = hermesData.parsed?.[0];
            if (p) {
              const rawPriceStr = p.price?.price ?? "0";
              const expo = p.price?.expo ?? 0;
              ethPriceUsd = Number(rawPriceStr) * 10 ** expo;
            }
          }
        }
        setEthUsdPrice(ethPriceUsd);

        const fireUsd = firePriceInEth * ethPriceUsd;
        setFirePriceUsd(fireUsd);
        setMarketCap(circ * fireUsd);
        setBurnedValue((Number(burnedBal) / 1e18) * fireUsd);
      } catch (err) {
        console.error("Error loading stats:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) return <p className="m-4">Loading stats...</p>;

  return (
    <div className="container my-4">
      <h2>Stats</h2>
      <p><strong>Circulating Supply:</strong> {circSupply.toFixed(2)} FIRE</p>
      <p><strong>Burned:</strong> {burned.toFixed(2)} FIRE</p>
      <p><strong>FIRE price (ETH):</strong> {firePriceEth.toFixed(6)} ETH</p>
      <p><strong>ETH/USD price:</strong> ${ethUsdPrice.toFixed(2)}</p>
      <p><strong>FIRE price (USD):</strong> ${firePriceUsd.toFixed(4)}</p>
      <p><strong>Market Cap:</strong> ${marketCap.toFixed(2)}</p>
      <p><strong>Burned Value:</strong> ${burnedValue.toFixed(2)}</p>
    </div>
  );
}

/* ------------------ Trade Page using Abstract SC wallet  ------------------ */
// Minimal Wagmi config for RelayKit
const wagmiConfig = createConfig({
  autoConnect: true,
  connectors: [],
  chains: [abstractMainnet2741],
  publicClient: createPublicClient({
    chain: abstractMainnet2741,
    transport: http(),
  }),
});
const relayChains = [convertViemChainToRelayChain(abstractMainnet2741)];

export function Trade() {
  // 1) Access the Abstract SC wallet
  const { data: abstractClient } = useAbstractClient();

  // 2) Access the underlying EOA so we can derive the SC address
  const { address: eoaAddress } = useGlobalWalletSignerAccount();

  // 3) We'll store the derived SC address
  const [scAddress, setScAddress] = useState<string>("");

  // Derive SC address once EOA is known
  useEffect(() => {
    if (!eoaAddress) {
      setScAddress("");
      return;
    }
    async function deriveScAddress() {
      try {
        const pc = createPublicClient({
          chain: abstractMainnet2741,
          transport: http("https://api.mainnet.abs.xyz"),
        });
        const derived = await getSmartAccountAddressFromInitialSigner(eoaAddress, pc);
        setScAddress(derived);
      } catch (err) {
        console.error("Error deriving SC address from EOA:", err);
      }
    }
    deriveScAddress();
  }, [eoaAddress]);

  // RelayKit adapted wallet using the SC
  const adaptedWallet = {
    vmType: "evm" as const,

    getChainId: async () => 2741,

    handleSignMessageStep: async () => {
      throw new Error("Abstract SC wallet does not sign personal messages.");
    },

    handleSendTransactionStep: async (chainId: number, item: any, _step: any) => {
      if (!abstractClient) throw new Error("Abstract client not connected");
      const txHash = await abstractClient.sendTransaction({
        to: item.to,
        data: item.data,
        value: item.value,
      });
      return txHash;
    },

    handleConfirmTransactionStep: async (
      txHash: string,
      _chainId: number,
      _onReplaced: (replacementTxHash: string) => void,
      _onCancelled: () => void
    ) => {
      const pc = createPublicClient({
        chain: abstractMainnet2741,
        transport: http("https://api.mainnet.abs.xyz"),
      });
      const receipt = await pc.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      return receipt;
    },

    address: async () => scAddress,

    switchChain: async (chainId: number) => {
      throw new Error(`Chain switching not supported. Attempt to go to: ${chainId}`);
    },
  };

  function handleConnectWallet() {
    alert("Please connect via Abstract (header).");
  }

  return (
    <div className="container my-4">
      <h2>Trade</h2>
      <p>
        Use the Relay SwapWidget below to swap <strong>ETH</strong> ↔{" "}
        <strong>FIRE</strong> from your <strong>Abstract SC</strong> address:
        {" "}
        {scAddress ? <code>{scAddress}</code> : "(not connected)"}
      </p>
      <WagmiProvider config={wagmiConfig}>
        <RelayKitProvider
          theme={customRelayTheme}
          options={{
            appName: "FIRE DApp",
            baseApiUrl: MAINNET_RELAY_API,
            chains: [convertViemChainToRelayChain(abstractMainnet2741)],
            // Add your duneApiKey here to enable balance lookups
            duneApiKey,
          }}
        >
          <div className="p-3" style={{ border: "1px solid #ccc", borderRadius: 8 }}>
            <SwapWidget
              defaultFromToken={{
                chainId: 2741,
                // Use aggregator's pseudo-address for native token:
                address: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
                decimals: 18,
                symbol: "WETH",
                name: "Wrapped Ethereum",
              }}
              defaultToToken={{
                chainId: 2741,
                address: "0x9cd21700099008e23887e15a4aeed36a3397f0ed",
                decimals: 18,
                symbol: "FIRE",
                name: "FIRE Token",
              }}
              supportedWalletVMs={["evm"]}
              lockChainId={2741}
              lockToToken
              defaultAmount="1"
              wallet={adaptedWallet}
              onConnectWallet={handleConnectWallet}
              onAnalyticEvent={(eventName, data) => {
                console.log("SwapWidget event", eventName, data);
              }}
            />
          </div>
        </RelayKitProvider>
      </WagmiProvider>
    </div>
  );
}

/* -------------------------- FAQ Page -------------------------- */
function FAQ() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const faqs = [
    {
      q: "What is Bonfire?",
      a: "Bonfire is a mini-protocol designed to add an incentive layer to any offchain oracle. As L2s rely more and more on offchain pull oracles, it creates centralized dependencies that make it hard for small teams to have reliable data. Bonfire is designed to let anyone earn a reward for bringing that data on chain in a timely manner."
    },
    {
      q: "How does it work?",
      a: "Bonfire currently wraps the Pyth oracle with individual feeds that convert Pyth style data to a Chainlink-style consumable feed. If the price has moved more than X% or more than Y time has passed on an oracle, anyone can send an update command along with the signed data from a Hermes Pyth endpoint to update the onchain feed and in turn earn a reward."
    },
    {
      q: "Are Bonfire Oracles free to use?",
      a: "Currently, the Bonfire team is covering the costs and has made the oracles freely readable by anyone. In the future teams who want to read data from the oracles will burn a small portion of the Bonfire $FIRE token in exchange for 1 year of read access to the oracles. This ensures the incentive model for updating."
    },
    {
      q: "What is the $FIRE token used for?",
      a: "In the future, teams will burn the $FIRE token to be able to read data from the Bonfire feeds. Users will also be able to stake the Bonfire token against new types of oracle providers, or new feeds as a trust mechanism and in turn earn a portion of the fees associated with that oracle."
    },
    {
      q: "What are the tokenomics?",
      a: "In the V1 alpha (current version) there exists 100M $FIRE tokens + ongoing reward minting which is determined by the volatility of the asset. Rewards and rates can be adjusted by the team during the alpha phase or a migration. 5% of the initial allocation will go to the team on a linear unlock of 1 year. 10% will go to funding on a linear unlock of 4 years, and the remainder will be owned by the Club Huddle DAO on the same unlock schedule. 100% of rewards will go to protocol users."
    },
    {
      q: "Does the token have any fees?",
      a: "The token has a 2% buy fee, with 1% going to liquidity and 1% going to funding. It also has a 5% sell fee, with 3% going to funding, 1% going to liquidity and 1% being burned. These early fees are designed to allow rewards to maintain stability against sellers"
    },
    {
      q: "Will the fees be reduced?",
      a: "Yes. As the market grows and becomes stable, and the reliability of our oracles improves, then the protocol can absorb more trading volume and volatility without risk to the reward system and so the fees will be lowered."
    },
    { q: "Is Bonfire audited?", a: "No." },
    {
      q: "Is Bonfire ready to use in production?",
      a: "The Bonfire team considers this an early alpha that we built to solve our own internal challenges. It meets the risk thresholds for our specific use case. You should review Bonfire's update records and frequency and determine if it makes sense for you."
    },
    {
      q: "Can I automate calls to Bonfire?",
      a: "Yes, however, in future iterations there will be a different reward tier for users who updated via the Abstract Global Wallet and not via automated scripts. So it is advisable to engage via the webpage."
    },
    {
      q: "Can I connect to Bonfire in another way?",
      a: "Yes, the reason this website looks so crappy is its designed to be entirely standalone and open source. You can download and run a local copy of Bonfire's frontend, and modify it in anyway you please."
    },
    {
      q: "Can't I just use Pyth oracles directly?",
      a: "Yes, but most DApps have a system designed for Chainlink style calls, and calling Pyth means requiring your own infrastructure to make sure the oracles are up to date. Using Bonfire means you do not have a centralized dependency."
    },
    {
      q: "What happens if there is a problem with Bonfire or its token?",
      a: "Part of the reason we call Bonfire an alpha is its a living protocol. Any critical errors would result in a need for a migration. This includes the potentail for major changes to the tokenomics and a migration to a new version of the token as well."
    },
    {
      q: "What is Club Huddle?",
      a: "Club Huddle is a forthcoming DAO project building key tools for Abstract governance, onchain defi, and user rewards. Bonfire was built by Club Huddle to solve the oracle problem we faced. This is why we consider it a mini-protocol rather than something standalone."
    },
    {
      q: "Will Club Huddle maintain Bonfire?",
      a: "Club Huddle will maintain Bonfire until the point that it's sufficient to be an ownerless protocol. We believe that Bonfire is a commons public good that if successful should be self-sufficient. Club Huddle's focus is obviously on the feature set that best meet our needs and in getting Bonfire to be self-sufficient, but we welcome pull requests from the community to expand that and to help achieve the goal of self sufficency."
    },
    {
      q: "Will Bonfire make me rich?",
      a: "Bonfire has the goal of making the system self sufficient, and therefore having $FIRE rewards be worth enough that users partake in it. That is what we care about. If that aligns with your bags - great."
    },
    {
      q: "Are there social channels for $FIRE?",
      a: "No. Not at this time. When Club Huddle is ready to launch, it will contain a sub-channel for Bonfire. Until then, any critical announcements will solely be from this Bonfire website. This is in order to protect the team's time and attention."
    },
    {
      q: "Does Bonfire have investors?",
      a: "No. It is a 100% openly built, self-funded and community owned project. Vive le consumer!"
    },
    {
      q: "My $FIRE trade transaction fails on DEXes?",
      a: "Because of the built in fees, you need to increase your slippage to be >3% on a buy and >5% on a sell."
    },
    {
      q: "What will Bonfire do with it's Abstract Rewards from Panoramic Governance?",
      a: "We'll direct any rewards from Panoramic Governance to Club Huddle's DAO with the caveat that sequencer fee distributions earned by Club Huddle form those tokens are used to buy and burn the $FIRE token."
    },
    {
      q: "I have more questions.",
      a: "They probably aren't very relevant at this point. You know what the protocol does, what we stand for, how the token works, and that the logo is a cute anthropomorphic flame. It's time to pick a lane."
    },
  ];

  function toggle(i: number) {
    setExpanded(expanded === i ? null : i);
  }

  return (
    <div className="container my-4">
      <h2>FAQ</h2>
      {faqs.map((item, i) => (
        <div key={i} className="mb-3">
          <div
            className="fw-bold"
            style={{ cursor: "pointer" }}
            onClick={() => toggle(i)}
          >
            {item.q}
          </div>
          {expanded === i && (
            <div className="mt-1 ms-3 text-muted">{item.a}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* -------------------------- ToS Page -------------------------- */
function TosPage() {
  return (
    <div className="container my-4">
      <h2>Terms of Service</h2>
      <p>
        All information on this site, all features within this protocol, and
        within the token are presented as-is. The system is in Alpha. The team
        holds no responsability for the impact of relying on, using, partaking
        in, or making purchases related to this protocol. This protocol may
        change key features including access, tokenomics, or feature sets at any
        time. The team may choose to no longer maintain, update or manage this
        protocol. Participants, buyers, users, and contributors should be aware
        of all risks associated with this system before partaking in the
        protocol. The team does not make, endorse, or suggest any forward looking
        statements about price in relation to this protocol. Purchasing or using
        this protocol may result in the loss of funds. Users should only use this
        protocol, site or system, in a manner that is applicable with their local
        laws.
      </p>
    </div>
  );
}

/* -------------------------- MainContent -------------------------- */
function MainContent() {
  const { login, logout } = useLoginWithAbstract();
  const { data: agwClient } = useAbstractClient();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!agwClient);
  }, [agwClient]);

  return (
    <div className="container my-5">
      <h1 className="mb-3"></h1>
      <p className="mb-4">
        This DApp uses Viem’s <code>publicClient</code> for reads
        and Abstract Wallet for writes.
      </p>
      {!isLoggedIn ? (
        <button className="btn btn-primary" onClick={() => login()}>
          Connect with Abstract
        </button>
      ) : (
        <button className="btn btn-danger" onClick={() => logout()}>
          Disconnect
        </button>
      )}
    </div>
  );
}

/* -------------------------- Footer -------------------------- */
function Footer() {
  return (
    <footer className="bg-dark text-light py-3 mt-auto text-center">
      <div className="container">
        <span>© {new Date().getFullYear()} Bonfire</span>
        {" | "}
        <Link to="/tos" className="text-light">
          Terms of Service
        </Link>
      </div>
    </footer>
  );
}

/* -------------------------- RootApp & Routing -------------------------- */
function RootApp() {
  return (
    <BrowserRouter>
      <AbstractWalletProvider
        chain={abstractMainnet2741}
        queryClient={queryClient}
      >
        <div className="d-flex flex-column" style={{ minHeight: "100vh" }}>
          <Header />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/trade" element={<Trade />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/tos" element={<TosPage />} />
          </Routes>
          <MainContent />
          <Footer />
        </div>
      </AbstractWalletProvider>
    </BrowserRouter>
  );
}

export default RootApp;
