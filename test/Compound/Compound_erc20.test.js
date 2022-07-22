const {time, balance} = require("@openzeppelin/test-helpers");
const assert = require("assert");
const BN = require("bn.js");
const {sendEther, pow, fromWei, toWei, getBalance, fromWei8, toWei8} = require("../util");
const {
  DAI,
  CDAI,
  CETH,
  WETH_WHALE,
  WETH,
  DAI_WHALE,
  WBTC_WHALE,
  WBTC,
  CWBTC,
  USDC,
  CUSDC,
  USDC_WHALE,
} = require("../config");
const {web3} = require("@openzeppelin/test-helpers/src/setup");
const {solidity} = require("ethereum-waffle");

const IERC20 = "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20";
const CIERC20 = "../artifacts/contracts/interfaces/ICErc20.sol:ICErc20";

const {expect} = require("chai");
const {ethers, artifacts} = require("hardhat");
const {createWriteStream} = require("fs");
const {BigNumber} = require("ethers");

const WHALE = DAI_WHALE;
let underlyingDecimals = 18;
let BORROW_DECIMALS = 8;
const CTOKEN_DECIMALS = 8;
const SUPPLY_AMOUNT = String(pow(10, underlyingDecimals).mul(new BN(1000)));
const eighteenZeros = BigNumber.from(10).pow(8);

const TOKEN_SUPPLY = DAI;
const CTOKEN_SUPPLY = CDAI;
const TOKEN_BORROW = WBTC;
const CTOKEN_BORROW = CWBTC;
const MANTISSA = 18 + parseInt(underlyingDecimals) - CTOKEN_DECIMALS;
const assetName = "DAI";
const BORROW_NAME = "WBTC";

let cTokenSupply, tokenSupply, tokenBorrow, cTokenBorrow;
let compoundLoan;
let deployer;
let WHALE_SIGNER;

beforeEach(async () => {
  const accounts = await ethers.getSigners();
  signer = accounts[0];
  user1 = accounts[1];
  WHALE_SIGNER = ethers.provider.getSigner(WHALE);
  // user1_SIGNER = ethers.provider.getSigner(user1.address);

  const CompoundLoan = await ethers.getContractFactory("CompoundLoan");
  compoundLoan = await CompoundLoan.deploy(TOKEN_SUPPLY, CTOKEN_SUPPLY, TOKEN_BORROW, CTOKEN_BORROW);

  tokenSupply = await ethers.getContractAt(IERC20, TOKEN_SUPPLY);
  cTokenSupply = await ethers.getContractAt(CIERC20, CTOKEN_SUPPLY);
  tokenBorrow = await ethers.getContractAt(IERC20, TOKEN_BORROW);
  cTokenBorrow = await ethers.getContractAt(CIERC20, CTOKEN_BORROW);

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [WHALE],
  });
  await signer.sendTransaction({
    to: user1.address,
    value: toWei(10),
  });
});
const snapshot = async CompoundLoan => {
  const colFactor = await CompoundLoan.getCollateralFactor();
  const supplied = await CompoundLoan.callStatic.getSupplyBalance();
  const borrowed = await CompoundLoan.callStatic.getBorrowBalance();
  const price = await CompoundLoan.getPriceFeed(CTOKEN_BORROW);
  const cTokenBalance = await CompoundLoan.getBalance();
  const {liquidity, shortfall} = await CompoundLoan.getAccountLiquidity();
  const exchangeRateCurrent = await cTokenSupply.callStatic.exchangeRateCurrent();
  const borrowRatePerBlock = await cTokenBorrow.callStatic.borrowRatePerBlock();
  const blockNumber = await web3.eth.getBlockNumber();

  return {
    colFactor: colFactor / Math.pow(10, 18), // get factor of 1, e.g 0.75
    supplied: supplied / Math.pow(10, underlyingDecimals),
    borrowed: borrowed / Math.pow(10, BORROW_DECIMALS),
    price: price / Math.pow(10, MANTISSA),
    cTokenBalance: cTokenBalance / Math.pow(10, CTOKEN_DECIMALS),
    exchangeRateCurrent: exchangeRateCurrent / Math.pow(10, MANTISSA),
    liquidity: liquidity / Math.pow(10, 18),
    shortfall: shortfall / Math.pow(10, 18),
    borrowRatePerBlock: (borrowRatePerBlock / Math.pow(10, 18)).toFixed(20),
    blockNumber: blockNumber,
  };
};

