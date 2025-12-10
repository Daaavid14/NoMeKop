// app.js — reset & minimal version
// Requires: ethers.umd.min.js loaded BEFORE this file

/* -------------------------
   CONFIG (keep your contracts)
   ------------------------- */
const CONFIG = {
  chainIdHex: "0xaa36a7", // Sepolia
  explorerBase: "https://sepolia.etherscan.io/address/",
  tokenAddress: "0x1495E05d5a70A85AC8c972aBCf1819F7cca17b09",       // PKC ERC-20
  nftAddress:   "0x61F9680688aA57E9aF56F21091B860fEF9Ffb1A9",      // NFT contract
  marketplaceAddress: "0x932eAF9A08C1E465A94db0ceDDEdB30aF3D371f6"  // Marketplace contract
};

// Fallback RPC (public) to avoid localhost attempts
const FALLBACK_RPC = "https://rpc.sepolia.org";

/* -------------------------
   State + small helpers
   ------------------------- */
let provider = null;
let signer = null;
let userAddress = null;
let isWalletConnected = false;

const $ = id => document.getElementById(id);
function pick(...ids) { for (const id of ids) { const el = $(id); if (el) return el; } return null; }
function short(addr){ return addr ? addr.slice(0,6) + "..." + addr.slice(-4) : ""; }

/* -------------------------
   Simple popup/dropdown helpers
   (do not change your HTML/CSS)
   ------------------------- */
function showPopup(){ const p = $("walletPopup"); if(p) p.style.display="flex"; }
function hidePopup(){ const p = $("walletPopup"); if(p) p.style.display="none"; }
function showDropdown(){ const m = pick("walletMenu","walletDropdown"); if(m) m.setAttribute("aria-hidden","false"); }
function hideDropdown(){ const m = pick("walletMenu","walletDropdown"); if(m) m.setAttribute("aria-hidden","true"); }

/* -------------------------
   Hover dropdown (keeps UX)
   ------------------------- */
let _hover = { enabled:false, enter:null, leave:null, mleave:null };
function enableHoverDropdown(){
  if(_hover.enabled) return;
  const btn = $("connectWalletBtn");
  const menu = pick("walletMenu","walletDropdown");
  if(!btn || !menu) return;
  menu.setAttribute("aria-hidden","true");
  _hover.enter = ()=> { if(isWalletConnected) menu.setAttribute("aria-hidden","false"); };
  _hover.leave = ()=> { setTimeout(()=>{ try{ if(!menu.matches(":hover") && !btn.matches(":hover")) menu.setAttribute("aria-hidden","true"); }catch(e){ menu.setAttribute("aria-hidden","true"); } }, 120); };
  _hover.mleave = ()=> { setTimeout(()=>{ try{ if(!menu.matches(":hover") && !btn.matches(":hover")) menu.setAttribute("aria-hidden","true"); }catch(e){ menu.setAttribute("aria-hidden","true"); } }, 80); };
  btn.addEventListener("mouseenter", _hover.enter);
  btn.addEventListener("mouseleave", _hover.leave);
  menu.addEventListener("mouseleave", _hover.mleave);
  _hover.enabled = true;
}
function disableHoverDropdown(){
  if(!_hover.enabled) return;
  const btn = $("connectWalletBtn");
  const menu = pick("walletMenu","walletDropdown");
  if(btn && _hover.enter) btn.removeEventListener("mouseenter", _hover.enter);
  if(btn && _hover.leave) btn.removeEventListener("mouseleave", _hover.leave);
  if(menu && _hover.mleave) menu.removeEventListener("mouseleave", _hover.mleave);
  _hover = { enabled:false, enter:null, leave:null, mleave:null };
  if(menu) menu.setAttribute("aria-hidden","true");
}

/* -------------------------
   Core: connect / auto-reconnect
   ------------------------- */
