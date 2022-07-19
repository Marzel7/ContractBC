const {ethers, artifacts} = require("hardhat");
const BN = require("bn.js");

async function sendEther(from, to, amount) {
  return await from.sendTransaction({
    to,
    value: toWei(amount),
  });
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function cast(x) {
  if (x instanceof BN) {
    return x;
  }
  return new BN(x);
}

function eq(x, y) {
  x = cast(x);
  y = cast(y);
  return x.eq(y);
}

function pow(x, y) {
  x = cast(x);
  y = cast(y);
  return x.pow(y);
}

function frac(x, n, d) {
  x = cast(x);
  n = cast(n);
  d = cast(d);
  return x.mul(n).div(d);
}

const toWei = value => ethers.utils.parseEther(value.toString());
const fromWei = value => ethers.utils.formatEther(typeof value === "string" ? value : value.toString());

const fromWei8 = (decimals, value) => (value == 0 ? 0 : value / 10 ** decimals);
const toWei8 = (decimals, value) => 10 ** decimals * value;

const getBalance = ethers.provider.getBalance;

module.exports = {
  sendEther,
  ZERO_ADDRESS,
  eq,
  pow,
  frac,
  toWei,
  fromWei,
  getBalance,
  fromWei8,
  toWei8,
  cast,
};
