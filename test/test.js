const { expectRevert} = require('@openzeppelin/test-helpers');

const EcoGames = artifacts.require('EcoGames');
const Usd = artifacts.require('Usd');
const Usdt = artifacts.require('Usdt');
const TokensVesting = artifacts.require('TokensVesting');
const Crowdsale = artifacts.require('CrowdSale');

contract('Test', (accounts) => {

    let ecoGames;
    let usd;
    let usdt;
    let tokensVesting;
    let crowdsale;
    
    const owner = accounts[0]; // Creator of the contract (also owns all the USDs)
    const sender = accounts[1]; // Random account
    const randomAccount = accounts[2]; // Random account

    /* 
        Function to convert number to string (works like BN)
    */
    function toPlainString(num) {
        return (''+ +num).replace(/(-?)(\d*)\.?(\d*)e([+-]\d+)/,
          function(a,b,c,d,e) {
            return e < 0
              ? b + '0.' + Array(1-e-c.length).join(0) + c + d
              : b + c + d + Array(e-d.length+1).join(0);
        });
    }

    const amount1 = 2667 * 10 ** 18; // $10.00125
    const _amount1 = 2666 * 10 ** 18; // $9.9975

    const amount = toPlainString(amount1); // sufficient usd amount
    const _amount = toPlainString(_amount1); // insufficient usd amount
    
    /* 
        Deploys all four contracts and sets crowdsale address in vesting contract
    */
    before(async () => {

        ecoGames = await EcoGames.deployed().then((inst => {
            return inst;
        }));

        usd = await Usd.deployed(sender).then((inst => {
            return inst;
        }));

        usdt = await Usdt.deployed(sender).then((inst => {
            return inst;
        }));

        tokensVesting = await TokensVesting.deployed(ecoGames.address).then((inst => {
            return inst;
        }));

        crowdsale = await Crowdsale.deployed(ecoGames.address, TokensVesting.address, Usdt.address, Usdt.address, Usd.address).then((inst => {
            return inst;
        }));

        await tokensVesting.setCrowdsaleAddress(crowdsale.address, {from: owner});
        
    });

    describe('EcoGames contract', () => {

        it('should have minted 120 billion tokens to owner', async () => {
            let bal = await ecoGames.balanceOf(owner);
            let tokenWithoutDecimal = Number(bal) / (10 ** 18);
            let supply = 12000000000; // 12'000'000'000
            assert.equal(tokenWithoutDecimal, supply, "Minting amount is not 120 billion");
        }); 

        it('should prevent burn - caller is not the owner', () => {
            return expectRevert(ecoGames.burn({from: sender}), 'Eco Games: Caller is not the owner');
        });
        
        it('should burn 50m - caller is owner', async () => {
            await ecoGames.burn({from: owner});
            let bal = await ecoGames.balanceOf(owner);
            let tokenWithoutDecimal = Number(bal) / (10 ** 18);
            let newBal = 11950000000; // 11'950'000'000
            assert.equal(tokenWithoutDecimal, newBal, "Burn amount is not 50m");
        });
        
        it('should prevent burn - burn date has not reached', () => {
            return expectRevert(ecoGames.burn({from: owner}), 'Burn date has not reached');
        });

        it('should transferOwnership - caller is owner', async () => {
            await ecoGames.transferOwnership(randomAccount, {from: owner});
            return expectRevert(ecoGames.transferOwnership(sender, {from: owner}), 'Eco Games: Caller is not the owner');
        });

        /* 
            Transfer to owner will send funds to random account since that is the new owner of EcoGames contract
        */
        it('should transfer tokens sent to contract to owner', async () => {
            let transferAmount = 15000000000000000000;
            let _bal = await web3.eth.getBalance(randomAccount);
            await ecoGames.sendTransaction({from: sender, value: transferAmount});
            let _bal2 = await web3.eth.getBalance(randomAccount);
            let bal = Number(_bal) + transferAmount;
            let bal2 = Number(_bal2);
            assert.equal(bal, bal2, "Receive function has failed to transfer ethers to owner");
        });

    });

    describe('Crowdsale contract', () => {

        it('should prevent buy with dai - sale round has not started', () => {
            return expectRevert(crowdsale.buyWithDAI(amount, {from: sender}), "Sale round is over or has not started");
        });

        it('should prevent start sale period - caller is not the owner', () => {
            return expectRevert(crowdsale.startSalePeriod(120, {from: sender}), "Crowdsale: Caller is not the owner");
        });

        it('should start sale period - caller is owner', async () => {
            await crowdsale.startSalePeriod(1200, {from: owner});
        });

        /* 
            Note: _amount is under 10 dollars and amount is above
        */
        it('should prevent buy with dai - amount is under 10 dollars', () => {
            return expectRevert(crowdsale.buyWithDAI(_amount, {from: sender}), "Buy amount must be above 10 USD");
        });

        /* 
            using owner as sender of transactions, since owner has usd
        */
        it('should prevent buy with dai - contract not approved', () => {
            return expectRevert(crowdsale.buyWithDAI(amount, {from: owner}), "ERC20: insufficient allowance");
        });

        it('should approve contract', async () => {
            let maximumAmount = toPlainString(100000000000000000000000000);
            await usd.approve(crowdsale.address, maximumAmount, {from: sender});
            await usdt.approve(crowdsale.address, maximumAmount, {from: sender});
        });

        it('should buy with dai - contract approved', async () => {
            let bal = await usd.balanceOf(owner);
            await crowdsale.buyWithDAI(amount, {from: sender});
            let bal2 = await usd.balanceOf(owner);
            let bal3 = Number(bal2) + amount;
            assert(bal, bal3, "Transfer of usd to owner has failed");
        });

        it('should prevent buy with eth - amount is under 10 dollars', () => {
            let _value = Number(amount) / 1420; // 1420 is eth price set in contract during testing
            return expectRevert(crowdsale.buyWithETH(_amount, {from: sender, value: _value}), "Buy amount must be above 10 USD");
        });

        /* 
            the above test sends enough eths but the usd amount is insufficient, whilst the test below has sufficient usd amount but not enough eths were sent
        */
        it('should prevent buy with eth - not enough eths sent', () => {
            let usdAmount = 10000000000000000000; // 10 dollars
            let _value = toPlainString(Math.floor(usdAmount / 1420) - 1); // round down to send less eths
            return expectRevert(crowdsale.buyWithETH(amount, {from: sender, value: _value}), "Not enough ETHs sent");
        });

        it('should buy with eth - enough eths sent', async () => {
            let _value = Number(amount) / 1420; // eth price in contract
            let bal = await web3.eth.getBalance(crowdsale.address);
            await crowdsale.buyWithETH(amount, {from: sender, value: _value});
            let bal2 = await web3.eth.getBalance(crowdsale.address);
            let bal3 = Number(bal2) + _value;
            assert(bal, bal3, "Transfer of eth to contract has failed");
        });

        it('should prevent buy with tether - limit is 1 eth per account', async () => {
            let amount_ = toPlainString(373333000000000000000000); // 373,333 tokens + 5334 already bought = 378,667 tokens, which is equivalent to $1,420.00125 and exceeds 1 ether (at the time of testing, eth is set to $1420)
            return expectRevert(crowdsale.buyWithUSDT(amount_, {from: sender}), "Balance cannot exceed 1 Eth");
        });
        
        it('should buy with tether', async () => {
            let amount_ = toPlainString(Number(amount) / (10 ** 12)); // Since usdt and usdc have 6 decimal places instead of 18
            let bal = await usdt.balanceOf(owner);
            await crowdsale.buyWithUSDT(amount, {from: sender});
            let bal2 = await usdt.balanceOf(owner);
            let bal3 = Number(bal2) + amount_;
            assert(bal, bal3, "Transfer of usdt to owner has failed");
        });
        
        /*
            8001 tokens bought till now, so 300'000'000 - 8'001 = 299'991'999 tokens left in the current round limit
            The following tests that require 'arbitrary function' are included in the test folder as test.sol (Lines 205-223)
        */

        it('should buy tokens (using arbitrary function) - 300m limit has not yet been surpassed', async () => {
            let tokenRaised = await crowdsale.tokensRaised();
            await crowdsale.testingLimit({from: owner});
            let tokenRaised2 = await crowdsale.tokensRaised();
            let tokenRaised3 = toPlainString((Number(tokenRaised) + 299991999000000000000000000)); // 299'991'999 tokens
            assert(tokenRaised2, tokenRaised3, "Failed to buy tokens");
        });

        it('should prevent buy with usdc - reached sale limit', () => {
            return expectRevert(crowdsale.buyWithUSDC(amount, {from: sender}), "Amount exceeds sale round limit");
        });
        
        it('should buy with usdc - sale round initiated so new limit is 900m', async () => {
            await crowdsale.initiateRound(1, {from: owner}); // increasing sale round, so now 900m tokens available
            let _amount = toPlainString(2999 * 10 ** 18);
            let amount_ = toPlainString(Number(_amount) / (10 ** 12)); // Since usdt and usdc work similarly, we will use usdt instead of creating a new token called 'usdc'
            let bal = await usdt.balanceOf(owner);
            await crowdsale.buyWithUSDC(_amount, {from: sender});
            let bal2 = await usdt.balanceOf(owner);
            let bal3 = Number(bal2) + Number(amount_);
            assert(bal, bal3, "Transfer of usdc to owner has failed");
        });

        /* 
            2999 tokens bought in the new round, so 900'000'000 - 2'999 = 899,997,001 tokens left in the current round limit
        */
        it('should buy tokens (using arbitrary function) - 900m limit has not yet been surpassed', async () => {
            let tokenRaised = await crowdsale.tokensRaised();
            await crowdsale.testingLimit1({from: owner});
            let tokenRaised2 = await crowdsale.tokensRaised();
            let tokenRaised3 = toPlainString((Number(tokenRaised) + 899997001000000000000000000)); // 899,997,001 tokens
            assert(tokenRaised2, tokenRaised3, "Failed to buy tokens");
        });

        it('should prevent buy with usdt - reached sale limit again', () => {
            return expectRevert(crowdsale.buyWithUSDT(amount, {from: sender}), "Amount exceeds sale round limit");
        });

        it('should have changed usd rate - new round has been initiated', async () => {
            let rate = await crowdsale.usdRATE(1);
            assert(rate, "500", "Usd rate has not changed");
        });

        it('should prevent buy with dai - start crowdsale is false', async () => {
            await crowdsale.togglePauseCrowdsale({from: owner});
            return expectRevert(crowdsale.buyWithDAI(amount, {from: sender}), "Crowdsale: crowdsale has paused");
        });

        it('should end crowdsale - caller is owner', async () => {
            let _startCrowdsale = await crowdsale.startCrowdsale();
            await crowdsale.endCrowdsale({from: owner});
            let _startCrowdsale2 = await crowdsale.startCrowdsale();
            assert(toPlainString(_startCrowdsale), toPlainString(_startCrowdsale2), "End crowdsale has not ended");
        });

        it('should prevent end crowdsale - already initiated', async () => {
            return expectRevert(crowdsale.endCrowdsale({from: owner}), "TokensVesting: already initiated!");
        });

    });

    describe('Vesting contract', () => {
        
        it('should return the correct vest', async () => {
            let vest = await tokensVesting.vests(owner);
            let totalvest = toPlainString(vest.totalVest);
            let _totalVest = toPlainString(1199990000000000000000000000); // 1,199,890,000 tokens for owner since 899,997,001 + 299,991,999
            let vest1 = await tokensVesting.vests(sender);
            let totalvest1 = toPlainString(vest1.totalVest);
            let _totalVest1 = toPlainString(11000000000000000000000); // 11'000 tokens
            assert(totalvest, _totalVest, "Failed to store all vests");
            assert(totalvest1, _totalVest1, "Failed to store all vests");
        });

        it('should prevent vest - Only crowdsale contract', () => {
            return expectRevert(tokensVesting._vest(sender, amount, 0, {from: sender}), 'Vesting: Only crowdsale contract can call this function');
        });

        it('should not transfer any tokens - no tokens were vested', async () => {
            let vest = await tokensVesting.vests(randomAccount);
            assert(vest.totalVest, "0", "Initial vest isn't zero, although no vests has been made");
            await tokensVesting.initialUnlock({from: randomAccount}); // Tx will go through with no errors, but no tokens will be paid to caller
            let bal = await ecoGames.balanceOf(randomAccount);
            assert(bal, "0", "Tokens were incorrectly transfered to caller");
        });

        it('should prevent monthly unlock - initial unlock has to be called first', () => {
            return expectRevert(tokensVesting.monthlyUnlock({from: sender}), "Initial unlock has not been completed");
        });

        it('should prevent changing initial period - caller is not owner', () => {
            return expectRevert(tokensVesting.setInitialPeriod(0, {from: sender}), "Vesting: Caller is not the owner");
        });

        it('should change initial period and vest period - caller is owner', async () => {
            await tokensVesting.setInitialPeriod(0, {from: owner});
            await tokensVesting.setVestPeriod(0, {from: owner});
            // 0 seconds to check monthlyUnlock function
        });
        
        it('should initial unlock', async () => {

            let transferAmount = toPlainString(1500000000*10**18); // 1'500'000'000 tokens
            await ecoGames.transfer(tokensVesting.address, transferAmount, {from: owner}); // Owner has to transfer minted tokens to vesting contract at some point
            
            let vest = await tokensVesting.vests(sender);
            await tokensVesting.initialUnlock({from: sender});
            let bal = ecoGames.balanceOf(sender);

            let bal1 = (Number(vest.round1)) * 0.05 + (Number(vest.round2) * 0.075) + (Number(vest.round3) * 0.1);

            assert(bal, bal1, "Tokens have not been correctly transfered to caller");

            let vest1 = await tokensVesting.vests(sender);
            let rounds = toPlainString(Number(vest1.round1) + Number(vest1.round2) + Number(vest1.round3));
            let _rounds = toPlainString(0);
            assert(rounds, _rounds, "Rounds are not null, even though initial unlock has been completed");

            let lockedamount = toPlainString((Number(vest.round1)) * 0.95 + (Number(vest.round2) * 0.925) + (Number(vest.round3) * 0.9));

            assert(vest1.lockedAmount, lockedamount, "Incorrect total locked amount");
            assert(vest.unlockedAmount, toPlainString(bal1), "Incorrect unlocked amount");
        });

        it('should prevent initial unlock - initial unlock cannot be done twice', () => {
            return expectRevert(tokensVesting.initialUnlock({from: sender}), "Initial unlock has already been done");
        });

        // it('should prevent monthly unlock - unlock date has not been reached', () => {
        //     return expectRevert(tokensVesting.monthlyUnlock({from: sender}), "Unlock date has not passed"); 
        // });
        // // Unlock date has been tested. Tested by keeping initial and vest period the same

        it('should unlock monthly 21 times - vest period has been set to null', async () => {

            for (let i = 0; i < 21; i++) {
                let tx = await tokensVesting.monthlyUnlock({from: sender});
            }

            let vest = await tokensVesting.vests(sender);
            assert(vest.lockedAmount, vest.unlockedAmount, "Failed to unlock all locked funds");
        });

        it('should prevent monthly unlock - all vests have been unlocked', () => {
            return expectRevert(tokensVesting.monthlyUnlock({from: sender}), "All vests have been unlocked");
        });

        it('should withdraw funds - tokens bought with eth in crowdsale have been transfered to this contract', async () => {
            let bal = await web3.eth.getBalance(owner);
            await tokensVesting.withdraw({from: owner});
            let contractbal = await web3.eth.getBalance(tokensVesting.address);
            let bal2 = await web3.eth.getBalance(owner);
            assert.equal(contractbal, "0", "Withdrawal has failed");
            let isGreater = Number(bal) < Number(bal2);
            assert(isGreater, true, "Eths failed to transfer to owner");
        });

    });

});