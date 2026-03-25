// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract GovernedVault {
    address public owner;
    bool public paused;
    uint256 public value;
    address public asset;

    event Upgraded(address indexed implementation, bytes data);
    event ValueUpdated(uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address initialOwner, address initialAsset) {
        owner = initialOwner;
        asset = initialAsset;
    }

    function pause() external onlyOwner {
        paused = true;
    }

    function setValue(uint256 newValue) external onlyOwner {
        value = newValue;
        emit ValueUpdated(newValue);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable {
        _authorizeUpgrade(newImplementation);
        emit Upgraded(newImplementation, data);
    }

    function _authorizeUpgrade(address) internal onlyOwner {}
}
