// app.js (updated) - paste/replace your current app.js with this
// Requires ethers.umd.min.js loaded BEFORE this file (index.html currently does). :contentReference[oaicite:4]{index=4}

const CONFIG = {
  chainIdHex: "0xaa36a7", // Sepolia
  explorerBase: "https://sepolia.etherscan.io/address/",
  // ► SET THESE to your deployed contract addresses:
  tokenAddress: "0x1495E05d5a70A85AC8c972aBCf1819F7cca17b09",       // your game token (PKC) ERC-20
  nftAddress:   "0x61F9680688aA57E9aF56F21091B860fEF9Ffb1A9",      // your ERC-721 NFT contract
  marketplaceAddress: "0x932eAF9A08C1E465A94db0ceDDEdB30aF3D371f6"  // your marketplace contract
};

// ---------- existing state & helpers (kept) ----------
let provider = null;
let signer = null;
let userAddress = null;
let isWalletConnected = false;
const $ = id => document.getElementById(id);
function pick(...ids) { for (const id of ids) { const el = $(id); if (el) return el; } return null; }
function short(addr) { return addr ? addr.slice(0,6) + "..." + addr.slice(-4) : ""; }

// ---------- popup / dropdown / hover logic (unchanged, kept from your file) ----------
/* ... [keep the exact popup/dropdown/hover functions you already have] ...
   For brevity here I'm including those functions verbatim; when pasting, keep everything below
   from showPopup() through protectNavigation() and DOM wiring unchanged except where noted. */

// ---------- POPUP / DROPDOWN (unchanged) ----------
function showPopup() { const p = $("walletPopup"); if (p) p.style.display = "flex"; }
function hidePopup() { const p = $("walletPopup"); if (p) p.style.display = "none"; }
function showDropdown() { const menu = pick("walletMenu","walletDropdown","walletMenu"); if (!menu) return; menu.setAttribute("aria-hidden","false"); }
function hideDropdown() { const menu = pick("walletMenu","walletDropdown","walletMenu"); if (!menu) return; menu.setAttribute("aria-hidden","true"); }
function toggleDropdown() { const menu = pick("walletMenu","walletDropdown","walletMenu"); if (!menu) return; const hidden = menu.getAttribute("aria-hidden")==="true"; hidden ? showDropdown() : hideDropdown(); }

// ---------- Hover support (kept) ----------
let _hoverEnabled = false, _enterHandler = null, _leaveHandler = null, _menuLeaveHandler = null;
function enableHoverDropdown() {
  if (_hoverEnabled) return;
  const btn = $("connectWalletBtn");
  const menu = pick("walletMenu","walletDropdown","walletMenu");
  if (!btn || !menu) return;
  menu.setAttribute("aria-hidden","true");
  _enterHandler = () => { if (isWalletConnected) menu.setAttribute("aria-hidden","false"); };
  _leaveHandler = () => { setTimeout(()=>{ try{ if(!menu.matches(":hover") && !btn.matches(":hover")) menu.setAttribute("aria-hidden","true"); }catch(e){ menu.setAttribute("aria-hidden","true"); } }, 120); };
  _menuLeaveHandler = () => { setTimeout(()=>{ try{ if(!menu.matches(":hover") && !btn.matches(":hover")) menu.setAttribute("aria-hidden","true"); }catch(e){ menu.setAttribute("aria-hidden","true"); } }, 80); };
  btn.addEventListener("mouseenter", _enterHandler);
  btn.addEventListener("mouseleave", _leaveHandler);
  menu.addEventListener("mouseleave", _menuLeaveHandler);
  _hoverEnabled = true;
}
function disableHoverDropdown() {
  if (!_hoverEnabled) return;
  const btn = $("connectWalletBtn"), menu = pick("walletMenu","walletDropdown","walletMenu");
  if (btn && _enterHandler) btn.removeEventListener("mouseenter", _enterHandler);
  if (btn && _leaveHandler) btn.removeEventListener("mouseleave", _leaveHandler);
  if (menu && _menuLeaveHandler) menu.removeEventListener("mouseleave", _menuLeaveHandler);
  _enterHandler = _leaveHandler = _menuLeaveHandler = null; _hoverEnabled = false;
  if (menu) menu.setAttribute("aria-hidden","true");
}

