const {time, balance} = require("@openzeppelin/test-helpers");
const assert = require("assert");
const BN = require("bn.js");
const {sendEther, pow, fromWei, toWei, getBalance, fromWei8, toWei8} = require("./util");
const {DAI, DAI_WHALE, CDAI, WBTC_WHALE, CWBTC, WBTC} = require("./config");
const {web3} = require("@openzeppelin/test-helpers/src/setup");

const {solidity} = require("ethereum-waffle");

const IERC20_SOURCE = "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20";
const CIERC20_SOURCE = "../artifacts/contracts/interfaces/ICErc20.sol:ICErc20";

const {expect} = require("chai");
const {ethers, artifacts} = require("hardhat");

const WHALE = WBTC_WHALE;
const TOKEN = WBTC;
const C_TOKEN = CWBTC;
const DEPOSIT_AMOUNT = toWei(10);
const SUPPLY_DECIMALS = 8;

let compoundERC20;
let wbtc;
let c_wbtc;
let deployer, signer;

beforeEach(async () => {
  const accounts = await ethers.getSigners();
  deployer = accounts[0];

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [WHALE],
  });

  const CompoundERC20 = await ethers.getContractFactory("CompoundERC20");
  compoundERC20 = await CompoundERC20.deploy(WBTC, CWBTC);
  await compoundERC20.deployed();

  signer = await ethers.provider.getSigner(WHALE);
  signer.address = signer._address;
  wbtc = await ethers.getContractAt(IERC20_SOURCE, TOKEN, signer);
  wbtc = wbtc.connect(signer);

  c_wbtc = await hre.ethers.getContractAt(CIERC20_SOURCE, C_TOKEN, signer);
  c_wbtc = c_wbtc.connect(signer);

  // Send Ether

  let tx = await deployer.sendTransaction({
    to: WHALE,
    value: toWei(100),
  });

  await deployer.sendTransaction({
    to: compoundERC20.address,
    value: toWei(100),
    gasLimit: 50000,
  });
});

const snapshot = async (compoundERC20, wbtc, c_wbtc) => {
  let {exchangeRate, supplyRate} = await compoundERC20.callStatic.getInfo();
  exchangeRate = fromWei(exchangeRate);
  supplyRate = fromWei(supplyRate);

  return {
    exchangeRate,
    supplyRate,
    estimateBalance: fromWei8(8, await compoundERC20.callStatic.estimateBalanceOfUnderlying()),
    balanceOfUnderlying: fromWei8(8, await compoundERC20.callStatic.balanceOfUnderlying()),
    wbtc: fromWei8(8, await wbtc.balanceOf(compoundERC20.address)),
    c_wbtc: fromWei8(8, await c_wbtc.balanceOf(compoundERC20.address)),
  };
};

describe("CompoundERC20 deployment", function () {
  it("confirm balances", async function () {
    let before = await snapshot(compoundERC20, wbtc, c_wbtc);
    console.log(`before supply`);
    console.log("------------");
    console.log(`estimateBalanceOfUnderlying: ${before.estimateBalance}`);
    console.log(`balanceOfUnderlying: ${before.balanceOfUnderlying}`);
    console.log(`token balance: ${before.wbtc}`);
    console.log(`c_token balance: ${before.c_wbtc}`);
  });

  it("should supply and redeem", async () => {
    await wbtc.connect(signer).approve(compoundERC20.address, DEPOSIT_AMOUNT);
    await compoundERC20.connect(signer).supply(toWei8(8, 100), {gasLimit: 500000});
    let after = await snapshot(compoundERC20, wbtc, c_wbtc);

    console.log(`after supply`);
    console.log("------------");
    console.log(`exchangeRate: ${after.exchangeRate}`);
    // console.log(`supplyRate: ${after.supplyRate}`);
    console.log(`estimateBalanceOfUnderlying: ${after.estimateBalance}`);
    console.log(`balanceOfUnderlying: ${after.balanceOfUnderlying}`);
    console.log(`token balance: ${after.wbtc}`);
    console.log(`c_token balance: ${after.c_wbtc}`);

    // accrue interest on supply
    const sevenDays = 7 * 24 * 60 * 60;
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp;

    await ethers.provider.send("evm_increaseTime", [sevenDays]);
    for (let i = 0; i <= 100; i++) {
      await ethers.provider.send("evm_mine");
    }

    const blockNumAfter = await ethers.provider.getBlockNumber();
    const blockAfter = await ethers.provider.getBlock(blockNumAfter);
    const timestampAfter = blockAfter.timestamp;

    after = await snapshot(compoundERC20, wbtc, c_wbtc);
    console.log("");
    console.log("------ after some blocks -------");
    console.log(`estimateBalanceOfUnderlying: ${after.estimateBalance}`);
    console.log(`balance of underlying ${after.balanceOfUnderlying}`);
    console.log(`token balance ${after.wbtc}`);
    console.log(`c token balance ${after.c_wbtc}`);

    // redeem

    const cTokenAmount = await c_wbtc.balanceOf(compoundERC20.address);
    tx = await compoundERC20.connect(signer).redeem(cTokenAmount);

    after = await snapshot(compoundERC20, wbtc, c_wbtc);
    console.log("");
    console.log("---- redeem ----");
    console.log(`balance of underlying ${after.balanceOfUnderlying}`);
    console.log(`token balance ${after.wbtc}`);
    console.log(`c token balance ${after.c_wbtc}`);
  });
});