async function connectWallet(){
  if(!window.ethereum) { alert("Please install MetaMask"); return; }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  userAddress = await signer.getAddress();
  isWalletConnected = true;

  // persist hint so other pages attempt auto reconnect
  try { localStorage.setItem("nomekop_connected","1"); } catch(e){}

  const btn = $("connectWalletBtn");
  if(btn) btn.innerText = short(userAddress);

  await populateDropdown();
  await updateTokenBalance();

  hidePopup();
  enableHoverDropdown();

  if(window.ethereum && window.ethereum.on){
    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);
  }
}

// Try reconnect silently on page load
async function tryAutoReconnect(){
  try {
    if(!window.ethereum) return;
    // quick check: did user connect before?
    const hint = localStorage.getItem("nomekop_connected")==="1";

    // permission-free check
    let accounts = [];
    try { accounts = await window.ethereum.request({ method:"eth_accounts" }); } catch(e){ console.warn("eth_accounts failed", e); }

    // fallback: provider.listAccounts()
    if((!accounts || accounts.length===0) && typeof window.ethereum !== "undefined"){
      provider = new ethers.BrowserProvider(window.ethereum);
      const la = await provider.listAccounts();
      if(la && la.length>0) accounts = la;
    }

    if(accounts && accounts.length>0){
      if(!provider) provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
      userAddress = accounts[0];
      isWalletConnected = true;
      const btn = $("connectWalletBtn");
      if(btn) btn.innerText = short(userAddress);
      await populateDropdown();
      await updateTokenBalance();
      enableHoverDropdown();
      if(window.ethereum && window.ethereum.on){
        window.ethereum.on("accountsChanged", onAccountsChanged);
        window.ethereum.on("chainChanged", onChainChanged);
      }
      console.log("Auto-reconnected:", userAddress);
    }
  } catch(e){
    console.warn("Auto reconnect error", e);
  }
}

/* -------------------------
   Populate ETH + network display
   ------------------------- */
async function populateDropdown(){
  if(!isWalletConnected || !provider || !userAddress) return;
  try{
    const addr = pick("wmAddressShort","wdAddressShort");
    if(addr) addr.innerText = short(userAddress);
    const balEl = pick("wmBalance","wdBalance");
    if(balEl){ const b = await provider.getBalance(userAddress); balEl.innerText = parseFloat(ethers.formatUnits(b,"ether")).toFixed(4) + " ETH"; }
    const netEl = pick("wmNetwork","wdNetwork");
    if(netEl){ const net = await provider.getNetwork(); netEl.innerText = `${net.name} (${ "0x" + net.chainId.toString(16) })`; }
    const explorer = pick("wmExplorer","wdExplorer");
    if(explorer) explorer.href = CONFIG.explorerBase + userAddress;
  }catch(e){ console.warn("populateDropdown error", e); }
}

/* -------------------------
   ERC-20 token balance display
   ------------------------- */
const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];
async function getTokenContract(){
  if(!CONFIG.tokenAddress) return null;
  const readProvider = provider || new ethers.JsonRpcProvider(FALLBACK_RPC);
  return new ethers.Contract(CONFIG.tokenAddress, erc20Abi, readProvider);
}
async function updateTokenBalance(){
  try{
    if(!isWalletConnected || !userAddress || !CONFIG.tokenAddress) {
      const el = pick("wmToken","wdToken");
      if(el) el.style.display = "none";
      return;
    }
    const token = await getTokenContract();
    if(!token) return;
    const [raw, decimals, symbol] = await Promise.all([ token.balanceOf(userAddress), token.decimals(), token.symbol() ]);
    const bal = Number(ethers.formatUnits(raw, decimals));
    const tokenEl = pick("wmToken","wdToken");
    if(tokenEl){ tokenEl.style.display="block"; tokenEl.innerText = `${bal.toFixed(4)} ${symbol}`; }
    else {
      const balanceEl = pick("wmBalance","wdBalance");
      if(balanceEl && !document.getElementById("wmTokenInline")){
        const span = document.createElement("div");
        span.id = "wmTokenInline";
        span.style.fontSize = "12px";
        span.style.color = "#9c9c9c";
        span.innerText = `${bal.toFixed(4)} ${symbol}`;
        balanceEl.parentElement.appendChild(span);
      } else if(balanceEl && document.getElementById("wmTokenInline")){
        document.getElementById("wmTokenInline").innerText = `${bal.toFixed(4)} ${symbol}`;
      }
    }
  }catch(e){ console.warn("updateTokenBalance error", e); }
}