// ---------- Connect wallet (kept but extended below populateDropdown usage) ----------
async function connectWallet() {
  try {
    if (!window.ethereum) { alert("MetaMask not found. Please install MetaMask."); return; }
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    // network check (kept)
    try { const net = await provider.getNetwork(); const chainHex = "0x" + net.chainId.toString(16);
      if (chainHex !== CONFIG.chainIdHex) console.warn(`Connected network ${chainHex} != expected ${CONFIG.chainIdHex}`);
    } catch(e){}

    isWalletConnected = true;
    const btn = $("connectWalletBtn"); if (btn) btn.innerText = short(userAddress);

    // populate dropdown (ETH) and token balance (new)
    await populateDropdown();
    await updateTokenBalance();       // <-- NEW: load ERC-20 token balance into menu

    hidePopup();
    enableHoverDropdown();

    if (window.ethereum && window.ethereum.on) {
      window.ethereum.on("accountsChanged", onAccountsChanged);
      window.ethereum.on("chainChanged", onChainChanged);
    }
  } catch (err) { console.error("connectWallet error:", err); alert("Connection failed: " + (err?.message || err)); }
}

// ---------- Populate dropdown info (kept) ----------
async function populateDropdown() {
  if (!isWalletConnected || !provider || !userAddress) return;
  try {
    const addrShortEl = pick("wmAddressShort","wdAddressShort");
    if (addrShortEl) addrShortEl.innerText = short(userAddress);
    const balanceEl = pick("wmBalance","wdBalance");
    if (balanceEl) { const bal = await provider.getBalance(userAddress); balanceEl.innerText = parseFloat(ethers.formatUnits(bal,"ether")).toFixed(4) + " ETH"; }
    const netEl = pick("wmNetwork","wdNetwork");
    if (netEl) { const net = await provider.getNetwork(); netEl.innerText = `${net.name} (${ "0x" + net.chainId.toString(16) })`; }
    const explorerEl = pick("wmExplorer","wdExplorer");
    if (explorerEl) explorerEl.href = CONFIG.explorerBase + userAddress;
  } catch (err) { console.warn("populateDropdown error", err); }
}

// ---------- NEW: ERC-20 token balance (PKC) ----------
const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

async function getTokenContract() {
  if (!CONFIG.tokenAddress || !ethers) return null;
  const readProvider = provider || new ethers.JsonRpcProvider(); // fallback
  return new ethers.Contract(CONFIG.tokenAddress, erc20Abi, readProvider);
}

async function updateTokenBalance() {
  try {
    if (!isWalletConnected || !userAddress || !CONFIG.tokenAddress) {
      // hide token display if not configured
      const tEl = pick("wmToken","wdToken");
      if (tEl) tEl.style.display = "none";
      return;
    }
    const token = await getTokenContract();
    if (!token) return;
    const [rawBal, decimals, symbol] = await Promise.all([ token.balanceOf(userAddress), token.decimals(), token.symbol() ]);
    const bal = Number(ethers.formatUnits(rawBal, decimals));
    // Put token display into existing menu: we prefer id "wmToken" or "wdToken" if present, else append to wmBalance (non-destructive)
    const tokenEl = pick("wmToken","wdToken");
    if (tokenEl) {
      tokenEl.style.display = "block";
      tokenEl.innerText = `${bal.toFixed(4)} ${symbol}`;
    } else {
      // fallback: show below ETH balance by creating text node (non-invasive)
      const balanceEl = pick("wmBalance","wdBalance");
      if (balanceEl && !document.getElementById("wmTokenInline")) {
        const span = document.createElement("div");
        span.id = "wmTokenInline";
        span.style.fontSize = "12px";
        span.style.color = "#9c9c9c";
        span.innerText = `${bal.toFixed(4)} ${symbol}`;
        balanceEl.parentElement.appendChild(span);
      } else if (balanceEl && document.getElementById("wmTokenInline")) {
        document.getElementById("wmTokenInline").innerText = `${bal.toFixed(4)} ${symbol}`;
      }
    }
  } catch (e) {
    console.warn("updateTokenBalance error", e);
  }
}

