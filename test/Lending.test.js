const { assert } = require("chai");
const BigNumber = require("bignumber.js");

const Lending = artifacts.require("./contract/Lending.sol");
const KIP7Token = artifacts.require("./node_modules/@klaytn/contracts/token/KIP7/KIP7Token.sol");
const KIP17Token = artifacts.require("./node_modules/@klaytn/contracts/token/KIP17/KIP17Token.sol");
const DataHolder = artifacts.require("./contract/DataHolder.sol");

require("chai").use(require("chai-as-promised")).should();

const prerequisite = async (accounts) => {
    const nftKlayPrice = new BigNumber(500).times(new BigNumber(10 ** 18));
    const klayExchangeRate = new BigNumber(1).times(new BigNumber(10 ** 18));
    const maxLtv = 80;
    const liqLtv = 90;

    let nftContract = await KIP17Token.new("WhiteListed", "WL");
    let notWhiteListContract = await KIP17Token.new("NotWhiteListed", "NWL");
    let stableContract = await KIP7Token.new(
        "StableToken",
        "Stable",
        18,
        new BigNumber(1000).times(new BigNumber(10 ** 18))
    );

    let dataHolderContract = await DataHolder.new();
    await dataHolderContract.addWhiteList(nftContract.address, maxLtv, liqLtv);
    await dataHolderContract.setFloorPrice(nftContract.address, nftKlayPrice, klayExchangeRate);

    let lendingContract = await Lending.new(dataHolderContract.address, stableContract.address);
    let owner = accounts[0];
    let hacker = accounts[1];

    await stableContract.mint(
        lendingContract.address,
        new BigNumber(1000).times(new BigNumber(10 ** 18))
    );

    return {
        lendingContract,
        nftContract,
        owner,
        hacker,
        stableContract,
        notWhiteListContract,
        dataHolderContract,
    };
};

contract("1. 대출", async (accounts) => {
    const tokenId = 0;
    const loanAmount = new BigNumber(100).times(new BigNumber(10 ** 18));

    describe("로직 검증", async () => {
        it("프로토콜에게 NFT의 소유권이 이전됨", async () => {
            const { lendingContract, nftContract, owner } = await prerequisite(accounts);

            await nftContract.mint(owner, tokenId);

            await nftContract.approve(lendingContract.address, tokenId);
            await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId);

            assert.equal(await nftContract.ownerOf(tokenId), lendingContract.address);
        });

        it("대출자에게 요청한 만큼의 토큰이 전송됨", async () => {
            const { lendingContract, nftContract, owner, hacker, stableContract } =
                await prerequisite(accounts);

            await nftContract.mint(owner, tokenId);

            await nftContract.approve(lendingContract.address, tokenId);

            const beforeBalanceOfOwner = await stableContract.balanceOf(owner);

            await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId);

            const afterBalanceOfOwner = await stableContract.balanceOf(owner);

            assert.equal(afterBalanceOfOwner - beforeBalanceOfOwner, loanAmount);
        });

        it("NFT로 빌릴 수 있는 한도에 딱 맞게 대출함", async () => {
            const {
                lendingContract,
                nftContract,
                owner,
                hacker,
                stableContract,
                notWhiteListContract,
                dataHolderContract,
            } = await prerequisite(accounts);
            const overflowPrice = new BigNumber(800).times(new BigNumber(10 ** 18));
            const nftKlayPrice = new BigNumber(1000).times(new BigNumber(10 ** 18));
            const klayExchangeRate = new BigNumber(1).times(new BigNumber(10 ** 18));
            await dataHolderContract.setFloorPrice(
                nftContract.address,
                nftKlayPrice,
                klayExchangeRate
            );

            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);
            await lendingContract.stakeAndBorrow(overflowPrice, nftContract.address, tokenId).should
                .be.fulfilled;
        });
    });

    describe("예외처리 검증", async () => {
        it("대출을 신청한 NFT의 소유권을 가지고 있지않음", async () => {
            const { lendingContract, nftContract, owner, hacker } = await prerequisite(accounts);
            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);

            await nftContract.mint(hacker, tokenId + 1);
            await nftContract.approve(lendingContract.address, tokenId + 1, { from: hacker });

            await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId + 1)
                .should.be.rejected;
        });

        it("화이트 리스트가 아닌 NFT로 대출을 신청함", async () => {
            const {
                lendingContract,
                nftContract,
                owner,
                hacker,
                stableContract,
                notWhiteListContract,
            } = await prerequisite(accounts);

            await notWhiteListContract.mint(owner, tokenId);
            await notWhiteListContract.approve(lendingContract.address, tokenId);
            await lendingContract.stakeAndBorrow(loanAmount, notWhiteListContract.address, tokenId)
                .should.be.rejected;
        });
        it("KIP17이 아닌 Contract로 대출을 신청함", async () => {
            const {
                lendingContract,
                nftContract,
                owner,
                hacker,
                stableContract,
                notWhiteListContract,
            } = await prerequisite(accounts);

            await lendingContract.stakeAndBorrow(loanAmount, stableContract.address, tokenId).should
                .be.rejected;
        });
        it("발행되지않은 NFT token으로 대출을 신청함", async () => {
            const {
                lendingContract,
                nftContract,
                owner,
                hacker,
                stableContract,
                notWhiteListContract,
            } = await prerequisite(accounts);

            await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId).should.be
                .rejected;
        });
        it("Lending컨트렉트 소유 stable토큰 잔액이 부족함 ", async () => {
            const { lendingContract, nftContract, owner, stableContract, notWhiteListContract } =
                await prerequisite(accounts);

            await lendingContract.stakeAndBorrow(9999, nftContract.address, tokenId).should.be
                .rejected;
        });

        it("NFT로 빌릴 수 있는 한도보다 높게 대출을 신청함", async () => {
            const {
                lendingContract,
                nftContract,
                owner,
                hacker,
                stableContract,
                notWhiteListContract,
                dataHolderContract,
            } = await prerequisite(accounts);
            const overflowPrice = new BigNumber(401).times(new BigNumber(10 ** 18));
            const nftKlayPrice = new BigNumber(500).times(new BigNumber(10 ** 18));
            const klayExchangeRate = new BigNumber(1).times(new BigNumber(10 ** 18));
            await dataHolderContract.setFloorPrice(
                nftContract.address,
                nftKlayPrice,
                klayExchangeRate
            );

            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);
            await lendingContract.stakeAndBorrow(overflowPrice, nftContract.address, tokenId).should
                .be.rejected;
        });
    });
});