/* -------------------------
   Copy / logout
   ------------------------- */
async function copyAddress(){ if(!userAddress) return alert("No address"); try{ await navigator.clipboard.writeText(userAddress); const b = pick("wmCopyBtn","wdCopyBtn"); if(b){ const old=b.innerText; b.innerText="Copied!"; setTimeout(()=>b.innerText=old,1200); } }catch(e){ alert("Copy failed"); } }
function logoutLocal(){
  isWalletConnected=false; provider=null; signer=null; userAddress=null;
  try { localStorage.removeItem("nomekop_connected"); } catch(e){}
  const btn = $("connectWalletBtn"); if(btn) btn.innerText="CONNECT WALLET";
  hideDropdown(); hidePopup();
  const af = pick("wmAddressShort","wdAddressShort"); if(af) af.innerText="0x00...0000";
  const bf = pick("wmBalance","wdBalance"); if(bf) bf.innerText="— ETH";
  const tf = pick("wmToken","wdToken"); if(tf) tf.innerText="—";
  const nf = pick("wmNetwork","wdNetwork"); if(nf) nf.innerText="—";
  if(window.ethereum && window.ethereum.removeListener){
    try{ window.ethereum.removeListener("accountsChanged", onAccountsChanged); window.ethereum.removeListener("chainChanged", onChainChanged);}catch(e){}
  }
  disableHoverDropdown();
}

/* -------------------------
   Wallet event handlers
   ------------------------- */
async function onAccountsChanged(accounts){
  if(!accounts || accounts.length===0) { logoutLocal(); }
  else {
    userAddress = accounts[0];
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = provider.getSigner();
    isWalletConnected = true;
    const btn = $("connectWalletBtn"); if(btn) btn.innerText = short(userAddress);
    await populateDropdown(); await updateTokenBalance(); enableHoverDropdown();
  }
}
function onChainChanged(chainId){ console.log("chainChanged", chainId); populateDropdown(); updateTokenBalance(); }

/* -------------------------
   Marketplace minimal helpers (exposed)
   ------------------------- */