// ---------- Copy address & logout (kept) ----------
async function copyAddress() { if (!userAddress) return alert("No address to copy"); try { await navigator.clipboard.writeText(userAddress); const copyBtn = pick("wmCopyBtn","wdCopyBtn"); if (copyBtn) { const old = copyBtn.innerText; copyBtn.innerText = "Copied!"; setTimeout(()=> { copyBtn.innerText = old; }, 1200); } } catch (err) { alert("Copy failed: " + err.message); } }
function logoutLocal() {
  isWalletConnected = false; provider = null; signer = null; userAddress = null;
  const btn = $("connectWalletBtn"); if (btn) btn.innerText = "CONNECT WALLET";
  hideDropdown(); hidePopup();
  const addressField = pick("wmAddressShort","wdAddressShort"); if (addressField) addressField.innerText = "0x00...0000";
  const balanceField = pick("wmBalance","wdBalance"); if (balanceField) balanceField.innerText = "— ETH";
  const tokenField = pick("wmToken","wdToken"); if (tokenField) tokenField.innerText = "—";
  const networkField = pick("wmNetwork","wdNetwork"); if (networkField) networkField.innerText = "—";
  if (window.ethereum && window.ethereum.removeListener) {
    try { window.ethereum.removeListener("accountsChanged", onAccountsChanged); window.ethereum.removeListener("chainChanged", onChainChanged); } catch(e) {}
  }
  disableHoverDropdown();
}

// ---------- Wallet event handlers ----------
async function onAccountsChanged(accounts) {
  if (!accounts || accounts.length === 0) { logoutLocal(); } else {
    userAddress = accounts[0]; provider = new ethers.BrowserProvider(window.ethereum); signer = provider.getSigner(); isWalletConnected = true;
    const btn = $("connectWalletBtn"); if (btn) btn.innerText = short(userAddress);
    await populateDropdown(); await updateTokenBalance(); enableHoverDropdown();
  }
}
function onChainChanged(chainId) { console.log("chainChanged", chainId); populateDropdown(); updateTokenBalance(); }

