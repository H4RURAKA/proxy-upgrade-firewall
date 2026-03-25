// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract SimpleVault {
    address public owner;
    address public emergencyAdmin;
    bool public paused;
    uint256 public value;
    address public asset;

    event Upgraded(address indexed implementation, bytes data);
    event ValueUpdated(uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function pause() external onlyOwner {
        paused = true;
    }

    function setValue(uint256 newValue) external onlyOwner {
        value = newValue;
        emit ValueUpdated(newValue);
    }

    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable {
        _authorizeUpgrade(newImplementation);
        emit Upgraded(newImplementation, data);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function emergencySweep(address, uint256) external {}

    function forward(address target, bytes calldata data) external onlyOwner {
        (bool ok,) = target.delegatecall(data);
        require(ok, "delegatecall failed");
    }

    function _authorizeUpgrade(address) internal onlyOwner {}
}

