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
let SUPPLY_DECIMALS = 18;
let BORROW_DECIMALS = 8;
const CTOKEN_DECIMALS = 8;
const SUPPLY_AMOUNT = String(pow(10, SUPPLY_DECIMALS).mul(new BN(1000)));
const eighteenZeros = BigNumber.from(10).pow(8);

const TOKEN_SUPPLY = DAI;
const CTOKEN_SUPPLY = CDAI;
const TOKEN_BORROW = WBTC;
const CTOKEN_BORROW = CWBTC;
const MANTISSA = 18 + parseInt(SUPPLY_DECIMALS) - CTOKEN_DECIMALS;
const SUPPLY_NAME = "DAI";
const BORROW_NAME = "WBTC";

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
  const borrowRatePerBlock = await cTokenBorrow.callStatic.borrowRatePerBlock();
  const blockNumber = await web3.eth.getBlockNumber();

  return {
    colFactor: colFactor / Math.pow(10, 18), // get factor of 1, e.g 0.75
    supplied: supplied / Math.pow(10, SUPPLY_DECIMALS),
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
    //  10 Eth is transferred to CompoundLoan
    expect(await getBalance(compoundLoan.address)).to.eq(toWei(10));
    // cETH and cDAI balances are 0
    expect(await cTokenSupply.balanceOf(compoundLoan.address)).to.eq(0);
    expect(await tokenSupply.balanceOf(compoundLoan.address)).to.eq(0);

    // Supply ETH to Compound, mint cETH
    // all Ctokens have 8 decimal places

    await tokenSupply.connect(WHALE_SIGNER).approve(compoundLoan.address, SUPPLY_AMOUNT);
    (tx = await compoundLoan.connect(WHALE_SIGNER).supply(SUPPLY_AMOUNT)), {gasLimit: 500000};
    let snap = await snapshot(compoundLoan);
    console.log(`underlying: ${snap.supplied} ${SUPPLY_NAME}`);
    console.log(`c${SUPPLY_NAME} ${snap.cTokenBalance} Balance `);
    console.log(`exchange Rate: c${SUPPLY_NAME} ${snap.exchangeRateCurrent} / ${SUPPLY_NAME} `);
    console.log(`colFactor ${snap.colFactor}%`);
    console.log(`liquidity $${snap.liquidity}`);

    console.log(``);

    // enter markets
    tx = await compoundLoan.connect(deployer).enterMarket();
    snap = await snapshot(compoundLoan);

    const {liquidity} = await compoundLoan.getAccountLiquidity();
    const price = await compoundLoan.getPriceFeed(CTOKEN_BORROW);
    const maxBorrow = liquidity.mul(String(pow(10, 18))).div(price);
    const borrowAmount = maxBorrow.mul(9995).div(10000);

    console.log("----- entered market -----");
    console.log(`liquidity: $${snap.liquidity}`);
    console.log(`underlying: ${snap.supplied} ${SUPPLY_NAME}`);
    console.log(`${BORROW_NAME} price: $${snap.price}`);
    console.log(`max borrow ${maxBorrow / Math.pow(10, BORROW_DECIMALS)} ${BORROW_NAME} `);
    console.log(`borrow amount: ${borrowAmount / Math.pow(10, BORROW_DECIMALS)} ${BORROW_NAME}  `);

    (tx = await compoundLoan.borrow(maxBorrow)), {gasLimit: 500000};

    snap = await snapshot(compoundLoan);

    console.log(`CTokenBal: ${snap.cTokenBalance * Math.pow(10, BORROW_DECIMALS)}`);
    console.log("----- borrowed -----");
    console.log(`liquidity $${snap.liquidity}`);
    console.log(`borrowed ${snap.borrowed} ${BORROW_NAME}`);
    console.log(`shortfall ${snap.shortfall}`);
    console.log("first");

    expect(await tokenSupply.balanceOf(compoundLoan.address)).to.eq(0);
    expect(await cTokenSupply.balanceOf(compoundLoan.address)).to.eq(
      snap.cTokenBalance * Math.pow(10, BORROW_DECIMALS)
    );

    console.log(``);
    expect(await tokenBorrow.balanceOf(compoundLoan.address)).to.eq(snap.borrowed * Math.pow(10, BORROW_DECIMALS));
    expect(await cTokenBorrow.balanceOf(compoundLoan.address)).to.eq(0);
  });
});
