### Compound Finance

Compound finance is a decentralised borrowing and lending protocol facilitating peer to peer collateralized and uncollateralized loans. Built on Ethereum, Compound establishes pools of assets using algorithmically derived interest rates, based on the supply and demand of the asset.

### supplying assets

By aggregating the supply of each user Compound offers significantly more liquidity than direct lending. Assets supplied to a market a represented by an ERC-20 token balance ('cToken). As the money market accrues interest, though borrowing demand, cTokens become convertible into an increasing amount of the underlying asset.

Individuals the hold Ether, or any token, can supply their tokens to the Compound protocol and earn interest without having to manage their asset of take speculative risks.

`Δy= x+Δx / yΔx`

### borrowing assets

Using cTokens as collateral, Compound users can seamlessly borrow from the protocol without having to negotiate terms or funding periods. The cost of borrowing for each market is determined by a floating interest rate set by market forces. Assets held by the protocol are used as collateral to borrow from the protocol. Each market has a collateral factor ranging from 0 to 1. Liquid, high-cap assets have a high collateral factor compared to illiquid, low-cap assets. This represents the perceived stability of an asset to borrow and lend against.

The sum of the value of an accounts underlying token balances, multiplied by the collateral factors, equals a users borrowing capacity. Users can borrow up to their borrowing capacity, but cannot take action (e.g transfer or redeem cToken collateral) to raise the total value of borrowed assets above the borrowing capacity.

If an accounts borrowing amount exceeds their borrowing capacity, a portion of their borrowing may be repaid in exchange for the accounts cToken collateral, at the current market price minus a liquidation discount. This creates arbitrage opportunity to reduce the borrowers exposure, eliminating the protocols risk.

The close factor is the potion of the borrowed asset that can be repaid. The close factor ranges from 0 to 1 and liquidation may continue to be called until the users borrowing is less than their borrowing capacity. Any holder of the underlying asset can call the liquidation function in exchange for the borrowers cToken collateral.
​

---

### interest rates

Each money market utilises an interest mode based on supply and demand. Interest rates increase as a function of demand and decrease when demand is low. The utilisation ratio U for each market a unifies supply and demand into a single variable.

`U_a = Borrows_a / (Cash_a + Borrows_a)`

As a result, borrowing interest rates resemble the following

`Borrowing Interest Rate_a = 2.5% + U_a * 20%`

### CToken contracts

Users balances are represented as cToken balances. Users can mint cTokens by supplying assets to the market, or redeem cTokens for the underlying asset. The exchange rate between cTokens and the underlying asset increases over time, as interest is accrued by borrowers, and is equal to:

`exchangeRate = underlyingBalance + totalBorrowBallance_a - reserves_a / cTokenSupply_a`

As the markets total borrowing balance increases due to borrower interest accruing, the exchange rate between cTokens and the underlying asset increases.

### Environment

```

This branch consists of tests, ERC20 and CompoundERC20 and CompoundLiquidate contracts.

`hh compile` compile ERC20, cToken contracts.

` npx hardhat node --fork https://eth-mainnet.alchemyapi.io/v2/$alchemyAIPkey`

`hh test`


```

### Tests

`01-DEX.test.js`

We call the approve function on the ERC20 token to allow the exchange to spend our tokens.

We can see that the DEX starts empty. Calling init() loads our contract up with 500 ETH and 500 Balloons. At this point, the ETH/BAL pool has a 1:1 ratio. Once liquidity has been deposited init() can only be called again if all liquidity has been removed.

Eth is exchange for tokens by calling ethToToken(). Despite the 1:1 balance of the pool, the returned number of tokens varies depending on the size of the swap

` 1 ETH - 0.996006981039903216`
` 10 ETH - 0.985199344233659966`
` 100 ETH - 0.887894610225887842`

This is smaller than expected. The constant product formula is in fact a hyperbola, thus the x any y axis cannot be crossed which makes reserves infinite. One implication of the formula is that the larger the swap, the fewer number of tokens returned - otherwise known as slippage.

Tokens are exchanged for Eth by calling tokenToEth(). The pool is reset to a 1:1 ratio by withdrawing liquidity and recalling init()

The amount of ETH returned varies on the size of the swap. The larger the swap the less ETH returned.

`1 BAL - 0.993039757447300166`
`10 BAL - 0.951296851599130328`
`100 BAL - 0.66197812517710483`

---
