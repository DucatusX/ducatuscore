import { Web3 } from '@ducatuscore/crypto';

const { toBN } = Web3.utils;

/**
 * Helpers for EVM (wei-scale) amounts.
 *
 * A wei value routinely exceeds Number.MAX_SAFE_INTEGER - 2^53 wei is only 0.009 of a token at 18
 * decimals - so these values travel through the service as decimal strings and every operation on
 * them has to go through BN. Doing the arithmetic with JS numbers snaps the value to the nearest
 * representable double, which can round a balance *up* and make the service authorize a transfer
 * of more than the address actually holds.
 */

/**
 * Normalizes a wei value to a BN. Values produced by older nodes (or by non-EVM code paths) may
 * still arrive as JS numbers; those are rendered without exponential notation, which toBN rejects.
 */
export function toWeiBN(value: string | number | null | undefined): any {
  if (value == null || value === '') {
    return toBN(0);
  }
  if (typeof value === 'number') {
    const rendered = Math.trunc(value).toLocaleString('fullwide', {
      useGrouping: false,
      maximumFractionDigits: 0
    });
    return toBN(rendered);
  }
  return toBN(value.toString());
}

/** Sum of the amounts of a txp's outputs, in wei. */
export function sumOutputsWei(outputs): any {
  return (outputs || []).reduce((sum, output) => sum.add(toWeiBN(output.amount)), toBN(0));
}

/**
 * Total amount a txp moves, in wei. Prefers the outputs over the stored txp.amount: the latter is
 * produced by a lodash sum, which concatenates rather than adds when the amounts are strings.
 */
export function txpTotalWei(txp): any {
  if (txp && txp.outputs && txp.outputs.length) {
    return sumOutputsWei(txp.outputs);
  }
  return toWeiBN(txp && txp.amount);
}

/** Sum of the amounts locked by the given pending txps, in wei. */
export function lockedSumWei(txps): any {
  return (txps || []).reduce((sum, txp) => sum.add(txpTotalWei(txp)), toBN(0));
}
