import _ from 'lodash';
const Ducatuscore_ = {
  btc: require('@ducatuscore/lib'),
  bch: require('@ducatuscore/lib-cash')
};

export class BCHAddressTranslator {
  static getAddressCoin(address) {
    try {
      new Ducatuscore_['btc'].Address(address);
      return 'legacy';
    } catch (e) {
      try {
        const a = new Ducatuscore_['bch'].Address(address);
        if (a.toLegacyAddress() == address) return 'copay';
        return 'cashaddr';
      } catch (e) {
        return;
      }
    }
  }

  // Supports 3 formats:  legacy (1xxx, mxxxx); Copay: (Cxxx, Hxxx), Cashaddr(qxxx);
  static translate(addresses, to, from?) {
    let wasArray = true;
    if (!_.isArray(addresses)) {
      wasArray = false;
      addresses = [addresses];
    }
    from = from || BCHAddressTranslator.getAddressCoin(addresses[0]);

    let ret;
    if (from == to) {
      ret = addresses;
    } else {
      ret = _.filter(
        _.map(addresses, x => {
          const ducatuscore = Ducatuscore_[from == 'legacy' ? 'btc' : 'bch'];
          let orig;

          try {
            orig = new ducatuscore.Address(x).toObject();
          } catch (e) {
            return null;
          }

          if (to == 'cashaddr') {
            return Ducatuscore_['bch'].Address.fromObject(orig).toCashAddress(true);
          } else if (to == 'copay') {
            return Ducatuscore_['bch'].Address.fromObject(orig).toLegacyAddress();
          } else if (to == 'legacy') {
            return Ducatuscore_['btc'].Address.fromObject(orig).toString();
          }
        })
      );
    }
    if (wasArray) return ret;
    else return ret[0];
  }
}

module.exports = BCHAddressTranslator;
