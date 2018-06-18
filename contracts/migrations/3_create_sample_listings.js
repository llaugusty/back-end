var ListingsRegistry = artifacts.require("./ListingsRegistry.sol");
var Listing = artifacts.require("./Listing.sol");
var Purchase = artifacts.require("./Purchase.sol");
var ipfsAPI = require('ipfs-api')
const os = require("os")
var ifaces = os.networkInterfaces();
var self = this;
var myIP;
var fs = require('fs');

const IPFSFactory = require('ipfsd-ctl')
const f = IPFSFactory.create()



Object.keys(ifaces).forEach(function (ifname) {
  var alias = 0;

  ifaces[ifname].forEach(function (iface) {
    if ('IPv4' !== iface.family || iface.internal !== false) {
      // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
      return;
    }

    if (alias >= 1) {
      // this single interface has multiple ipv4 addresses
      console.log(ifname + ':' + alias, iface.address);
    } else {
      // this interface has only one ipv4 adress
      console.log(ifname, iface.address);
    }
    myIP = 'http://' + iface.address;
    ++alias;
  });
});

const fixturesDir = __dirname + '/../fixtures'

module.exports = function(deployer, network) {
  return deployer.then(() => {
    return deploy_sample_contracts(network)
  })
}


const populateIpfs = (ipfsd) =>
  new Promise((resolve, reject) => {
    // f.spawn(function (err, ipfsd) {
    //   if (err) { throw err }
    //   ipfsd.api.files.add(fixturesDir, {recursive: true}, (err, result) => {
    //     if (err) {
    //       return reject(err)
    //     }
    //     console.log('adding from fs', result);
    //     resolve(result)
    //   })
    // })
    var files = fs.readdirSync(fixturesDir);

    var datas = files.map(file => {
      var result;
      return fs.readFileSync(fixturesDir + '/' + file);
    })

    console.log('datas', datas);

    f.spawn(function (err, ipfsd) {
      if (err) { throw err }
      ipfsd.start([], (err, ipfsApi) => {
        var result = ipfsApi.util.addFromFs(fixturesDir, { recursive: true }, function(err, file) {
          console.log('errrrr', err);
          console.log('fillle', file);
          resolve(file);
          ipfsd.stop();
        }) ;
      });
    })
  })

async function deploy_sample_contracts(network) {
  var data = await populateIpfs();
  console.log('data', data);
  var cost = [web3.toWei(3, "ether"), web3.toWei(0.6, "ether"), web3.toWei(8.5, "ether"), web3.toWei(1.5, "ether"), web3.toWei(0.3, "ether")];

  let accounts = await new Promise((resolve, reject) => {
    web3.eth.getAccounts((error, result) => {
      if (error) {
        reject(err)
      }
      resolve(result)
    })
  })

  const default_account = accounts[0]
  const a_seller_account = accounts[1]
  const a_buyer_account = accounts[2]
  const another_buyer_account = accounts[3]

  const listingsRegistry = await ListingsRegistry.deployed()

  const getListingContract = async transaction => {
    const index = transaction.logs.find(x => x.event == "NewListing").args._index
    const info = await listingsRegistry.getListing(index)
    const address = info[0]
    return Listing.at(address)
  }

  const buyListing = async (listing, qty, from) => {
    const price = await listing.price()
    const transaction = await listing.buyListing(qty, { from: from, value: price, gas: 4476768 })
    const address = transaction.logs.find(x => x.event == "ListingPurchased").args._purchaseContract
    return Purchase.at(address)
  }

  console.log(`default_account:       ${default_account}`)
  console.log(`a_seller_account:      ${a_seller_account}`)
  console.log(`a_buyer_account:       ${a_buyer_account}`)
  console.log(`another_buyer_account: ${another_buyer_account}`)

  console.log('data', data[1]);

  const additionalInfo = [
    { from: a_seller_account, gas: 4476768 },
    { from: default_account, gas: 4476768 },
    { from: a_seller_account, gas: 4476768 },
    { from: default_account, gas: 4476768 },    
    { from: default_account, gas: 4476768 }    
  ];
  console.log('myIPaaa', myIP)
  for (var i = 0; i < 4; ++i) {
    console.log('ipfs', 'https://ipfs.io/ipfs/' + data[i].hash)
    await listingsRegistry.create('https://ipfs.io/ipfs/' + data[i].hash, cost[i], 150, additionalInfo[i]);
  }
  const ticketsTransaction = await listingsRegistry.create(
    'https://ipfs.io/ipfs/' + data[4].hash,
    cost[4],
    150,
    additionalInfo[4]
  )

  var listing = await listingsRegistry.getListing(0);

  console.log('listing', listing)
  if (network === "development") {
    // Creating ticket purchases at different stages
    const ticketsListing = await getListingContract(ticketsTransaction)
    let purchase

    purchase = await buyListing(ticketsListing, 1, a_buyer_account)

    var purchaseData = await purchase.data();

    purchase = await buyListing(ticketsListing, 1, a_buyer_account)
    await purchase.sellerConfirmShipped({ from: default_account })

    purchase = await buyListing(ticketsListing, 1, another_buyer_account)
    await purchase.sellerConfirmShipped({ from: default_account })
    await purchase.buyerConfirmReceipt(5, "", { from: another_buyer_account })

    purchase = await buyListing(ticketsListing, 1, another_buyer_account)
    await purchase.sellerConfirmShipped({ from: default_account })
    await purchase.buyerConfirmReceipt(3, "", { from: another_buyer_account })
    await purchase.sellerCollectPayout(4,"",{ from: default_account })
  }
}
