const {time, balance} = require("@openzeppelin/test-helpers");
const assert = require("assert");
const BN = require("bn.js");
const {sendEther, pow, fromWei, toWei, getBalance, fromWei8, toWei8} = require("./util");
const {DAI, CDAI, CETH, WETH_WHALE, WETH, DAI_WHALE, WBTC_WHALE, WBTC, CWBTC} = require("./config");
const {web3} = require("@openzeppelin/test-helpers/src/setup");
const {solidity} = require("ethereum-waffle");

const IERC20 = "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20";
const CIERC20 = "../artifacts/contracts/interfaces/ICErc20.sol:ICErc20";

const {expect} = require("chai");
const {ethers, artifacts} = require("hardhat");
const {createWriteStream} = require("fs");

const WHALE = DAI_WHALE;
let SUPPLY_DECIMALS = 18;
let BORROW_DECIMALS = 8;
const CTOKEN_DECIMALS = 8;
const SUPPLY_AMOUNT = String(pow(10, SUPPLY_DECIMALS).mul(new BN(1000)));

const TOKEN_SUPPLY = DAI;
const CTOKEN_SUPPLY = CDAI;
const TOKEN_BORROW = WBTC;
const CTOKEN_BORROW = CWBTC;
const MANTISSA = 18 + parseInt(SUPPLY_DECIMALS) - CTOKEN_DECIMALS;
const SUPPLY_NAME = "DAI";
const BORROW_NAME = "WBTC";

let cTokenSupply, tokenSupply;
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
  const {liquidity, shortfall} = await CompoundLoan.getAccountLiquidity();

  return {
    colFactor: colFactor.div(String(pow(10, 18 - 2))), // get factor of 1, e.g 0.75
    supplied: supplied.div(String(pow(10, SUPPLY_DECIMALS - 2))) / 100,
    borrowed: borrowed.div(String(pow(10, BORROW_DECIMALS - 2))) / 100,
    price: price.div(String(pow(10, MANTISSA - 4))) / 10000,
    liquidity: liquidity.div(String(pow(10, 14))) / 10000, // to 4 decimal places
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

    const exchangeRateCurrent = await cTokenSupply.callStatic.exchangeRateCurrent();

    const mantissa = 18 + parseInt(SUPPLY_DECIMALS) - CTOKEN_DECIMALS;
    const oneCTokenUnderlying = exchangeRateCurrent / Math.pow(10, mantissa);
    console.log(`1 c${SUPPLY_NAME} = ${oneCTokenUnderlying} ${SUPPLY_NAME}`);

    await tokenSupply.connect(WHALE_SIGNER).approve(compoundLoan.address, SUPPLY_AMOUNT);
    (tx = await compoundLoan.connect(WHALE_SIGNER).supply(SUPPLY_AMOUNT)), {gasLimit: 500000};
    let snap = await snapshot(compoundLoan);

    console.log(`supplied: ${snap.supplied} ${SUPPLY_NAME}`);
    console.log(`colFactor ${snap.colFactor}%`);
    console.log(`liquidity $${snap.liquidity}`);
    console.log(``);

    // enter markets
    tx = await compoundLoan.connect(deployer).enterMarket();
    snap = await snapshot(compoundLoan);
    // borrow
    // const {liquidity} = await compoundLoan.getAccountLiquidity();
    // let price = await compoundLoan.getPriceFeed(CTOKEN_BORROW);
    const maxBorrow = snap.liquidity / snap.price;
    const borrowAmount = (maxBorrow * 9990) / 10000;

    // const maxBorrow = liquidity.mul(String(pow(10, 14))).div(price);
    //const borrowAmount = maxBorrow.mul(9990).div(10000);

    console.log("----- entered market -----");
    console.log(`liquidity: $${snap.liquidity}`);
    console.log(`${BORROW_NAME} price: $${snap.price}`);
    console.log(`max borrow ${maxBorrow} ${BORROW_NAME}`);
    console.log(`borrow amount: ${borrowAmount} ${BORROW_NAME}`);
  });
});
