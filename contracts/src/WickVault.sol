// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title WICK MON Vault — single-sided, native-MON deposits for the WICK AI market maker.
/// @notice Deposit native MON and receive vault shares; the AI market maker earns the spread
/// and the keeper streams those earnings back in via `reportYield()`, lifting every holder's
/// price-per-share. Withdraw your MON + earnings anytime. Single-asset so anyone holding only
/// testnet MON can take a real, on-chain position.
contract WickVault {
    string public constant name = "WICK MON Vault";

    address public keeper;
    uint256 public totalShares;
    uint256 public totalAssets; // MON managed by the vault (in wei)

    mapping(address => uint256) public shares;
    mapping(address => uint256) public costBasis; // MON deposited, for P&L display

    uint256 private _locked = 1;

    event Deposit(address indexed user, uint256 monIn, uint256 sharesMinted);
    event Withdraw(address indexed user, uint256 monOut, uint256 sharesBurned);
    event Yield(uint256 monAdded, uint256 totalAssets);
    event KeeperUpdated(address keeper);

    error NotKeeper();
    error Reentrancy();
    error ZeroValue();
    error InsufficientShares();
    error TransferFailed();

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor() {
        keeper = msg.sender;
    }

    function setKeeper(address k) external {
        if (msg.sender != keeper) revert NotKeeper();
        keeper = k;
        emit KeeperUpdated(k);
    }

    /// @notice Deposit native MON, receive shares at the current price-per-share.
    function deposit() external payable nonReentrant returns (uint256 minted) {
        if (msg.value == 0) revert ZeroValue();
        minted = totalShares == 0 || totalAssets == 0 ? msg.value : (msg.value * totalShares) / totalAssets;
        shares[msg.sender] += minted;
        costBasis[msg.sender] += msg.value;
        totalShares += minted;
        totalAssets += msg.value;
        emit Deposit(msg.sender, msg.value, minted);
    }

    /// @notice Redeem shares for MON (principal + earned yield).
    function withdraw(uint256 sharesToBurn) external nonReentrant returns (uint256 monOut) {
        uint256 bal = shares[msg.sender];
        if (sharesToBurn == 0 || sharesToBurn > bal) revert InsufficientShares();
        monOut = (sharesToBurn * totalAssets) / totalShares;

        // reduce cost basis proportionally
        costBasis[msg.sender] -= (costBasis[msg.sender] * sharesToBurn) / bal;
        shares[msg.sender] = bal - sharesToBurn;
        totalShares -= sharesToBurn;
        totalAssets -= monOut;

        (bool ok,) = payable(msg.sender).call{value: monOut}("");
        if (!ok) revert TransferFailed();
        emit Withdraw(msg.sender, monOut, sharesToBurn);
    }

    /// @notice Keeper streams the AI market maker's earnings into the vault (raises PPS for all).
    function reportYield() external payable {
        if (msg.sender != keeper) revert NotKeeper();
        if (msg.value == 0) revert ZeroValue();
        totalAssets += msg.value;
        emit Yield(msg.value, totalAssets);
    }

    // ---- views ----
    function assetsOf(address u) external view returns (uint256) {
        return totalShares == 0 ? 0 : (shares[u] * totalAssets) / totalShares;
    }

    function earnedOf(address u) external view returns (int256) {
        if (totalShares == 0) return 0;
        uint256 value = (shares[u] * totalAssets) / totalShares;
        return int256(value) - int256(costBasis[u]);
    }

    function pricePerShare() external view returns (uint256) {
        return totalShares == 0 ? 1e18 : (totalAssets * 1e18) / totalShares;
    }
}
