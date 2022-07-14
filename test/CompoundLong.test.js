const {time, balance} = require("@openzeppelin/test-helpers");
const assert = require("assert");
const BN = require("bn.js");
const {sendEther, cast, pow, fromWei, toWei, getBalance, fromWei8, toWei8, frac} = require("./util");
const {DAI, DAI_WHALE, CDAI, WBTC, WBTC_WHALE, CWBTC, CETH} = require("./config");
const {web3} = require("@openzeppelin/test-helpers/src/setup");

const {solidity} = require("ethereum-waffle");
const CERC20 = "../artifacts/contracts/interfaces/ICErc20.sol:ICErc20";
const IERC20 = "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20";

const {expect} = require("chai");
const {ethers, artifacts} = require("hardhat");

const TOKEN_BORROW = DAI;
const C_TOKEN_BORROW = CDAI;
const REPAY_WHALE = DAI_WHALE;

const ETH_AMOUNT = 100;
const BORROW_DECIMALS = 18;
const BORROW_INTEREST = 1000;

let compoundLong;
let tokenBorrow;
let cTokenBorrow;
let cETH;
let ETH_WHALE;
let REPAY_WHALE_SIGNER;

beforeEach(async () => {
  const accounts = await ethers.getSigners();
  ETH_WHALE = accounts[0];
  REPAY_WHALE_SIGNER = ethers.provider.getSigner(REPAY_WHALE);

  const CompoundLong = await ethers.getContractFactory("CompoundLong");
  compoundLong = await CompoundLong.deploy(CETH, C_TOKEN_BORROW, TOKEN_BORROW, 18);

  tokenBorrow = await ethers.getContractAt(IERC20, TOKEN_BORROW);
  cTokenBorrow = await ethers.getContractAt(CERC20, C_TOKEN_BORROW);
  cETH = await ethers.getContractAt(IERC20, CETH);

  let borrowBal = fromWei(await tokenBorrow.balanceOf(REPAY_WHALE));
  //console.log(`repay whale balance: ${borrowBal}`);
  expect(Number(borrowBal)).to.be.gt(Number(BORROW_INTEREST)), "bal < borrow interest";

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [REPAY_WHALE],
  });

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [DAI_WHALE],
  });
});

const snapshot = async (compoundLong, tokenBorrow) => {
  const maxBorrow = await compoundLong.getMaxBorrow();
  const ethBal = await getBalance(compoundLong.address);
  const tokenBorrowBal = await tokenBorrow.balanceOf(compoundLong.address);
  const cEthBalance = await cETH.balanceOf(compoundLong.address);
  const supplied = await compoundLong.callStatic.getSuppliedBalance();
  const borrowed = await compoundLong.callStatic.getBorrowedBalance();
  const {liquidity} = await compoundLong.getAccountLiquidity();
  const cDAIBalance = await cTokenBorrow.callStatic.borrowBalanceCurrent(compoundLong.address);

  return {
    maxBorrow,
    eth: ethBal,
    tokenBorrow: tokenBorrowBal,
    cEthBalance,
    supplied,
    borrowed,
    liquidity,
    cDAIBalance,
  };
};

describe("borrow, repay, redeem", async () => {
  it("should long", async () => {
    console.log(`--- init ---`);
    console.log(``);
    console.log(`liquidity: ${await compoundLong.getAccountLiquidity()}`);
    console.log(`supplied balance: ${await compoundLong.callStatic.getSuppliedBalance()}`);
    console.log(`eth balance: ${await getBalance(compoundLong.address)}`);
    console.log(`cEth balance: ${fromWei8(8, await cETH.balanceOf(compoundLong.address))}`);

    console.log(``);

    let tx;
    let snap;
    // supply

    tx = await compoundLong.supply({
      from: ETH_WHALE.address,
      value: toWei(ETH_AMOUNT),
    });

    // long
    snap = await snapshot(compoundLong, tokenBorrow);
    console.log(`--- Supply, mint cETH ---`);
    console.log(``);
    console.log(`liquidity: ${fromWei(snap.liquidity)}`);
    console.log(`max borrow: ${fromWei(snap.maxBorrow)}`);
    console.log(`supplied balance: ${fromWei(snap.supplied)}`);
    console.log(``);
    console.log(`borrowed token balance: ${fromWei(snap.tokenBorrow)}`);
    console.log(`eth balance: ${snap.eth}`);
    console.log(`cEth balance: ${fromWei8(8, snap.cEthBalance)}`);
    console.log(``);
    const maxBorrow = await compoundLong.getMaxBorrow();

    const borrowAmount = frac(String(maxBorrow), 50, 100);
    //console.log(`max borrow amount: ${fromWei(borrowAmount)}`);
    (tx = await compoundLong.connect(ETH_WHALE).long(parseInt(fromWei(borrowAmount)))), {gasLimit: 5000000};

    snap = await snapshot(compoundLong, tokenBorrow);
    console.log(`--- Exchange DAI for ETH ---`);
    console.log(``);
    // DAI balance won't be available if Uniswap is called within long()
    console.log(`borrowed token (DAI) balance: ${(fromWei8, (8, snap.tokenBorrow))}`);
    console.log(`supplied balance: ${fromWei(snap.supplied)}`);
    console.log(`eth balance: ${snap.eth}`);
    console.log(`liquidity: ${fromWei(snap.liquidity)}`);
    console.log(`cEth balance: ${fromWei8(8, snap.cEthBalance)}`);
    console.log(`cDAI balance: ${snap.cDAIBalance}`);

    // accrue interest on borrow
    const block = await web3.eth.getBlockNumber();
    await time.advanceBlockTo(block + 1000);

    // repay
    await tokenBorrow.connect(REPAY_WHALE_SIGNER).transfer(compoundLong.address, BORROW_INTEREST);
    tx = await compoundLong.connect(ETH_WHALE).repay({gasLimit: 5000000});

    snap = await snapshot(compoundLong, tokenBorrow);
    console.log(``);
    console.log(`--- Repay ---`);
    console.log(``);
    console.log(`liquidity : ${fromWei(snap.liquidity)}`);
    console.log(`borrowed : ${fromWei(snap.borrowed)}`);
    console.log(`eth balance: ${fromWei(snap.eth)}`);
    console.log(`token borrow: ${fromWei(snap.tokenBorrow)}`);
    console.log(`cEth balance: ${fromWei(snap.cEthBalance)}`);
    console.log(`cDAI balance: ${snap.cDAIBalance}`);
  });
});