contract("2. 청산", async (accounts) => {
    const amount = new BigNumber(100).times(new BigNumber(10 ** 18));
    const tokenId = 0;
    let nftContract;
    let lendingContract;
    let owner;
    let hacker;
    let stableContract;
    let notWhiteListContract;
    let dataHolderContract;

    beforeEach(async () => {
        ({
            lendingContract,
            nftContract,
            owner,
            hacker,
            stableContract,
            notWhiteListContract,
            dataHolderContract,
        } = await prerequisite(accounts));
        await nftContract.mint(owner, tokenId);
        await nftContract.approve(lendingContract.address, tokenId);
        await lendingContract.stakeAndBorrow(amount, nftContract.address, tokenId);
    });

    describe("로직 검증", async () => {
        it("청산이 실행되면 해당 NFT를 반환할 권리를 박탈함", async () => {
            await lendingContract.liquidate(owner, nftContract.address, tokenId);
            const isLiquidated = await lendingContract.isLiquidated(nftContract.address, tokenId);
            console.log(isLiquidated);
            assert.equal(isLiquidated, true);
        });

        it("데이터를 sync했을 때, 청산 조건에 부합하는 nft들은 청산됨", async () => {
            const liquidatePrice = new BigNumber(880).times(new BigNumber(10 ** 18));
            const nftKlayPrice = new BigNumber(1000).times(new BigNumber(10 ** 18));
            const klayExchangeRate = new BigNumber(1).times(new BigNumber(10 ** 18));
            const loanAmount = new BigNumber(800).times(new BigNumber(10 ** 18));
            await nftContract.mint(owner, tokenId + 1);
            await nftContract.approve(lendingContract.address, tokenId + 1);

            await dataHolderContract.setFloorPrice(
                nftContract.address,
                nftKlayPrice,
                klayExchangeRate
            ); //(800/1000) = 80%

            await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId + 1);

            await dataHolderContract.setFloorPrice(
                nftContract.address,
                liquidatePrice,
                klayExchangeRate
            ); //(800/880) = 90.9%

            await lendingContract.sync();

            const isToken1Liquidated = await lendingContract.isLiquidated(
                nftContract.address,
                tokenId
            );
            const isToken2Liquidated = await lendingContract.isLiquidated(
                nftContract.address,
                tokenId + 1
            );

            assert.equal(isToken1Liquidated, false);
            assert.equal(isToken2Liquidated, true);
        });

        it.skip("청산이 실행되면 해당 NFT를 청산 관리 Contract로 전송함", async () => {});
    });

    describe("예외처리 검증", async () => {
        it("예치되지 않은 NFT Collection에 대해 청산을 요청함", async () => {
            await notWhiteListContract.mint(owner, tokenId);
            await lendingContract.liquidate(notWhiteListContract.address, tokenId).should.be
                .rejected;
        });
        it("예치되지 않은 NFT token에 대해 청산을 요청함", async () => {
            await nftContract.mint(owner, tokenId + 1);
            await lendingContract.liquidate(nftContract.address, tokenId + 1).should.be.rejected;
        });
        it("관리자 Account 이외에 Account가 청산을 요청함", async () => {
            await lendingContract.liquidate(nftContract.address, tokenId, { from: hacker }).should
                .be.rejected;
        });
    });
});

