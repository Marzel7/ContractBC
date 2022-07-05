const {time, balance} = require("@openzeppelin/test-helpers");
const assert = require("assert");
const BN = require("bn.js");
const {sendEther, cast, pow, fromWei, toWei, getBalance, fromWei8, toWei8} = require("./util");
const {DAI, DAI_WHALE, CDAI, WBTC, WBTC_WHALE, CWBTC} = require("./config");
const {web3} = require("@openzeppelin/test-helpers/src/setup");

const {solidity} = require("ethereum-waffle");
const CERC20 = "../artifacts/contracts/interfaces/ICErc20.sol:ICErc20";
const IERC20 = "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20";

const {expect} = require("chai");
const {ethers, artifacts} = require("hardhat");

const SUPPLY_WHALE = WBTC_WHALE;
const TOKEN_SUPPLY = WBTC;
const C_TOKEN_SUPPLY = CWBTC;
const TOKEN_BORROW = DAI;
const C_TOKEN_BORROW = CDAI;
const LIQUIDATOR = DAI_WHALE;

const SUPPLY_DECIMALS = 8;
const SUPPLY_AMOUNT = String(pow(10, SUPPLY_DECIMALS).mul(new BN(10)));
const BORROW_DECIMALS = 18;

let testCompound;
let tokenSupply;
let cTokenSupply;
let tokenBorrow;
let cTokenBorrow;
let liquidator;
let signer;
let deployer;
let user1;

beforeEach(async () => {
  const accounts = await ethers.getSigners();
  deployer = accounts[0];
  user1 = accounts[1];
  signer = ethers.provider.getSigner(SUPPLY_WHALE);
  signer_LIQUIDATOR = ethers.provider.getSigner(LIQUIDATOR);

  await deployer.sendTransaction({
    to: SUPPLY_WHALE,
    value: toWei(10),
  });

  await deployer.sendTransaction({
    to: LIQUIDATOR,
    value: toWei(10),
  });

  const TestCompoundLiquidate = await ethers.getContractFactory("TestCompoundLiquidate");
  testCompound = await TestCompoundLiquidate.deploy(TOKEN_SUPPLY, C_TOKEN_SUPPLY, TOKEN_BORROW, C_TOKEN_BORROW);

  const CompoundLiquidator = await ethers.getContractFactory("CompoundLiquidator");
  liquidator = await CompoundLiquidator.deploy(TOKEN_BORROW, C_TOKEN_BORROW);

  tokenSupply = await ethers.getContractAt(IERC20, TOKEN_SUPPLY, signer);
  cTokenSupply = await ethers.getContractAt(CERC20, C_TOKEN_SUPPLY, signer);
  tokenBorrow = await ethers.getContractAt(IERC20, TOKEN_BORROW, signer);

  const supplyBal = await tokenSupply.balanceOf(SUPPLY_WHALE);
  console.log(`supply whale balance: ${supplyBal.div(String(pow(10, SUPPLY_DECIMALS)))}`);
  assert(supplyBal.gte(SUPPLY_AMOUNT), "bal < supply");

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [SUPPLY_WHALE],
  });
});

const snapshot = async (testCompound, liquidator) => {
  const supplied = await testCompound.callStatic.getSupplyBalance();
  const borrowed = await testCompound.callStatic.getBorrowBalance();
  const colFactor = await testCompound.getCollateralFactor();
  const {liquidity, shortfall} = await testCompound.getAccountLiquidity();
  const price = await testCompound.getPriceFeed(C_TOKEN_BORROW);
  const closeFactor = await liquidator.getCloseFactor();
  const incentive = await liquidator.getLiquidationIncentive();
  const liquidated = await liquidator.callStatic.getSupplyBalance(C_TOKEN_SUPPLY);

  return {
    colFactor: colFactor.div(String(pow(10, 18 - 2))),
    supplied: supplied.div(String(pow(10, SUPPLY_DECIMALS - 2))) / 100,
    borrowed: borrowed.div(String(pow(10, BORROW_DECIMALS - 2))) / 100,
    price: price.div(String(pow(10, 18 - 2))) / 100,
    liquidity: liquidity.div(String(pow(10, 14))) / 10000,
    shortfall: shortfall.div(String(pow(10, 14))) / 10000,
    closeFactor: closeFactor.div(String(pow(10, 18 - 2))),
    incentive: incentive.div(String(pow(10, 18 - 2))) / 100,
    liquidated: liquidated.div(String(pow(10, SUPPLY_DECIMALS - 4))) / 10000,
  };
};

