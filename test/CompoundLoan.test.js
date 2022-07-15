const {time, balance} = require("@openzeppelin/test-helpers");
const assert = require("assert");
const BN = require("bn.js");
const {sendEther, pow, fromWei, toWei, getBalance, fromWei8, toWei8} = require("./util");
const {DAI, CDAI, CETH, WETH_WHALE, WETH} = require("./config");
const {web3} = require("@openzeppelin/test-helpers/src/setup");

const {solidity} = require("ethereum-waffle");

const IERC20 = "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20";
const CIERC20 = "../artifacts/contracts/interfaces/ICErc20.sol:ICErc20";

const {expect} = require("chai");
const {ethers, artifacts} = require("hardhat");

const WHALE = WETH_WHALE;
const TOKEN = DAI;
const C_TOKEN = CDAI;
const DEPOSIT_AMOUNT = toWei(10);
const SUPPLY_DECIMALS = 8;

let compoundERC20;
let cETH;
let cDAI;
let compoundLoan;
let deployer, signer;

beforeEach(async () => {
  const accounts = await ethers.getSigners();
  deployer = accounts[0];

  const CompoundLoan = await ethers.getContractFactory("CompoundLoan");
  compoundLoan = await CompoundLoan.deploy(CETH, CDAI, WETH);

  cETH = await ethers.getContractAt(CIERC20, CETH);
  cDAI = await ethers.getContractAt(CIERC20, CDAI);

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [WHALE],
  });
  await deployer.sendTransaction({
    to: compoundLoan.address,
    value: toWei(10),
  });
});

describe("Compound", function () {
  it("Borrow from Compound", async function () {
    //  10 Eth is transferred to CompoundLoan
    expect(await getBalance(compoundLoan.address)).to.eq(toWei(10));
    // cETH and cDAI balances are 0
    expect(await cETH.balanceOf(compoundLoan.address)).to.eq(0);
    expect(await cDAI.balanceOf(compoundLoan.address)).to.eq(0);
    console.log(await compoundLoan.getBalance());
    // Supply ETH to Compound, mint cETH
    await compoundLoan.supply({value: toWei(10)});
    // CompoundLoan balance is still 10 ETH
    expect(await getBalance(compoundLoan.address)).to.eq(toWei(10));
    console.log(fromWei8(8, await compoundLoan.getBalance()));
  });
});
