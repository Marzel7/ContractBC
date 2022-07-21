const {time, balance} = require("@openzeppelin/test-helpers");
const assert = require("assert");
const BN = require("bn.js");
const {sendEther, pow, fromWei, toWei, getBalance, fromWei8, toWei8} = require("./util");
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
} = require("./config");
const {web3} = require("@openzeppelin/test-helpers/src/setup");
const {solidity} = require("ethereum-waffle");

const IERC20 = "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20";
const CIERC20 = "../artifacts/contracts/interfaces/ICErc20.sol:ICErc20";

const {expect} = require("chai");
const {ethers, artifacts} = require("hardhat");
const {createWriteStream} = require("fs");
const {BigNumber} = require("ethers");

const WHALE = WBTC_WHALE;
let SUPPLY_DECIMALS = 8;
let BORROW_DECIMALS = 18;
const CTOKEN_DECIMALS = 8;
const SUPPLY_AMOUNT = String(pow(10, SUPPLY_DECIMALS).mul(new BN(10)));
const eighteenZeros = BigNumber.from(10).pow(8);

const TOKEN_SUPPLY = WBTC;
const CTOKEN_SUPPLY = CWBTC;
const TOKEN_BORROW = DAI;
const CTOKEN_BORROW = CDAI;
const MANTISSA = 18 + parseInt(SUPPLY_DECIMALS) - CTOKEN_DECIMALS;
const SUPPLY_NAME = "WBTC";
const BORROW_NAME = "DAI";

let cTokenSupply, tokenSupply, tokenBorrow, cTokenBorrow;
let compoundLoan;
let deployer;
let WHALE_SIGNER;

