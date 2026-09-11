import { WaypointPathway, WaypointStep, ProtocolId } from "../types";

// Standard Base Mainnet protocol contracts
export const BASE_CONTRACTS = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
  WETH: "0x4200000000000000000000000000000000000006" as `0x${string}`,
  AERODROME_ROUTER: "0xCF77a3BA9a5cA399b7C97c748561549736Add119" as `0x${string}`,
  MOONWELL_M_USDC: "0xeDC817A28E8b93cA1203340828a2052d4507612f" as `0x${string}`,
  MOONWELL_M_WETH: "0x662D0f9fF837a51Cf89a1FE7E0882A9069c45Bb6" as `0x${string}`,
  MOONWELL_COMPTROLLER: "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C" as `0x${string}`,
};

const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

const AERODROME_SWAP_ABI = [
  {
    name: "swapExactTokensForTokens",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
];

const MOONWELL_MINT_ABI = [
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "mintAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

/**
 * Fixture 1: Boros Hype Strategy (Multi-hop Aerodrome Swap + Moonwell Collateral Supply)
 * High-conviction yield pathway recorded from Wayfinder Paths SDK on Base
 */
export const BOROS_HYPE_PATHWAY: WaypointPathway = {
  pathwayId: "pw_boros_hype_base_001",
  strategyId: "boros_hype",
  network: "base-mainnet",
  totalValueUsd: 50.0,
  timestamp: 1789150000000,
  metadata: {
    source: "wayfinder-paths-sdk/v2.1",
    coordinator: "wf-coord-base-alpha",
    version: "2.1.0",
  },
  steps: [
    {
      stepIndex: 0,
      protocol: "aerodrome" as ProtocolId,
      action: "approve",
      targetAddress: BASE_CONTRACTS.USDC,
      calldata: "0x095ea7b3000000000000000000000000cf77a3ba9a5ca399b7c97c748561549736add1190000000000000000000000000000000000000000000000000000000002faf080",
      value: BigInt(0),
      expectedOutput: "Approved 50 USDC",
      maxSlippageBps: 0,
      label: "Approve Aerodrome Router",
      description: "Authorizes Aerodrome Router to spend 50.00 USDC for multi-hop execution",
      functionName: "approve",
      functionArgs: [BASE_CONTRACTS.AERODROME_ROUTER, "50000000"],
      abi: ERC20_APPROVE_ABI,
    },
    {
      stepIndex: 1,
      protocol: "aerodrome" as ProtocolId,
      action: "swap",
      targetAddress: BASE_CONTRACTS.AERODROME_ROUTER,
      calldata: "0x38ed17390000000000000000000000000000000000000000000000000000000002faf080",
      value: BigInt(0),
      expectedOutput: "0.0208 WETH (~$49.92 USD)",
      maxSlippageBps: 50, // 0.50% max slippage
      label: "Swap USDC for WETH",
      description: "Executes swap through Aerodrome volatile pool with 50 bps slippage limit",
      functionName: "swapExactTokensForTokens",
      functionArgs: [
        "50000000",
        "20700000000000000",
        [
          {
            from: BASE_CONTRACTS.USDC,
            to: BASE_CONTRACTS.WETH,
            stable: false,
            factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
          },
        ],
        "0x05619d1a133623B322a8f366ea9594e4e586f26D",
        Math.floor(Date.now() / 1000) + 1800,
      ],
      abi: AERODROME_SWAP_ABI,
    },
    {
      stepIndex: 2,
      protocol: "moonwell" as ProtocolId,
      action: "approve",
      targetAddress: BASE_CONTRACTS.WETH,
      calldata: "0x095ea7b3000000000000000000000000662d0f9ff837a51cf89a1fe7e0882a9069c45bb6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      value: BigInt(0),
      expectedOutput: "Approved WETH Collateral",
      maxSlippageBps: 0,
      label: "Approve Moonwell mWETH",
      description: "Approves Moonwell lending protocol to receive swapped WETH collateral",
      functionName: "approve",
      functionArgs: [BASE_CONTRACTS.MOONWELL_M_WETH, "20800000000000000"],
      abi: ERC20_APPROVE_ABI,
    },
    {
      stepIndex: 3,
      protocol: "moonwell" as ProtocolId,
      action: "supply",
      targetAddress: BASE_CONTRACTS.MOONWELL_M_WETH,
      calldata: "0xa0712d680000000000000000000000000000000000000000000000000171a5c689d00000",
      value: BigInt(0),
      expectedOutput: "Minted mWETH yield tokens",
      maxSlippageBps: 10,
      label: "Supply WETH into Moonwell",
      description: "Supplies 0.0208 WETH to Moonwell money market to earn yield and establish collateral",
      functionName: "mint",
      functionArgs: ["20800000000000000"],
      abi: MOONWELL_MINT_ABI,
    },
  ],
};

/**
 * Fixture 2: Moonwell Direct USDC Yield Strategy
 * Direct lending liquidity deployment
 */
export const MOONWELL_USDC_PATHWAY: WaypointPathway = {
  pathwayId: "pw_moonwell_usdc_002",
  strategyId: "moonwell_usdc_supply",
  network: "base-mainnet",
  totalValueUsd: 100.0,
  timestamp: 1789150010000,
  metadata: {
    source: "wayfinder-paths-sdk/v2.1",
    coordinator: "wf-coord-base-alpha",
    version: "2.1.0",
  },
  steps: [
    {
      stepIndex: 0,
      protocol: "moonwell" as ProtocolId,
      action: "approve",
      targetAddress: BASE_CONTRACTS.USDC,
      calldata: "0x095ea7b3000000000000000000000000edc817a28e8b93ca1203340828a2052d4507612f0000000000000000000000000000000000000000000000000000000005f5e100",
      value: BigInt(0),
      expectedOutput: "Approved 100 USDC",
      maxSlippageBps: 0,
      label: "Approve Moonwell mUSDC",
      description: "Authorizes Moonwell mUSDC contract to draw 100.00 USDC",
      functionName: "approve",
      functionArgs: [BASE_CONTRACTS.MOONWELL_M_USDC, "100000000"],
      abi: ERC20_APPROVE_ABI,
    },
    {
      stepIndex: 1,
      protocol: "moonwell" as ProtocolId,
      action: "supply",
      targetAddress: BASE_CONTRACTS.MOONWELL_M_USDC,
      calldata: "0xa0712d680000000000000000000000000000000000000000000000000000000005f5e100",
      value: BigInt(0),
      expectedOutput: "Supplied 100 USDC (Earn 6.2% APY)",
      maxSlippageBps: 0,
      label: "Supply USDC to Moonwell",
      description: "Deposits 100.00 USDC into Moonwell Core lending pool",
      functionName: "mint",
      functionArgs: ["100000000"],
      abi: MOONWELL_MINT_ABI,
    },
  ],
};

/**
 * Fixture 3: Aerodrome Direct Swap Strategy
 * Standard single-hop token swap on Base
 */
export const AERODROME_SWAP_PATHWAY: WaypointPathway = {
  pathwayId: "pw_aerodrome_swap_003",
  strategyId: "aerodrome_swap",
  network: "base-mainnet",
  totalValueUsd: 50.0,
  timestamp: 1789150020000,
  metadata: {
    source: "wayfinder-paths-sdk/v2.1",
    coordinator: "wf-coord-base-alpha",
    version: "2.1.0",
  },
  steps: [
    {
      stepIndex: 0,
      protocol: "aerodrome" as ProtocolId,
      action: "approve",
      targetAddress: BASE_CONTRACTS.USDC,
      calldata: "0x095ea7b3000000000000000000000000cf77a3ba9a5ca399b7c97c748561549736add1190000000000000000000000000000000000000000000000000000000002faf080",
      value: BigInt(0),
      expectedOutput: "Approved 50 USDC",
      maxSlippageBps: 0,
      label: "Approve Aerodrome Router",
      description: "Authorizes Aerodrome Router to spend 50.00 USDC",
      functionName: "approve",
      functionArgs: [BASE_CONTRACTS.AERODROME_ROUTER, "50000000"],
      abi: ERC20_APPROVE_ABI,
    },
    {
      stepIndex: 1,
      protocol: "aerodrome" as ProtocolId,
      action: "swap",
      targetAddress: BASE_CONTRACTS.AERODROME_ROUTER,
      calldata: "0x38ed17390000000000000000000000000000000000000000000000000000000002faf080",
      value: BigInt(0),
      expectedOutput: "0.0208 WETH (~$49.92 USD)",
      maxSlippageBps: 30, // 0.30% max slippage
      label: "Swap USDC for WETH",
      description: "Executes optimal route swap on Aerodrome DEX",
      functionName: "swapExactTokensForTokens",
      functionArgs: [
        "50000000",
        "20700000000000000",
        [
          {
            from: BASE_CONTRACTS.USDC,
            to: BASE_CONTRACTS.WETH,
            stable: false,
            factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
          },
        ],
        "0x05619d1a133623B322a8f366ea9594e4e586f26D",
        Math.floor(Date.now() / 1000) + 1800,
      ],
      abi: AERODROME_SWAP_ABI,
    },
  ],
};

/**
 * Fixture 4: Invariant Violation Fixture (Slippage / Pool Imbalance)
 * Designed to demonstrate pre-flight simulation circuit-breaker refusal
 */
export const FAILING_SLIPPAGE_PATHWAY: WaypointPathway = {
  pathwayId: "pw_fail_slippage_004",
  strategyId: "failing_slippage_demo",
  network: "base-mainnet",
  totalValueUsd: 500.0,
  timestamp: 1789150030000,
  metadata: {
    source: "wayfinder-paths-sdk/v2.1",
    coordinator: "wf-coord-fault-injector",
    version: "2.1.0",
  },
  steps: [
    {
      stepIndex: 0,
      protocol: "aerodrome" as ProtocolId,
      action: "approve",
      targetAddress: BASE_CONTRACTS.USDC,
      calldata: "0x095ea7b3000000000000000000000000cf77a3ba9a5ca399b7c97c748561549736add119000000000000000000000000000000000000000000000000000000001dcd6500",
      value: BigInt(0),
      expectedOutput: "Approved 500 USDC",
      maxSlippageBps: 0,
      label: "Approve Aerodrome Router",
      description: "Authorizes router spend for high-slippage swap",
      functionName: "approve",
      functionArgs: [BASE_CONTRACTS.AERODROME_ROUTER, "500000000"],
      abi: ERC20_APPROVE_ABI,
    },
    {
      stepIndex: 1,
      protocol: "aerodrome" as ProtocolId,
      action: "swap",
      targetAddress: BASE_CONTRACTS.AERODROME_ROUTER,
      calldata: "0x38ed1739000000000000000000000000000000000000000000000000000000001dcd6500",
      value: BigInt(0),
      expectedOutput: "0.208 WETH",
      maxSlippageBps: 500, // Injected 5.0% slippage spike
      label: "Execute Volatile High-Impact Swap",
      description: "Swap triggers pool imbalance exceeding safety envelope; simulation refuses before gas burn",
      functionName: "swapExactTokensForTokens",
      functionArgs: [
        "500000000",
        "999999999999999999", // Unrealistic minimum out triggering EVM revert
        [
          {
            from: BASE_CONTRACTS.USDC,
            to: BASE_CONTRACTS.WETH,
            stable: false,
            factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
          },
        ],
        "0x05619d1a133623B322a8f366ea9594e4e586f26D",
        Math.floor(Date.now() / 1000) + 1800,
      ],
      abi: AERODROME_SWAP_ABI,
    },
    {
      stepIndex: 2,
      protocol: "moonwell" as ProtocolId,
      action: "supply",
      targetAddress: BASE_CONTRACTS.MOONWELL_M_WETH,
      calldata: "0xa0712d680000000000000000000000000000000000000000000000000000000000000000",
      value: BigInt(0),
      expectedOutput: "Unreachable",
      maxSlippageBps: 0,
      label: "Downstream Collateral Supply",
      description: "Downstream step blocked by circuit breaker; zero gas consumed",
      functionName: "mint",
      functionArgs: ["0"],
      abi: MOONWELL_MINT_ABI,
    },
  ],
};

export const ALL_FIXTURES: Record<string, WaypointPathway> = {
  [BOROS_HYPE_PATHWAY.strategyId]: BOROS_HYPE_PATHWAY,
  [MOONWELL_USDC_PATHWAY.strategyId]: MOONWELL_USDC_PATHWAY,
  [AERODROME_SWAP_PATHWAY.strategyId]: AERODROME_SWAP_PATHWAY,
  [FAILING_SLIPPAGE_PATHWAY.strategyId]: FAILING_SLIPPAGE_PATHWAY,
  [BOROS_HYPE_PATHWAY.pathwayId]: BOROS_HYPE_PATHWAY,
  [MOONWELL_USDC_PATHWAY.pathwayId]: MOONWELL_USDC_PATHWAY,
  [AERODROME_SWAP_PATHWAY.pathwayId]: AERODROME_SWAP_PATHWAY,
  [FAILING_SLIPPAGE_PATHWAY.pathwayId]: FAILING_SLIPPAGE_PATHWAY,
};
