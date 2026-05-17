// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract GoalAuditTrail {
    event GoalHashed(uint256 goalId, bytes32 dataHash, address by, uint256 timestamp);

    mapping(uint256 => bytes32[]) public goalHashes;

    function recordHash(uint256 goalId, bytes32 dataHash) public {
        goalHashes[goalId].push(dataHash);
        emit GoalHashed(goalId, dataHash, msg.sender, block.timestamp);
    }

    function getHashes(uint256 goalId) public view returns (bytes32[] memory) {
        return goalHashes[goalId];
    }
}