beforeEach(async () => {
  const accounts = await ethers.getSigners();
  deployer = accounts[0];
  user2 = accounts[0];
  WHALE_SIGNER = ethers.provider.getSigner(WHALE);

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
  await deployer.sendTransaction({
    to: compoundLoan.address,
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

  return {
    colFactor: colFactor / Math.pow(10, 18), // get factor of 1, e.g 0.75
    supplied: supplied / Math.pow(10, SUPPLY_DECIMALS),
    borrowed: borrowed / Math.pow(10, BORROW_DECIMALS),
    price: price / Math.pow(10, MANTISSA),
    cTokenBalance: cTokenBalance / Math.pow(10, CTOKEN_DECIMALS),
    exchangeRateCurrent: exchangeRateCurrent / Math.pow(10, MANTISSA),
    liquidity: liquidity / Math.pow(10, 18),
    shortfall: shortfall / Math.pow(10, 18),
  };
};
// shortfall: shortfall.div(String(pow(10, 14))) / 10000, // to 4 decimal places

describe("Compound", function () {
  it("Borrow from Compound", async function () {
    //  10 Eth is transferred to CompoundLoan
    expect(await getBalance(compoundLoan.address)).to.eq(toWei(10));
    // cETH and cDAI balances are 0
    expect(await cTokenSupply.balanceOf(compoundLoan.address)).to.eq(0);
    expect(await tokenSupply.balanceOf(compoundLoan.address)).to.eq(0);

    // Supply ETH to Compound, mint cETH
    // all Ctokens have 8 decimal places

    const exchangeRateCurrent = await cTokenSupply.callStatic.exchangeRateCurrent();

    const mantissa = 18 + parseInt(SUPPLY_DECIMALS) - CTOKEN_DECIMALS;
    const oneCTokenUnderlying = exchangeRateCurrent / Math.pow(10, mantissa);
    console.log(`1 c${SUPPLY_NAME} = ${oneCTokenUnderlying} ${SUPPLY_NAME}`);

    await tokenSupply.connect(WHALE_SIGNER).approve(compoundLoan.address, SUPPLY_AMOUNT);
    (tx = await compoundLoan.connect(WHALE_SIGNER).supply(SUPPLY_AMOUNT)), {gasLimit: 500000};
    let snap = await snapshot(compoundLoan);

    console.log(`supplied: ${snap.supplied} ${SUPPLY_NAME}`);
    console.log(`c${SUPPLY_NAME} ${snap.cTokenBalance} Balance `);
    console.log(`${SUPPLY_NAME} exchange Rate: ${snap.exchangeRateCurrent}`);
    console.log(`colFactor ${snap.colFactor}%`);
    console.log(`liquidity $${snap.liquidity}`);

    console.log(``);

    // enter markets
    tx = await compoundLoan.connect(deployer).enterMarket();
    snap = await snapshot(compoundLoan);
    // borrow
    // const _maxBorrow = snap.liquidity / snap.price;
    // const _borrowAmount = (_maxBorrow * 9990) / 10000;
    // const _borrowAmountDollars = _borrowAmount * snap.price;

    const {liquidity} = await compoundLoan.getAccountLiquidity();
    const price = await compoundLoan.getPriceFeed(CTOKEN_BORROW);
    const maxBorrow = liquidity.mul(String(pow(10, 18))).div(price);
    const borrowAmount = maxBorrow.mul(9095).div(10000);

    console.log("----- entered market -----");
    console.log(`liquidity: $${snap.liquidity}`);
    console.log(`supplied: ${snap.supplied} ${SUPPLY_NAME}`);
    console.log(`${BORROW_NAME} price: $${snap.price}`);
    console.log(`max borrow ${maxBorrow / pow(10, BORROW_DECIMALS)} ${BORROW_NAME} `);
    console.log(`borrow amount: ${borrowAmount / pow(10, BORROW_DECIMALS)} ${BORROW_NAME}  `);
    //console.log(`borrow amount: $${_borrowAmountDollars}`);

    let block = await web3.eth.getBlockNumber();
    (tx = await compoundLoan.connect(WHALE_SIGNER).borrow(borrowAmount)), {gasLimit: 500000};
    snap = await snapshot(compoundLoan);
    let currentblock = await web3.eth.getBlockNumber();
    console.log(``);
    console.log("----- borrowed -----");
    console.log(`supplied: ${snap.supplied} ${SUPPLY_NAME}`);
    console.log(`borrowed ${snap.borrowed} ${BORROW_NAME}`);
    console.log(`liquidity $${snap.liquidity}`);
    console.log(`shortfall ${snap.shortfall}`);

    console.log(``);

    let numberOfBlocks = currentblock - block;
    const borrowRatePerBlock = await cTokenBorrow.callStatic.borrowRatePerBlock();
    //console.log(borrowRatePerBlock);

    // const interest = borrowRatePerBlock.div(String(pow(10, BORROW_DECIMALS))).mul(snap.price * numberOfBlocks) / 10000;
    // console.log(interest);

    let borrowBalance = await cTokenBorrow.callStatic.borrowBalanceCurrent(compoundLoan.address);
    console.log(`borrowed:`, borrowBalance.div(String(pow(10, BORROW_DECIMALS - 4))) / 10000);

    const liquidityBal = await compoundLoan.getAccountLiquidity();
    console.log(`liquidity`, liquidityBal[0].div(String(pow(10, 18 - 4))) / 10000);

    // const assetsIn = await compoundLoan.callStatic.getAssetsIn(compoundLoan.address);
    // console.log(assetsIn);

    // const supplyRate = await cTokenBorrow.callStatic.supplyRatePerBlock();

    const exchangeRateCurrent_ = await cTokenSupply.callStatic.exchangeRateCurrent();
    console.log(exchangeRateCurrent_);

    const mantissa_ = 18 + parseInt(SUPPLY_DECIMALS) - CTOKEN_DECIMALS;
    const oneCTokenUnderlying_ = exchangeRateCurrent / Math.pow(10, mantissa);
    console.log(`1 c${SUPPLY_NAME} = ${oneCTokenUnderlying} ${SUPPLY_NAME}`);

    const tokenSupplyBalance = await compoundLoan.getBalance();
    console.log("tokenSupplyBalance", tokenSupplyBalance);

    let underlyingBalance = await cTokenSupply.callStatic.balanceOfUnderlying(compoundLoan.address);
    console.log(
      `underlying ${SUPPLY_NAME} balance`,
      underlyingBalance.div(String(pow(10, SUPPLY_DECIMALS - 4))) / 10000
    );
  });
});
