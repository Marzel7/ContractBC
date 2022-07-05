//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ICErc20.sol";
import "./interfaces/ICEth.sol";
import "./interfaces/IUniswap.sol";
import "./interfaces/IComptroller.sol";
import "./interfaces/IPriceFeed.sol";

// supply
// borrow max
// wait few blocks and let borrowed balance > supplied balance * col factor

contract TestCompoundLiquidate {
    IComptroller public comptroller =
        IComptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
    IPriceFeed public priceFeed =
        IPriceFeed(0x922018674c12a7F0D394ebEEf9B58F186CdE13c1);

    IERC20 public tokenSupply;
    ICErc20 public cTokenSupply;
    IERC20 public tokenBorrow;
    ICErc20 public cTokenBorrow;

    event Log(string message, uint256 val);

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

    function supply(uint256 _amount) public {
        tokenSupply.transferFrom(msg.sender, address(this), _amount);
        tokenSupply.approve(address(cTokenSupply), _amount);
        require(cTokenSupply.mint(_amount) == 0, "mint failed");
    }

    // not view function
    function getSupplyBalance() external returns (uint256) {
        return cTokenSupply.balanceOfUnderlying(address(this));
    }

    function getCollateralFactor() external view returns (uint256) {
        (, uint256 colFactor, ) = comptroller.markets(address(cTokenSupply));
        return colFactor; // divide by 1e18 to get in %
    }

    function getAccountLiquidity()
        external
        view
        returns (uint256 liquidity, uint256 shortfall)
    {
        // liquidity and shortfall in USD scaled up by 1e18
        (uint256 error, uint256 _liquidity, uint256 _shortfall) = comptroller
            .getAccountLiquidity(address(this));
        require(error == 0, "error");
        return (_liquidity, _shortfall);
    }

    function getPriceFeed(address _cToken) external view returns (uint256) {
        // scaled up by 1e18
        return priceFeed.getUnderlyingPrice(_cToken);
    }

    function enterMarket() external {
        address[] memory cTokens = new address[](1);
        cTokens[0] = address(cTokenSupply);
        uint256[] memory errors = comptroller.enterMarkets(cTokens);
        require(errors[0] == 0, "comptroller.enterMarkets failed");
    }

    function borrow(uint256 _amount) external {
        require(cTokenBorrow.borrow(_amount) == 0, "borrow failed");
    }

    // not view function
    function getBorrowBalance() external returns (uint256) {
        return cTokenBorrow.borrowBalanceCurrent(address(this));
    }
}

contract CompoundLiquidator {
    IComptroller public comptroller =
        IComptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);

    IERC20 public tokenBorrow;
    ICErc20 public cTokenBorrow;

    event Log(string message, uint256 val);

    constructor(address _tokenBorrow, address _cTokenBorrow) {
        tokenBorrow = IERC20(_tokenBorrow);
        cTokenBorrow = ICErc20(_cTokenBorrow);
    }

    // close factor
    function getCloseFactor() external view returns (uint256) {
        return comptroller.closeFactorMantissa();
    }

    // liquidation incentive
    function getLiquidationIncentive() external view returns (uint256) {
        return comptroller.liquidationIncentiveMantissa();
    }

    // get amount of collateral to be liquidated
    function getAmountToBeLiquidated(
        address _cTokenBorrowed,
        address _cTokenCollateral,
        uint256 _actualRepayAmount
    ) external view returns (uint256) {
        /* Get the exchange rate and calculate the number of collateral tokens to seize
        seizeAmount = actualRepayAmount * liquidationIncentive * priceBorrowed / priceCollateral
        seizeTokens = seizeAmount / exchangeRate
        actualRepayAmount * (liquidationIncentive * priceBorrowed) / (priceCollateral * exchangeRate)
        */
        (uint256 error, uint256 cTokenCollateralAmount) = comptroller
            .liquidateCalculateSeizeTokens(
                _cTokenBorrowed,
                _cTokenCollateral,
                _actualRepayAmount
            );
        require(error == 0, "error");
        return cTokenCollateralAmount;
    }

    // liquidate
    function liquidate(
        address _borrower,
        uint256 _repayAmount,
        address _cTokenCollateral
    ) external {
        tokenBorrow.transferFrom(msg.sender, address(this), _repayAmount);
        tokenBorrow.approve(address(cTokenBorrow), _repayAmount);

        require(
            cTokenBorrow.liquidateBorrow(
                _borrower,
                _repayAmount,
                _cTokenCollateral
            ) == 0,
            "liquidate failed"
        );
    }

    // get amount liquidated
    // not view function
    function getSupplyBalance(address _cTokenCollateral)
        external
        returns (uint256)
    {
        return ICErc20(_cTokenCollateral).balanceOfUnderlying(address(this));
    }
}
