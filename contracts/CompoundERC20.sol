//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ICompound.sol";
import "hardhat/console.sol";

contract CompoundERC20 {
    // supply
    // borrow
    // repay
    // redeem

    IERC20 public token;
    CErc20 public cToken;

    event Log(string message, uint256 val);

    constructor(address _token, address _cToken) {
        token = IERC20(_token);
        cToken = CErc20(_cToken);
    }

    function supply(uint256 _amount) external {
        token.transferFrom(msg.sender, address(this), _amount);
        token.approve(address(cToken), _amount);
        require(cToken.mint(_amount) == 0, "mint failed");
    }

    function getCTokenBalance() external view returns (uint256) {
        return cToken.balanceOf(address(this));
    }

    // not view function
    function getInfo()
        external
        returns (uint256 exchangeRate, uint256 supplyRate)
    {
        // Amount of current exchange rate from cToken to underlying
        exchangeRate = cToken.exchangeRateCurrent();
        // Amount added to you supply balance this block
        supplyRate = cToken.supplyRatePerBlock();
    }

    // not view function
    function estimateBalanceOfUnderlying() external returns (uint256) {
        uint256 cTokenBal = cToken.balanceOf(address(this));
        uint256 exchangeRate = cToken.exchangeRateCurrent();
        uint256 decimals = 8; // WBTC = 8 decimals
        uint256 cTokenDecimals = 8;

        return
            (cTokenBal * exchangeRate) / 10**(18 + decimals - cTokenDecimals);
    }

    // not view function
    function balanceOfUnderlying() external returns (uint256) {
        return cToken.balanceOfUnderlying(address(this));
    }

    function redeem(uint256 _cTokenAmount) external {
        require(cToken.redeem(_cTokenAmount) == 0, "redeem failed");
        // cToken.redeemUnderlying(underlying amount);
    }

    // borrow and repay //
    Comptroller public comptroller =
        Comptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);

    PriceFeed public priceFeed =
        PriceFeed(0x922018674c12a7F0D394ebEEf9B58F186CdE13c1);

    // collateral
    function getCollateralFactor() external view returns (uint256) {
        (bool isListed, uint256 colFactor, bool isComped) = comptroller.markets(
            address(cToken)
        );
        return colFactor; // divide by 1e18 to get in %
    }

    // account liquidity - calculate how much can I borrow?
    // sum of (supplied balance of market entered * col factor) - borrowed
    function getAccountLiquidity()
        external
        view
        returns (uint256 liquidity, uint256 shortfall)
    {
        // liquidity and shortfall in USD scaled up by 1e18
        (uint256 error, uint256 _liquidity, uint256 _shortfall) = comptroller
            .getAccountLiquidity(address(this));
        require(error == 0, "error");
        // normal circumstance - liquidity > 0 and shortfall == 0
        // liquidity > 0 means account can borrow up to `liquidity`
        // shortfall > 0 is subject to liquidation, you borrowed over limit
        return (_liquidity, _shortfall);
    }

    // open price feed - USD price of token to borrow
    function getPriceFeed(address _cToken) external view returns (uint256) {
        // scaled up by 1e18
        return priceFeed.getUnderlyingPrice(_cToken);
    }

    // enter market and borrow
    function borrow(address _cTokenToBorrow, uint256 _decimals) external {
        // enter market
        // enter the supply market so you can borrow another type of asset
        address[] memory cTokens = new address[](1);
        cTokens[0] = address(cToken);
        uint256[] memory errors = comptroller.enterMarkets(cTokens);
        require(errors[0] == 0, "Comptroller.enterMarkets failed.");

        // check liquidity
        (uint256 error, uint256 liquidity, uint256 shortfall) = comptroller
            .getAccountLiquidity(address(this));
        require(error == 0, "error");
        require(shortfall == 0, "shortfall > 0");
        require(liquidity > 0, "liquidity = 0");

        // calculate max borrow
        uint256 price = priceFeed.getUnderlyingPrice(_cTokenToBorrow);

        // liquidity - USD scaled up by 1e18
        // price - USD scaled up by 1e18
        // decimals - decimals of token to borrow
        uint256 maxBorrow = (liquidity * (10**_decimals)) / price;
        require(maxBorrow > 0, "max borrow = 0");

        // borrow 50% of max borrow
        uint256 amount = (maxBorrow * 50) / 100;
        require(CErc20(_cTokenToBorrow).borrow(amount) == 0, "borrow failed");
    }

    // borrowed balance (includes interest)
    // not view function
    function getBorrowedBalance(address _cTokenBorrowed)
        public
        returns (uint256)
    {
        return CErc20(_cTokenBorrowed).borrowBalanceCurrent(address(this));
    }

    // borrow rate
    function getBorrowRatePerBlock(address _cTokenBorrowed)
        external
        view
        returns (uint256)
    {
        // scaled up by 1e18
        return CErc20(_cTokenBorrowed).borrowRatePerBlock();
    }

    // repay borrow
    function repay(
        address _tokenBorrowed,
        address _cTokenBorrowed,
        uint256 _amount
    ) external {
        IERC20(_tokenBorrowed).approve(_cTokenBorrowed, _amount);
        // _amount = 2 ** 256 - 1 means repay all
        require(
            CErc20(_cTokenBorrowed).repayBorrow(_amount) == 0,
            "repay failed"
        );
    }
}
