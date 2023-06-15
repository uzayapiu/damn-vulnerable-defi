// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IUniswapExchange {
    function tokenToEthSwapInput(
        uint256 tokensSold,
        uint256 minEth,
        uint256 deadline
    ) external returns (uint256);
}

interface IERC20Permit {
    function permit(
        address owner,
        address spender,
        uint value,
        uint deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) external returns (bool success);

    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}

interface ILendingPool {
    function borrow(uint256 amount, address recipient) external payable;
}
