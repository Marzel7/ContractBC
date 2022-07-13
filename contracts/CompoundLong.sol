//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

/* Long ETH
1. Supply ETH
2. Borrow stable coin (DAI, USDC)
3. Buy ETH on Uniswap

when the price of ETH goes up
4. sell ETH on Uniswap
5. repay borrowed stable coin
*/

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ICEth.sol";
import "./interfaces/ICErc20.sol";
import "./interfaces/IUniswap.sol";
import "./interfaces/IComptroller.sol";
import "./interfaces/IPriceFeed.sol";

contract CompoundLong {
    ICEth public cEth;
    ICErc20 public cTokenBorrow;
    IERC20 public tokenBorrow;
    uint256 public decimals;

    IComptroller public comptroller =
        IComptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
    IPriceFeed public priceFeed =
        IPriceFeed(0x922018674c12a7F0D394ebEEf9B58F186CdE13c1);

    // UNISWAP WETH Router
    IUniswapV2Router private constant UNI =
        IUniswapV2Router(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

    // WETH
    IERC20 private constant WETH =
        IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    constructor(
        address _cEth,
        address _cTokenBorrow,
        address _tokenBorrow,
        uint256 _decimals
    ) {
        cEth = ICEth(_cEth);
        cTokenBorrow = ICErc20(_cTokenBorrow);
        tokenBorrow = IERC20(_tokenBorrow);
        decimals = _decimals;

        // enter markets to enable borrow
        address[] memory cTokens = new address[](1);
        cTokens[0] = address(cEth);
        uint256[] memory errors = comptroller.enterMarkets(cTokens);
        require(errors[0] == 0, "Comptroller.enterMarkets failed");
    }

    receive() external payable {}

    function supply() external payable {
        cEth.mint{value: msg.value}();
    }

    function getMaxBorrow() external view returns (uint256) {
        (uint256 error, uint256 liquidity, uint256 shortfall) = comptroller
            .getAccountLiquidity(address(this));

        require(error == 0, "error");
        require(shortfall == 0, "shortfall == 0");
        require(liquidity > 0, "liquidity = 0");

        uint256 price = priceFeed.getUnderlyingPrice(address(cTokenBorrow));
        uint256 maxBorrow = (liquidity * (10**decimals)) / price;
        return maxBorrow;
    }

    function long(uint256 _borrowAmount) external {
        // borrow
        require(cTokenBorrow.borrow(_borrowAmount) == 0, "borrow failed");
        // buy Eth
        uint256 bal = tokenBorrow.balanceOf(address(this));
        tokenBorrow.approve(address(UNI), bal);

        address[] memory path = new address[](2);
        path[0] = address(tokenBorrow);
        path[1] = address(WETH);
        UNI.swapExactTokensForETH(bal, 1, path, address(this), block.timestamp);
    }

    function repay() external {
        // sell ETH
        address[] memory path = new address[](2);
        path[0] = address(WETH);
        path[1] = address(tokenBorrow);
        UNI.swapExactETHForTokens{value: address(this).balance}(
            1,
            path,
            address(this),
            block.timestamp
        );
        // repay borrow
        uint256 borrowed = cTokenBorrow.borrowBalanceCurrent(address(this));
        tokenBorrow.approve(address(cTokenBorrow), borrowed);
        require(cTokenBorrow.repayBorrow(borrowed) == 0, "repay failed");

        uint256 supplied = cEth.balanceOfUnderlying(address(this));
        require(cEth.redeemUnderlying(supplied) == 0, "redeem failed");

        // supplied ETH + supplied interest + profit (in token borrow)
    }

    /// borrowed CTokens (100)
    // Buy Eth  - 1000 Token 100
    // Eth price goes up
    // Sell Eth  - 2000 Token 200
    // Repay borrowed tokens - 100
    // redeem ???

    // not view function
    function getSuppliedBalance() external returns (uint256) {
        return cEth.balanceOfUnderlying(address(this));
    }

    // not view funciton
    function getBorrowedBalance() external returns (uint256) {
        return cTokenBorrow.borrowBalanceCurrent(address(this));
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
}
