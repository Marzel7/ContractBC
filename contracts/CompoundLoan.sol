//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ICEth.sol";
import "./interfaces/ICErc20.sol";
import "./interfaces/IUniswap.sol";
import "./interfaces/IComptroller.sol";
import "./interfaces/IPriceFeed.sol";

contract CompoundLoan {
    IERC20 public tokenSupply;
    ICErc20 public cTokenSupply;
    IERC20 public tokenBorrow;
    ICErc20 public cTokenBorrow;

    IComptroller public comptroller =
        IComptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
    IPriceFeed public priceFeed =
        IPriceFeed(0x922018674c12a7F0D394ebEEf9B58F186CdE13c1);

    // WETH
    IERC20 private constant WETH =
        IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    constructor(
        address _tokenSupply,
        address _cTokenSupply,
        address _tokenBorrow,
        address _cTokenBorrow
    ) {
        tokenSupply = IERC20(_tokenSupply);
        cTokenSupply = ICErc20(_cTokenSupply);
        tokenBorrow = IERC20(_tokenBorrow);
        cTokenBorrow = ICErc20(_cTokenBorrow);
    }

    function supply(uint256 _amount) external payable {
        tokenSupply.transferFrom(msg.sender, address(this), _amount);
        tokenSupply.approve(address(cTokenSupply), _amount);
        cTokenSupply.mint(_amount);
    }

    function enterMarket() external {
        address[] memory cTokens = new address[](1);
        cTokens[0] = address(cTokenSupply);
        uint256[] memory errors = comptroller.enterMarkets(cTokens);
        require(errors[0] == 0, "comptroller.enterMarkets failed");
    }

    function getBalance() external view returns (uint256) {
        return cTokenSupply.balanceOf(address(this));
    }

    // not view function
    function getSupplyBalance() external returns (uint256) {
        return cTokenSupply.balanceOfUnderlying(address(this));
    }

    function getCollateralFactor() external view returns (uint256) {
        (, uint256 colFactor, ) = comptroller.markets(address(cTokenSupply));
        return colFactor;
    }

    function getBorrowBalance() external returns (uint256) {
        return cTokenSupply.borrowBalanceCurrent(address(this));
    }

    function getPriceFeed(address _cToken) external view returns (uint256) {
        return priceFeed.getUnderlyingPrice(_cToken);
    }

    function getAccountLiquidity()
        external
        view
        returns (uint256 liquidity, uint256 shortfall)
    {
        // scaled up by 1e18
        (uint256 error, uint256 _liquidity, uint256 _shortfall) = comptroller
            .getAccountLiquidity(address(this));
        require(error == 0, "error");
        return (_liquidity, _shortfall);
    }

    function borrow(uint256 _amount) external payable {}

    receive() external payable {}
}