// ---------- Marketplace integration (minimal helpers) ----------
const nftAbi = [
  "function mintPokemon(address to,string calldata tokenURI,string calldata name_,string calldata pokeType_,uint16 hp_,uint16 atk_,uint16 def_,uint8 rarity_) external returns (uint256)",
  "function approve(address to, uint256 tokenId) external",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

const marketplaceAbi = [
  "function listItem(address nftAddress,uint256 tokenId,uint256 priceWei) external",
  "function cancelListing(address nftAddress,uint256 tokenId) external",
  "function buyItem(address nftAddress,uint256 tokenId) payable external",
  "function listings(address,uint256) view returns (address seller,uint256 priceWei)",
  "event ItemListed(address indexed nftAddress,uint256 indexed tokenId,address indexed seller,uint256 priceWei)",
  "event ItemBought(address indexed nftAddress,uint256 indexed tokenId,address indexed buyer,uint256 priceWei)",
  "event ItemCancelled(address indexed nftAddress,uint256 indexed tokenId,address indexed seller)"
];

function getNftContract(signerOrProvider) { return new ethers.Contract(CONFIG.nftAddress, nftAbi, signerOrProvider || provider); }
function getMarketplaceContract(signerOrProvider) { return new ethers.Contract(CONFIG.marketplaceAddress, marketplaceAbi, signerOrProvider || provider); }

// Exposed helper functions for console / UI integration
window.app = {
  // mint an NFT (owner-only depending on your contract). tokenURI should be full ipfs URI (e.g. ipfs://<CID>/1.json) or HTTP gateway
  async mintNFT(tokenURI, name_, pokeType_, hp_, atk_, def_, rarity_) {
    if (!signer) return alert("Connect wallet (owner) first");
    const nft = getNftContract(signer);
    const tx = await nft.mintPokemon(await signer.getAddress(), tokenURI, name_, pokeType_, hp_, atk_, def_, rarity_);
    return tx.wait();
  },
  // approve marketplace to transfer token
  async approve(tokenId) {
    if (!signer) return alert("Connect wallet");
    const nft = getNftContract(signer);
    const tx = await nft.approve(CONFIG.marketplaceAddress, tokenId);
    return tx.wait();
  },
  // list token (seller must be owner and must approve marketplace)
  async listToken(tokenId, priceEth) {
    if (!signer) return alert("Connect wallet");
    const mkt = getMarketplaceContract(signer);
    const priceWei = ethers.parseUnits(String(priceEth), "ether");
    const tx = await mkt.listItem(CONFIG.nftAddress, tokenId, priceWei);
    return tx.wait();
  },
  // cancel listing
  async cancelListing(tokenId) {
    if (!signer) return alert("Connect wallet");
    const mkt = getMarketplaceContract(signer);
    const tx = await mkt.cancelListing(CONFIG.nftAddress, tokenId);
    return tx.wait();
  },
  // buy listed token (buyer pays priceEth)
  async buyToken(tokenId, priceEth) {
    if (!signer) return alert("Connect wallet");
    const mkt = getMarketplaceContract(signer);
    const priceWei = ethers.parseUnits(String(priceEth), "ether");
    const tx = await mkt.buyItem(CONFIG.nftAddress, tokenId, { value: priceWei });
    return tx.wait();
  },
  // convenience: fetch token balance right now
  async refreshTokenBalance() { return updateTokenBalance(); }
};

// ---------- Protected nav wiring (kept) ----------
function protectNavigation() {
  const protectedNav = [
    { id: "navMarketplace", href: "marketplace.html" },
    { id: "navPlayGames", href: "lobby.html" },
    { id: "navCollection", href: "collection.html" },
    { id: "navWhitepaper", href: "whitepaper.html" }
  ];
  protectedNav.forEach(nav => {
    const el = $(nav.id);
    if (!el) return;
    el.addEventListener("click", e => {
      if (!isWalletConnected) { e.preventDefault(); showPopup(); return; }
      if (!el.getAttribute("href")) window.location.href = nav.href;
    });
  });
}

// ---------- DOM wiring (kept) ----------
document.addEventListener("DOMContentLoaded", () => {
  const connectBtn = $("connectWalletBtn");
  if (connectBtn) {
    connectBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!isWalletConnected) { await connectWallet(); } else { /* do nothing: hover shows menu */ }
    });
  } else { console.warn("connectWalletBtn not found in DOM"); }

  const popupConnect = $("popupConnectBtn"); if (popupConnect) popupConnect.addEventListener("click", connectWallet);
  const popupClose = $("popupCloseBtn"); if (popupClose) popupClose.addEventListener("click", hidePopup);

  const copyBtn = pick("wmCopyBtn","wdCopyBtn"); if (copyBtn) copyBtn.addEventListener("click", copyAddress);
  const logoutBtn = pick("wmLogoutBtn","wdLogoutBtn"); if (logoutBtn) logoutBtn.addEventListener("click", () => { if (confirm("Log out from dApp (local)?")) logoutLocal(); });

  document.addEventListener("click", (ev) => {
    const menu = pick("walletMenu","walletDropdown","walletMenu");
    const btn = $("connectWalletBtn");
    if (!menu) return;
    const hidden = menu.getAttribute("aria-hidden")==="true";
    if (hidden) return;
    const tgt = ev.target;
    if (menu.contains(tgt) || (btn && btn.contains(tgt))) return;
    hideDropdown();
  });

  protectNavigation();
});
