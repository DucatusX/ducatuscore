# Ducatuscore Mnemonics

BIP39 Mnemonics for ducatuscore

**A module for ducatuscore that implements [Mnemonic code for generating deterministic keys](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki).**

## Getting Started

This library is distributed in both the npm packaging systems.

```sh
npm install @ducatuscore/lib  #this to install ducatuscore-lib since it is a peerDependecy
npm install @ducatuscore/mnemonic
```

There are many examples of how to use it on the developer guide [section for mnemonic](./docs/index.md). For example, the following code would generate a new random mnemonic code and convert it to a `HDPrivateKey`.

```javascript
var Mnemonic = require('@ducatuscore/mnemonic');
var code = new Mnemonic(Mnemonic.Words.SPANISH);
code.toString(); // natal hada sutil año sólido papel jamón combate aula flota ver esfera...
var xpriv = code.toHDPrivateKey();
```