contract("3. 상환", async (accounts) => {
    let nftContract;
    let lendingContract;
    let owner;
    let hacker;
    let stableContract;
    let notWhiteListContract;
    const tokenId = 0;
    const loanAmount = new BigNumber(100).times(new BigNumber(10 ** 18));
    const repayAmount = new BigNumber(99).times(new BigNumber(10 ** 18));

    beforeEach(async () => {
        ({ lendingContract, nftContract, owner, hacker, stableContract, notWhiteListContract } =
            await prerequisite(accounts));
        await nftContract.mint(owner, tokenId);
        await nftContract.approve(lendingContract.address, tokenId);
        await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId);
    });

    describe("로직 검증", async () => {
        it("대출금을 전부 상환하면, NFT의 소유권을 가져옴", async () => {
            await stableContract.approve(lendingContract.address, loanAmount);
            await lendingContract.repay(loanAmount, nftContract.address, tokenId);
            assert.equal(await nftContract.ownerOf(tokenId), owner);
        });

        it("대출금을 일부만 상환하면, 프로토콜이 NFT를 소유함", async () => {
            await stableContract.approve(lendingContract.address, repayAmount);
            await lendingContract.repay(repayAmount, nftContract.address, tokenId);
            assert.equal(await nftContract.ownerOf(tokenId), lendingContract.address);
        });

        it("대출금을 상환하면, 상환한 갯수만큼 소유 토큰 갯수가 줄어야함", async () => {
            await stableContract.mint(owner, new BigNumber(1000).times(new BigNumber(10 ** 18)));
            const beforeBalance = await stableContract.balanceOf(owner);
            await stableContract.approve(lendingContract.address, repayAmount);
            await lendingContract.repay(repayAmount, nftContract.address, tokenId);
            const afterBalance = await stableContract.balanceOf(owner);
            assert.equal(beforeBalance - repayAmount, afterBalance);
        });

        it.skip("대출금을 상환하면, 원리금에 이자가 반영되어야함", async () => {});
    });

    describe("예외처리 검증", async () => {
        it("상환액이 0이하만큼 상환함", async () => {
            await lendingContract.repay(-100, nftContract.address, tokenId).should.be.rejected;
        });

        it("NFT를 예치한 사용자가 아닌, 다른 사용자가 상환함", async () => {
            await lendingContract.repay(loanAmount, nftContract.address, tokenId, {
                from: hacker,
            }).should.be.rejected;
        });

        it("이미 청산된 NFT에 대해서 상환함", async () => {
            await nftContract.mint(owner, tokenId + 1);
            await nftContract.approve(lendingContract.address, tokenId + 1);
            await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId + 1);

            await lendingContract.liquidate(owner, nftContract.address, tokenId + 1);

            await lendingContract.repay(loanAmount, nftContract.address, tokenId + 1).should.be
                .rejected;
        });
    });
});

contract("이율 부과", async (accounts) => {
    describe("로직 검증", async () => {
        it.skip("빌린 시점으로부터 지금까지 부과된 이자가 연이율 대비 초당 이율 * 빌린 시간의 값과 동일해야함", async () => {});
        it.skip("", async () => {});
    });
    describe("예외처리 검증", async () => {
        it.skip("이미 청산된 NFT는 이율을 부과하지 않는다.", async () => {});
        it.skip("", async () => {});
    });
});