describe("liquidation", async () => {
  it("should liquidate", async () => {
    let tx;
    let snap;
    snap = await snapshot(testCompound, liquidator);
    console.log(`liquidity: ${snap.liquidity}`);
    console.log(`supplied: ${snap.supplied}`);
    // supply
    await tokenSupply.connect(signer).approve(testCompound.address, SUPPLY_AMOUNT);
    (tx = await testCompound.connect(signer).supply(SUPPLY_AMOUNT)), {gasLimit: 500000};
    snap = await snapshot(testCompound, liquidator);
    console.log(`--- supplied ---`);
    console.log(`col factor: ${snap.colFactor} %`);
    console.log(`supplied: ${snap.supplied}`);

    // enter market
    tx = await testCompound.connect(user1).enterMarket();
    // borrow
    const {liquidity} = await testCompound.getAccountLiquidity();
    const price = await testCompound.getPriceFeed(C_TOKEN_BORROW);
    const maxBorrow = liquidity.mul(String(pow(10, BORROW_DECIMALS))).div(price);
    // tweak borrow amount if borrow fails
    const borrowAmount = maxBorrow.mul(9998).div(10000);

    console.log("----- entered market -----");
    console.log(`liquidity: ${liquidity.div(String(pow(10, 18)))}`);
    console.log(`price: ${price.div(String(pow(10, 18)))}`);
    console.log(`max borrow ${maxBorrow.div(String(pow(10, 18)))}`);
    console.log(`borrow amount: ${borrowAmount.div(String(pow(10, 18)))}`);

    (tx = await testCompound.borrow(borrowAmount)), {gasLimit: 500000};

    snap = await snapshot(testCompound, liquidator);
    console.log(`---- borrowed ----`);
    console.log(`liquidity: ${snap.liquidity}`);
    console.log(`borrowed: ${snap.borrowed}`);

    // accrue interest on borrow
    const block = await web3.eth.getBlockNumber();
    // NOTE: tweak this to increase borrowed amount
    await time.advanceBlockTo(block + 90000);
    // send any tx to Compound to update liquidity and shortfall
    await testCompound.getBorrowBalance();

    snap = await snapshot(testCompound, liquidator);
    console.log(`--- after some blocks ---`);
    console.log(`liquidity: $ ${snap.liquidity}`);
    console.log(`shortfall: $ ${snap.shortfall}`);
    console.log(`borrowed: ${snap.borrowed}`);

    // liquidate
    const closeFactor = await liquidator.getCloseFactor();
    const repaymentAmount = await testCompound.callStatic.getBorrowBalance();
    repayAmount = repaymentAmount.mul(closeFactor).div(String(pow(10, 18)));

    const liqBal = await tokenBorrow.balanceOf(LIQUIDATOR);
    console.log("---- liquidation ----");
    console.log(`liquidator balance: ${liqBal.div(String(pow(10, BORROW_DECIMALS)))}`);
    assert(liqBal.gte(repayAmount, "bal < repay"));

    const amountToBeLiquidated = await liquidator.getAmountToBeLiquidated(C_TOKEN_BORROW, C_TOKEN_SUPPLY, repayAmount);
    console.log(
      `amount to be liquidated (cToken collateral):  ${
        amountToBeLiquidated.div(String(pow(10, SUPPLY_DECIMALS - 2))) / 100
      }`
    );
    await tokenBorrow.connect(signer_LIQUIDATOR).approve(liquidator.address, repayAmount);
    tx = await liquidator.connect(signer_LIQUIDATOR).liquidate(testCompound.address, repayAmount, C_TOKEN_SUPPLY);

    snap = await snapshot(testCompound, liquidator);
    console.log(`--- liquidated ---`);
    console.log(`close factor: ${snap.closeFactor} %`);
    console.log(`liquidation incentive: ${snap.incentive}`);
    console.log(`supplied: ${snap.supplied}`);
    console.log(`liquidity: $ ${snap.liquidity}`);
    console.log(`shortfall: $ ${snap.shortfall}`);
    console.log(`borrowed: ${snap.borrowed}`);
    console.log(`liquidated: ${snap.liquidated}`);
  });
});
