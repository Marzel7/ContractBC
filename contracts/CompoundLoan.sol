//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ICEth.sol";
import "./interfaces/ICErc20.sol";
import "./interfaces/IUniswap.sol";
import "./interfaces/IComptroller.sol";
import "./interfaces/IPriceFeed.sol";

contract CompoundLoan {
    ICEth cEth;
    ICErc20 cTokenBorrow;
    ICErc20 tokenBorrow;

    constructor(
        ICEth _cEth,
        ICErc20 _cTokenBorrow,
        ICErc20 _tokenBorrow
    ) {
        cEth = ICEth(_cEth);
        cTokenBorrow = ICErc20(_cTokenBorrow);
        tokenBorrow = ICErc20(_tokenBorrow);
    }

    function supply() external payable {
        cEth.mint{value: msg.value}();
    }

    function getBalance() external view returns (uint256) {
        return cEth.balanceOf(address(this));
    }

    receive() external payable {}
}
