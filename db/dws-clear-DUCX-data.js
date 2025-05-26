use dws

const walletIds = db.wallets.find({ coin: 'ducx' }, { id: 1 }).toArray().map(doc => doc.id)
const txsDeleted = db.txs.deleteMany({
  $or: [{ coin: 'ducx' }, { chain: 'ducx' }, { walletId: { $in: walletIds } }]
})
print(`Txs deleted: ${txsDeleted.deletedCount}`)
const cacheDeleted = db.cache.deleteMany({
  $or: [
    { walletId: { $in: walletIds } },
    {
      $and: [
        {
          $or: walletIds.map(id => ({
            walletId: { $regex: `^${id}` }
          }))
        },
        { type: { $in: ['historyCacheStatusV8', 'historyCacheV8', 'historyStream'] } }
      ]
    }
  ]
})
print(`Cache deleted: ${cacheDeleted.deletedCount}`)
const addressesUnregistered = db.addresses.updateMany(
  { walletId: { $in: walletIds } },
  { $set: { beRegistered: null } }
)
print(`Addresses unregistered: ${addressesUnregistered.modifiedCount}`)
const walletsUnregistered = db.wallets.updateMany({ id: { $in: walletIds } }, { $set: { beRegistered: null } })
print(`Wallets unregistered: ${walletsUnregistered.modifiedCount}`)
