use ducatuscore

const blocksDeleted = db.blocks.deleteMany({chain: "DUCX"})
print(`Blocks deleted: ${blocksDeleted.deletedCount}`)
const transactionsDeleted = db.transactions.deleteMany({chain: "DUCX"})
print(`Transactions deleted: ${transactionsDeleted.deletedCount}`)
const eventsDeleted = db.events.deleteMany({"payload.chain": "DUCX"})
print(`Events deleted: ${eventsDeleted.deletedCount}`)
db.state.updateOne(
  {},
  {
    $pull: { initialSyncComplete: "DUCX:mainnet" },
    $unset: {
      "syncingNode:DUCX:testnet": "",
      "syncingNode:DUCX:mainnet": ""
    }
  }
)
print(`State updated`);
