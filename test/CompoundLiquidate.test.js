const {time, balance} = require("@openzeppelin/test-helpers");
const assert = require("assert");
const BN = require("bn.js");
const {sendEther, pow, fromWei, toWei, getBalance, fromWei8, toWei8} = require("./util");
const {DAI, DAI_WHALE, CDAI, WBTC_WHALE, CWBTC, WBTC} = require("./config");
const {web3} = require("@openzeppelin/test-helpers/src/setup");

const {solidity} = require("ethereum-waffle");
const CIERC20_SOURCE = "../artifacts/contracts/interfaces/ICErc20.sol:ICErc20";
const IERC20_SOURCE = "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20";

const {expect} = require("chai");
const {ethers, artifacts} = require("hardhat");

const WHALE = WBTC_WHALE;
const TOKEN = WBTC;
const C_TOKEN = CWBTC;
const DEPOSIT_AMOUNT = toWei(10);

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
});
