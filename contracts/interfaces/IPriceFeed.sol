//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

interface IPriceFeed {
    function getUnderlyingPrice(address cToken) external view returns (uint256);
}
