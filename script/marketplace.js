  // lightweight listing renderer using window.app helpers + marketplace ABI
  (async function(){
    const provider = new ethers.JsonRpcProvider(); // will fallback to default provider
    const mkt = new ethers.Contract("0x932eAF9A08C1E465A94db0ceDDEdB30aF3D371f6", [
      "event ItemListed(address indexed nftAddress,uint256 indexed tokenId,address indexed seller,uint256 priceWei)",
      "function listings(address,uint256) view returns (address seller,uint256 priceWei)"
    ], provider);

    // change fromBlock to your deployment block for speed
    const filter = mkt.filters.ItemListed("0x61F9680688aA57E9aF56F21091B860fEF9Ffb1A9");
    const logs = await provider.getLogs({ ...filter, fromBlock: 0, toBlock: "latest" });
    const iface = new ethers.Interface([ "event ItemListed(address indexed nftAddress,uint256 indexed tokenId,address indexed seller,uint256 priceWei)" ]);
    const events = logs.map(l => iface.parseLog(l));
    const latest = {};
    for(const ev of events) latest[ev.args.tokenId.toString()] = ev.args;

    const container = document.getElementById("listings");
    container.innerHTML = "";
    for(const tidStr of Object.keys(latest).sort((a,b)=>Number(b)-Number(a))) {
      const info = latest[tidStr];
      // query current listing to ensure not sold/cancelled
      const lm = await mkt.listings("0x61F9680688aA57E9aF56F21091B860fEF9Ffb1A9", tidStr);
      if (lm.priceWei.toString() === "0") continue;
      const priceEth = ethers.formatUnits(lm.priceWei, "ether");
      // fetch tokenURI via app's nft contract (using window.app.getNftContract not directly available here)
      // We'll just show token id and price for simplicity and let user click Buy
      const card = document.createElement("div"); card.className="card";
      card.innerHTML = `<div class="poke-name">Token #${tidStr}</div>
                        <div>Price: ${priceEth} ETH</div>
                        <button data-tid="${tidStr}" class="buyBtn">Buy</button>`;
      container.appendChild(card);
    }

    // Buy handlers (calls window.app.buyToken)
    container.addEventListener("click", async (e) => {
      if (!e.target.classList.contains("buyBtn")) return;
      const tid = e.target.dataset.tid;
      if (!window.app || !window.app.buyToken) return alert("Connect & ensure app script is loaded");
      // get price by calling listings view
      const readMkt = new ethers.Contract("0x932eAF9A08C1E465A94db0ceDDEdB30aF3D371f6", ["function listings(address,uint256) view returns (address seller,uint256 priceWei)"], provider);
      const lm = await readMkt.listings("0x61F9680688aA57E9aF56F21091B860fEF9Ffb1A9", tid);
      const priceEth = ethers.formatUnits(lm.priceWei, "ether");
      try {
        await window.app.buyToken(tid, priceEth);
        alert("Purchase submitted — confirm in MetaMask.");
      } catch(err) { alert("Buy failed: " + err.message); }
    });
  })();