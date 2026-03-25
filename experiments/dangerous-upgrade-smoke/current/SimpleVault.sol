// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract SimpleVault {
    bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    address public owner;
    bool public paused;
    uint256 public value;
    address public asset;
    bytes32 public upgraderRole;

    event Upgraded(address indexed implementation, bytes data);
    event ValueUpdated(uint256 value);

    modifier onlyRole(bytes32) {
        _;
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        paused = true;
    }

    function setValue(uint256 newValue) external onlyRole(CONFIG_ROLE) {
        value = newValue;
        emit ValueUpdated(newValue);
    }

    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable {
        _authorizeUpgrade(newImplementation);
        emit Upgraded(newImplementation, data);
    }

    function grantRole(bytes32, address) external onlyRole(DEFAULT_ADMIN_ROLE) {}

    function revokeRole(bytes32, address) external onlyRole(DEFAULT_ADMIN_ROLE) {}

    function _authorizeUpgrade(address) internal onlyRole(UPGRADER_ROLE) {}
}

