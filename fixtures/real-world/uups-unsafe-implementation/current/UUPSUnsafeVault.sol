// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

abstract contract InitializableLite {
    bool private _initializersDisabled;

    function _disableInitializers() internal {
        _initializersDisabled = true;
    }
}

contract UUPSUnsafeVault is InitializableLite {
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

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address initialAsset) external {
        owner = initialOwner;
        asset = initialAsset;
    }

    function setValue(uint256 newValue) external onlyOwner {
        value = newValue;
        emit ValueUpdated(newValue);
    }

    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable {
        _authorizeUpgrade(newImplementation);
        emit Upgraded(newImplementation, data);
    }

    function _authorizeUpgrade(address) internal onlyOwner {}
}