const nftAbi = [
  "function mintPokemon(address to,string tokenURI,string name_,string pokeType_,uint16 hp_,uint16 atk_,uint16 def_,uint8 rarity_) returns (uint256)",
  "function approve(address to,uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];
const marketplaceAbi = [
  "function listItem(address nftAddress,uint256 tokenId,uint256 priceWei)",
  "function cancelListing(address nftAddress,uint256 tokenId)",
  "function buyItem(address nftAddress,uint256 tokenId) payable",
  "function listings(address,uint256) view returns (address seller,uint256 priceWei)"
];
function getNftContract(signerOrProvider){ return new ethers.Contract(CONFIG.nftAddress, nftAbi, signerOrProvider || provider); }
function getMarketplaceContract(signerOrProvider){ return new ethers.Contract(CONFIG.marketplaceAddress, marketplaceAbi, signerOrProvider || provider); }

window.app = {
  async mintNFT(tokenURI, name_, pokeType_, hp_, atk_, def_, rarity_){
    if(!signer) return alert("Connect (owner) first");
    const nft = getNftContract(signer);
    const tx = await nft.mintPokemon(await signer.getAddress(), tokenURI, name_, pokeType_, hp_, atk_, def_, rarity_);
    return tx.wait();
  },
  async approve(tokenId){
    if(!signer) return alert("Connect first");
    const nft = getNftContract(signer);
    const tx = await nft.approve(CONFIG.marketplaceAddress, tokenId);
    return tx.wait();
  },
  async listToken(tokenId, priceEth){
    if(!signer) return alert("Connect first");
    const mkt = getMarketplaceContract(signer);
    const priceWei = ethers.parseUnits(String(priceEth), "ether");
    const tx = await mkt.listItem(CONFIG.nftAddress, tokenId, priceWei);
    return tx.wait();
  },
  async cancelListing(tokenId){
    if(!signer) return alert("Connect first");
    const mkt = getMarketplaceContract(signer);
    const tx = await mkt.cancelListing(CONFIG.nftAddress, tokenId);
    return tx.wait();
  },
  async buyToken(tokenId, priceEth){
    if(!signer) return alert("Connect first");
    const mkt = getMarketplaceContract(signer);
    const priceWei = ethers.parseUnits(String(priceEth), "ether");
    const tx = await mkt.buyItem(CONFIG.nftAddress, tokenId, { value: priceWei });
    return tx.wait();
  },
  async refreshTokenBalance(){ return updateTokenBalance(); }
};

/* -------------------------
   Protected nav wiring
   ------------------------- */
function protectNavigation(){
  const protectedNav = [
    { id: "navMarketplace", href: "marketplace.html" },
    { id: "navPlayGames", href: "lobby.html" },
    { id: "navCollection", href: "collection.html" },
    { id: "navWhitepaper", href: "whitepaper.html" }
  ];
  protectedNav.forEach(nav=>{
    const el = $(nav.id);
    if(!el) return;
    el.addEventListener("click", e => {
      if(!isWalletConnected){ e.preventDefault(); showPopup(); return; }
      if(!el.getAttribute("href")) window.location.href = nav.href;
    });
  });
}

/* -------------------------
   DOM wiring & auto-reconnect on load
   ------------------------- */
async function tryAutoReconnect(){
  try {
    if(!window.ethereum) return;
    let accounts = [];
    try { accounts = await window.ethereum.request({ method: "eth_accounts" }); } catch(e){ console.warn("eth_accounts failed", e); }
    if((!accounts || accounts.length===0) && typeof window.ethereum !== "undefined"){
      provider = new ethers.BrowserProvider(window.ethereum);
      const la = await provider.listAccounts();
      if(la && la.length>0) accounts = la;
    }
    if(accounts && accounts.length>0){
      if(!provider) provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
      userAddress = accounts[0];
      isWalletConnected = true;
      const btn = $("connectWalletBtn"); if(btn) btn.innerText = short(userAddress);
      await populateDropdown(); await updateTokenBalance();
      enableHoverDropdown();
      if(window.ethereum && window.ethereum.on){
        window.ethereum.on("accountsChanged", onAccountsChanged);
        window.ethereum.on("chainChanged", onChainChanged);
      }
      console.log("Auto-reconnected", userAddress);
    }
  } catch(e){ console.warn("tryAutoReconnect error", e); }
}

document.addEventListener("DOMContentLoaded", async ()=>{
  await tryAutoReconnect();

  const connectBtn = $("connectWalletBtn");
  if(connectBtn) {
    connectBtn.addEventListener("click", async (ev)=>{
      ev.stopPropagation();
      if(!isWalletConnected) await connectWallet();
    });
  }

  const popupConnect = $("popupConnectBtn");
  if(popupConnect) popupConnect.addEventListener("click", connectWallet);
  const popupClose = $("popupCloseBtn");
  if(popupClose) popupClose.addEventListener("click", hidePopup);

  const copyBtn = pick("wmCopyBtn","wdCopyBtn");
  if(copyBtn) copyBtn.addEventListener("click", copyAddress);
  const logoutBtn = pick("wmLogoutBtn","wdLogoutBtn");
  if(logoutBtn) logoutBtn.addEventListener("click", ()=>{ if(confirm("Log out (local)?")) logoutLocal(); });

  document.addEventListener("click", (ev)=>{
    const menu = pick("walletMenu","walletDropdown");
    const btn = $("connectWalletBtn");
    if(!menu) return;
    const hidden = menu.getAttribute("aria-hidden")==="true";
    if(hidden) return;
    if(menu.contains(ev.target) || (btn && btn.contains(ev.target))) return;
    hideDropdown();
  });

  protectNavigation();
});