describe("Compound", function () {
  it("Borrow from Compound", async function () {
    const tokenBalance = (await tokenSupply.callStatic.balanceOf(DAI_WHALE)) / 1e18;
    console.log(`Whale ${assetName} Token Balance:`, tokenBalance);

    // 10 tokens
    const underlyingTokensToSupply = 5 * Math.pow(10, underlyingDecimals);
    // transfer tokens to user
    await tokenSupply.connect(WHALE_SIGNER).transfer(user1.address, underlyingTokensToSupply.toString());

    underlyingBalance = await tokenSupply.callStatic.balanceOf(user1.address);
    underlyingBalance = +underlyingBalance / Math.pow(10, underlyingDecimals);
    console.log(`My wallet's ${assetName} Token Balance:`, underlyingBalance, "\n");

    // Tell the contract to allow 10 tokens to be taken by the cToken contract
    tx = await tokenSupply.connect(user1).approve(cTokenSupply.address, underlyingTokensToSupply.toString());
    await tx.wait(1); // wait until the transaction has 1 confirmation on the blockchain

    console.log(`${assetName} contract "Approve" operation successful.`);
    console.log(`Supplying ${assetName} to the Compound Protocol...`, "\n");

    // Mint cTokens by supplying underlying tokens to the Compound Protocol
    tx = await cTokenSupply.connect(user1).mint(underlyingTokensToSupply.toString());
    await tx.wait(1); // wait until the transaction has 1 confirmation on the blockchain

    console.log(`c${assetName} "Mint" operation successful.`, "\n");

    const bal = await cTokenSupply.callStatic.balanceOfUnderlying(user1.address);
    const balanceOfUnderlying = +bal / Math.pow(10, underlyingDecimals);

    console.log(`${assetName} supplied to the Compound Protocol:`, balanceOfUnderlying, "\n");

    let cTokenBalance = +(await cTokenSupply.callStatic.balanceOf(user1.address)) / 1e8;
    console.log(`My wallet's c${assetName} Token Balance:`, cTokenBalance);

    underlyingBalance = await tokenSupply.callStatic.balanceOf(user1.address);
    underlyingBalance = +underlyingBalance / Math.pow(10, underlyingDecimals);
    console.log(`My wallet's ${assetName} Token Balance:`, underlyingBalance, "\n");

    let erCurrent = await cTokenSupply.callStatic.exchangeRateCurrent();
    let exchangeRate = +erCurrent / Math.pow(10, 18 + underlyingDecimals - 8);
    console.log(`Current exchange rate from c${assetName} to ${assetName}:`, exchangeRate, "\n");

    console.log(`Redeeming the c${assetName} for ${assetName}...`);

    // redeem (based on cTokens)
    console.log(`Exchanging all c${assetName} based on cToken amount...`, "\n");
    tx = await cTokenSupply.connect(user1).redeem(cTokenBalance * 1e8);
    await tx.wait(1); // wait until the transaction has 1 confirmation on the blockchain

    //redeem (based on underlying)
    // console.log(`Exchanging all c${assetName} based on underlying ${assetName} amount...`);
    // let underlyingAmount = balanceOfUnderlying * Math.pow(10, underlyingDecimals);
    // console.log(underlyingAmount);
    // (tx = await cTokenSupply.redeemUnderlying(underlyingAmount.toString())), {gasLimit: 500000000};
    // await tx.wait(1); // wait until the transaction has 1 confirmation on the blockchain

    cTokenBalance = await cTokenSupply.callStatic.balanceOf(user1.address);
    cTokenBalance = +cTokenBalance / 1e8;
    console.log(`My wallet's c${assetName} Token Balance:`, cTokenBalance);

    underlyingBalance = await tokenSupply.callStatic.balanceOf(user1.address);
    underlyingBalance = +underlyingBalance / Math.pow(10, underlyingDecimals);
    console.log(`My wallet's ${assetName} Token Balance:`, underlyingBalance, "\n");
  });
});
