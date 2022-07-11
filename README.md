### Compound Finance

Compound finance is a decentralised borrowing and lending protocol facilitating peer to peer collateralized and uncollateralized loans. Built on Ethereum, Compound establishes pools of assets using algorithmically derived interest rates, based on the supply and demand of the asset.

### supplying assets

By aggregating the supply of each user Compound offers significantly more liquidity than direct lending. Assets supplied to a market a represented by an ERC-20 token balance ('cToken). As the money market accrues interest, though borrowing demand, cTokens become convertible into an increasing amount of the underlying asset.

Individuals the hold Ether, or any token, can supply their tokens to the Compound protocol and earn interest without having to manage their asset of take speculative risks.

### borrowing assets

Using cTokens as collateral, Compound users can seamlessly borrow from the protocol without having to negotiate terms or funding periods. The cost of borrowing for each market is determined by a floating interest rate set by market forces. Assets held by the protocol are used as collateral to borrow from the protocol. Each market has a collateral factor ranging from 0 to 1. Liquid, high-cap assets have a high collateral factor compared to illiquid, low-cap assets. This represents the perceived stability of an asset to borrow and lend against.

The sum of the value of an accounts underlying token balances, multiplied by the collateral factors, equals a user's borrowing capacity. Users can borrow up to their borrowing capacity but cannot take action (e.g transfer or redeem cToken collateral) to raise the total value of borrowed assets above the borrowing capacity.

If an accounts borrowing amount exceeds their borrowing capacity, a portion of their borrowing may be repaid in exchange for the accounts cToken collateral, at the current market price minus a liquidation discount. This creates arbitrage opportunity to reduce the borrower's exposure, eliminating the protocols risk.

The close factor is the potion of the borrowed asset that can be repaid. The close factor ranges from 0 to 1 and liquidation may continue to be called until the users borrowing is less than their borrowing capacity. Any holder of the underlying asset can call the liquidation function in exchange for the borrowers cToken collateral.
​

---

### interest rates

Each money market utilises an interest mode based on supply and demand. Interest rates increase as a function of demand and decrease when demand is low. The utilisation ratio U for each market a unifies supply and demand into a single variable.

`U_a = Borrows_a / (Cash_a + Borrows_a)`

As a result, borrowing interest rates resemble the following

`Borrowing Interest Rate_a = 2.5% + U_a * 20%`

### CToken contracts

Users balances are represented as cToken balances. Users can mint cTokens by supplying assets to the market or redeem cTokens for the underlying asset. The exchange rate between cTokens and the underlying asset increases over time, as interest is accrued by borrowers, and is equal to:

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

`CompoundERC20.test.js`

This test demonstrates how to earn interest from lending tokens to the Compound protocol. The CERC20 and IERC20 interfaces are used to interact with the C_Token and ERC20 contracts. The CToken and underlying ERC20 token addresses are passed into the constructor, followed by calling supply to lend tokens to the protocol.

Calling the supply function transfers the amount of the underlying token specified. In return we receive an amount of C-Tokens representing how many C-Tokens can be withdrawn from the protocol. The exchange rate of undeerlying tokens to C-Tokens is calculated by:

```
exchangeRate = balanceOfUnderlying + totalBorrowBalance - reserves / cTokenSupply
exchangeRate = 100 + 0 - 0 / 4983 = 0.020068231988762
```

The Tokens supplied accrue interest per block. The test simulates advancing 100 blocks to return the updated amount of the underlying asset.

BalanceOfUnderlying returns the users underlying token amount, including any interest accrued over time. To withdraw the underlying asset redeem is called, passing in the requested amount of C_Tokens to redeem. The C-Tokens are burned by calling redeem in return of the underlying asset plus accrues feed.

`CompoundLiquidate.test.js`

On Compound, if the borrowed amount exceeds the supplied collateral you're subject to liquidation. This allows another account to pay back a portion of the borrowed token and receive an amount of the supplied token at a discount.

Close factor - The maximum percentage of the borrowed token that can be repaid.

Liquidation incentive - When liquidate is called, a portion of the borrowed token is repaid in exchange for a portion of the token supplied as collateral. This is supplied at a discounted rate - liquidation incentive.

In this example the TestCompoundLiquidate contract supplies WBTC as collateral in exchange for DAI. The CompoundLiquidator contract attempts to liquidate TestCompoundLiquidate once it's collateral is exceeded by it's borrowed amount.

TestCompoundLiquidate supplies 1 WBTC into Compound, enters the market and borrows the maximum amount possible. The maximum amount is calculated as follows

`liquidity * token price * col Factor`

`1 WBTC * $1 * 70% = Max borrow amount`

`£$21,104 * $1 * 70% = $14,390`

When the borrowed amount is greater than supplied amount \* col factor TestCompoundLiquidate can be liquidated.

Supplying 1 WBTC results in a maximum of $14,390 to borrow against. We borrow slightly less than the maximum reducing the liquidity to $25. After simulating 900 blocks interest has accrued and reduced the liquidity 0.

A shortfall now exists - the contract that borrowed is now under collagenised by $9.6266

Liquidate can now be called at a close factor of 50% with a liquidation incentive of %1.08.

TestCompoundLiquidate is liquidated, it's borrowed amount is reduced by 50% to $7195.12, leaving a supply balance of 0.62 WBTC

The liquidating address supplies $7195.12 DAI to receive 0.3676 WBTC at a discounted rate of %1.08

The account supplying 1 WBTC initially received 50 C_WBTC. When liquidated, 18 C_WBTC tokens were transferred to the liquidating address.
