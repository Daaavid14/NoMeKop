// ========================================
// Nomekop Bequest - Wallet Integration (Stable Version)
// Sepolia Testnet (Remix + MetaMask)
// ========================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("✅ DOM Loaded — Wallet Script Ready");

  // -------------------- CONTRACT CONFIG --------------------
  const NFT_CONTRACT = "0xBDDC9D6dB298f7486f73abD06083d4B84CDd7521";
  const TOKEN_CONTRACT = "0xe909fB039ad0e5a2457ad4Ed9bb8393E926C9CC8";
  const MARKET_CONTRACT = "0xE21f02Ba72524dd567aC5d56619feFA42C8EC03F";

  const POKECOIN_CONTRACT = TOKEN_CONTRACT;
  const pokeAbi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ];

  // -------------------- SELECT DOM ELEMENTS --------------------
  const connectBtn = document.getElementById("connectWalletBtn");
  const walletMenu = document.getElementById("walletMenu");
  const wmAddressShort = document.getElementById("wmAddressShort");
  const wmBalance = document.getElementById("wmBalance");
  const wmNetwork = document.getElementById("wmNetwork");
  const wmLogoutBtn = document.getElementById("wmLogoutBtn");

  // Verify element existence
  if (!connectBtn) {
    console.error("❌ connectWalletBtn not found in DOM.");
    return;
  }
  if (!walletMenu) console.warn("⚠️ walletMenu not found — dropdown will not render.");

  let provider, signer, userAddress;

  // ======================================
  // CONNECT WALLET
  // ======================================
  async function connectWallet() {
    if (!window.ethereum) {
      alert("MetaMask not detected. Please install it first.");
      return;
    }

    try {
      provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      signer = await provider.getSigner();
      userAddress = await signer.getAddress();

      // Verify network
      const network = await provider.getNetwork();
      if (network.name.toLowerCase() !== "sepolia") {
        alert("Please switch to the Sepolia Test Network in MetaMask.");
      }

      // Shortened wallet address
      const shortAddr = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

      // ETH balance
      const ethBalance = await provider.getBalance(userAddress);
      const formattedEth = parseFloat(ethers.formatEther(ethBalance)).toFixed(4);

      // PokéCoin balance
      let pokeBal = "0";
      try {
        const pokeCoin = new ethers.Contract(POKECOIN_CONTRACT, pokeAbi, provider);
        const decimals = await pokeCoin.decimals();
        const rawBal = await pokeCoin.balanceOf(userAddress);
        pokeBal = (Number(rawBal) / 10 ** decimals).toFixed(2);
      } catch (err) {
        console.warn("⚠️ PokéCoin contract unreachable or invalid:", err);
      }

      // ✅ Safely update UI (verify each element exists)
      if (connectBtn) {
        connectBtn.textContent = shortAddr;
        connectBtn.style.background = "#22c55e";
        connectBtn.style.color = "#fff";
        connectBtn.style.cursor = "pointer";
      }

      if (wmAddressShort) wmAddressShort.textContent = shortAddr;
      if (wmBalance) wmBalance.textContent = `${formattedEth} ETH | ${pokeBal} PKC`;
      if (wmNetwork) wmNetwork.textContent = network.name.toUpperCase();
      if (walletMenu) walletMenu.setAttribute("aria-hidden", "true");

      console.log(`✅ Connected to wallet: ${userAddress}`);
    } catch (err) {
      console.error("❌ Wallet connection failed:", err);
      alert("Wallet connection failed. Check console for details.");
    }
  }

  // ======================================
  // DISCONNECT WALLET
  // ======================================
  function disconnectWallet() {
    userAddress = null;
    if (connectBtn) {
      connectBtn.textContent = "CONNECT WALLET";
      connectBtn.style.background = "#ffca3b";
      connectBtn.style.color = "#fff";
      connectBtn.style.cursor = "pointer";
    }
    if (walletMenu) walletMenu.setAttribute("aria-hidden", "true");
    console.log("🔒 Wallet disconnected (UI reset).");
  }

  // ======================================
  // HOVER DROPDOWN BEHAVIOR
  // ======================================
  let hoverTimeout;

  function showMenu() {
    if (userAddress && walletMenu) {
      clearTimeout(hoverTimeout);
      walletMenu.setAttribute("aria-hidden", "false");
    }
  }

  function hideMenu() {
    hoverTimeout = setTimeout(() => {
      if (walletMenu) walletMenu.setAttribute("aria-hidden", "true");
    }, 200);
  }

  // Hover logic for both elements
  connectBtn.addEventListener("mouseenter", showMenu);
  connectBtn.addEventListener("mouseleave", hideMenu);
  if (walletMenu) {
    walletMenu.addEventListener("mouseenter", showMenu);
    walletMenu.addEventListener("mouseleave", hideMenu);
  }

  // ======================================
  // CLICK TO CONNECT
  // ======================================
  connectBtn.addEventListener("click", async () => {
    if (!userAddress) {
      await connectWallet();
    }
  });

  if (wmLogoutBtn) wmLogoutBtn.addEventListener("click", disconnectWallet);

  // ======================================
  // AUTO RECONNECT
  // ======================================
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());

    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts.length > 0) {
        await connectWallet();
      }
    } catch (err) {
      console.warn("Auto reconnect check failed:", err);
    }
  }
});
