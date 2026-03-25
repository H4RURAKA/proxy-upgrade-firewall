// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract SafeTreasuryVault {
    address public owner;
    bool public paused;
    uint256 public value;
    address public asset;
    uint256 internal lastCheckpointBlock;

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
}
