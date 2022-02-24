const { assert } = require("chai");

const Lending = artifacts.require("./contract/Lending.sol");
const KIP7Token = artifacts.require("./node_modules/@klaytn/contracts/token/KIP7/KIP7Token.sol");
const KIP17Token = artifacts.require("./node_modules/@klaytn/contracts/token/KIP17/KIP17Token.sol");
const DataHolder = artifacts.require("./contract/DataHolder.sol");

require("chai").use(require("chai-as-promised")).should();
const { encode, decode } = require("./utils/bn.js");

const prerequisite = async (accounts) => {
    const nftKlayPrice = 500;
    const klayExchangeRate = 1;
    const maxLtv = 80;
    const liqLtv = 90;

    let nftContract = await KIP17Token.new("WhiteListed", "WL");
    let notWhiteListContract = await KIP17Token.new("NotWhiteListed", "NWL");
    let stableContract = await KIP7Token.new("StableToken", "Stable", 18, encode(1000));

    let dataHolderContract = await DataHolder.new();
    await dataHolderContract.addWhiteList(nftContract.address, encode(maxLtv), encode(liqLtv));
    await dataHolderContract.setFloorPrice(
        nftContract.address,
        encode(nftKlayPrice),
        encode(klayExchangeRate)
    );

    let lendingContract = await Lending.new(dataHolderContract.address, stableContract.address);
    let owner = accounts[0];
    let hacker = accounts[1];

    await stableContract.mint(lendingContract.address, encode(1000));

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

contract("예치", async (accounts) => {
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
    });

    describe("로직 검증", async () => {
        it("프로토콜에게 NFT의 소유권이 이전됨", async () => {
            await lendingContract.stake(nftContract.address, tokenId);
            assert.equal(await nftContract.ownerOf(tokenId), lendingContract.address);
        });

        it("예치를 실시하면, 예치한 사용자 리스트에 포함되어야한다.", async () => {
            await lendingContract.stake(nftContract.address, tokenId);
            const userList = await lendingContract.getUserList();
            const isStaker = userList.includes(owner);
            assert.equal(isStaker, true);
        });
    });

    describe("예외처리 검증", async () => {
        it("대출을 신청한 NFT의 소유권을 가지고 있지않음", async () => {
            await nftContract.mint(hacker, tokenId + 1);
            await nftContract.approve(lendingContract.address, tokenId + 1, { from: hacker });

            await lendingContract.stake(nftContract.address, tokenId + 1).should.be.rejected;
        });
        it("화이트 리스트가 아닌 NFT를 예치함", async () => {
            await notWhiteListContract.mint(owner, tokenId);
            await lendingContract.stake(notWhiteListContract.address, tokenId).should.be.rejected;
        });
        it("KIP17이 아닌 Contract를 예치함", async () => {
            await lendingContract.stake(stableContract.address, tokenId).should.be.rejected;
        });
        it("발행되지않은 NFT token으로 예치함", async () => {
            await lendingContract.stake(nftContract.address, tokenId + 1).should.be.rejected;
        });
    });
});

contract("대출", async (accounts) => {
    const tokenId = 0;
    const loanAmount = 100;

    describe("로직 검증", async () => {
        it("대출자에게 요청한 만큼의 토큰이 전송됨", async () => {
            const { lendingContract, nftContract, owner, hacker, stableContract } =
                await prerequisite(accounts);

            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);

            const beforeBalanceOfOwner = decode(await stableContract.balanceOf(owner));

            await lendingContract.stake(nftContract.address, tokenId);
            await lendingContract.borrow(encode(loanAmount), nftContract.address, tokenId);

            const afterBalanceOfOwner = decode(await stableContract.balanceOf(owner));

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

            const overflowPrice = 800;
            const nftKlayPrice = 1000;
            const klayExchangeRate = 1;

            await dataHolderContract.setFloorPrice(
                nftContract.address,
                encode(nftKlayPrice),
                encode(klayExchangeRate)
            );

            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);

            await lendingContract.stake(nftContract.address, tokenId);
            await lendingContract.borrow(encode(overflowPrice), nftContract.address, tokenId).should
                .be.fulfilled;
        });

        it("현재 대출 가능한 한도 이상으로 대출함", async () => {
            const {
                lendingContract,
                nftContract,
                owner,
                hacker,
                stableContract,
                notWhiteListContract,
                dataHolderContract,
            } = await prerequisite(accounts);

            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);

            const loanAmount = 500;
            const nftKlayPrice = 1000;
            const klayExchangeRate = 1;

            await dataHolderContract.setFloorPrice(
                nftContract.address,
                encode(nftKlayPrice),
                encode(klayExchangeRate)
            );

            await lendingContract.stake(nftContract.address, tokenId);
            await lendingContract.borrow(encode(loanAmount), nftContract.address, tokenId);

            const stakedNftList = await lendingContract.getStakedNftList(
                owner,
                nftContract.address
            );

            await lendingContract.borrow(encode(loanAmount), nftContract.address, tokenId).should.be
                .rejected;
        });

        it("대출을 실행하면, 해당 대출금이 정확히 기록되어야함", async () => {
            const {
                lendingContract,
                nftContract,
                owner,
                hacker,
                stableContract,
                notWhiteListContract,
                dataHolderContract,
            } = await prerequisite(accounts);

            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);

            const loanAmount = 300;
            const nftKlayPrice = 1000;
            const klayExchangeRate = 1;

            await dataHolderContract.setFloorPrice(
                nftContract.address,
                encode(nftKlayPrice),
                encode(klayExchangeRate)
            );

            await lendingContract.stake(nftContract.address, tokenId);
            await lendingContract.borrow(encode(loanAmount), nftContract.address, tokenId);

            const stakedNftList = await lendingContract.getStakedNftList(
                owner,
                nftContract.address
            );

            console.log(stakedNftList[0]);

            // awa;
            // await lendingContract.borrow(encode(loanAmount), nftContract.address, tokenId).should.be
            //     .rejected;
        });
    });

    describe("예외처리 검증", async () => {
        it("대출을 신청한 NFT가 예치되어있지 않음", async () => {
            const { lendingContract, nftContract, owner, hacker } = await prerequisite(accounts);
            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);

            await lendingContract.borrow(loanAmount, nftContract.address, tokenId).should.be
                .rejected;
        });

        it("대출을 신청한 NFT가 자신의 것이 아님", async () => {
            const {
                lendingContract,
                nftContract,
                owner,
                hacker,
                stableContract,
                notWhiteListContract,
            } = await prerequisite(accounts);

            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);

            await lendingContract.stake(nftContract.address, tokenId);
            await lendingContract.borrow(loanAmount, nftContract.address, tokenId, { from: hacker })
                .should.be.rejected;
        });

        it("Lending컨트렉트 소유 stable토큰 잔액이 부족함 ", async () => {
            const { lendingContract, nftContract, owner, stableContract, notWhiteListContract } =
                await prerequisite(accounts);

            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);
            await lendingContract.stake(nftContract.address, tokenId);
            await lendingContract.borrow(encode(9999), nftContract.address, tokenId).should.be
                .rejected;
        });

        it("NFT로 MAX LTV보다 높게 대출을 신청함", async () => {
            const {
                lendingContract,
                nftContract,
                owner,
                hacker,
                stableContract,
                notWhiteListContract,
                dataHolderContract,
            } = await prerequisite(accounts);
            const overflowPrice = 401;
            const nftKlayPrice = 500;
            const klayExchangeRate = 1;

            await dataHolderContract.setFloorPrice(
                nftContract.address,
                encode(nftKlayPrice),
                encode(klayExchangeRate)
            );

            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);
            await lendingContract.stake(nftContract.address, tokenId);
            await lendingContract.borrow(encode(overflowPrice), nftContract.address, tokenId).should
                .be.rejected;
        });

        it("이미 청산된 NFT로는 대출을 신청할 수 없음", async () => {
            const {
                lendingContract,
                nftContract,
                owner,
                hacker,
                stableContract,
                notWhiteListContract,
                dataHolderContract,
            } = await prerequisite(accounts);

            const liquidatePrice = 880;
            const nftKlayPrice = 1000;
            const klayExchangeRate = 1;
            const loanAmount = 800;

            await dataHolderContract.setFloorPrice(
                nftContract.address,
                encode(nftKlayPrice),
                encode(klayExchangeRate)
            ); //(800/1000) = 80%

            await nftContract.mint(owner, tokenId);
            await nftContract.approve(lendingContract.address, tokenId);
            await lendingContract.stake(nftContract.address, tokenId);
            await lendingContract.borrow(encode(loanAmount), nftContract.address, tokenId);

            await dataHolderContract.setFloorPrice(
                nftContract.address,
                encode(liquidatePrice),
                encode(klayExchangeRate)
            ); //(800/880) = 90.9%

            await lendingContract.sync();

            await lendingContract.borrow(encode(loanAmount), nftContract.address, tokenId).should.be
                .rejected;
        });
    });
});

contract("청산", async (accounts) => {
    const amount = 100;
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
        await lendingContract.stake(nftContract.address, tokenId);
        await lendingContract.borrow(encode(amount), nftContract.address, tokenId);
    });

    describe("로직 검증", async () => {
        it("청산이 실행되면 해당 NFT를 반환할 권리를 박탈함", async () => {
            await lendingContract.liquidate(owner, nftContract.address, tokenId);
            const isLiquidated = await lendingContract.isLiquidated(nftContract.address, tokenId);
            console.log(isLiquidated);
            assert.equal(isLiquidated, true);
        });

        it("데이터를 sync했을 때, 청산 조건에 부합하는 nft들은 청산됨", async () => {
            const liquidatePrice = 880;
            const nftKlayPrice = 1000;
            const klayExchangeRate = 1;
            const loanAmount = 800;

            await nftContract.mint(owner, tokenId + 1);
            await nftContract.approve(lendingContract.address, tokenId + 1);

            await dataHolderContract.setFloorPrice(
                nftContract.address,
                encode(nftKlayPrice),
                encode(klayExchangeRate)
            ); //(800/1000) = 80%

            await lendingContract.stake(nftContract.address, tokenId + 1);
            await lendingContract.borrow(encode(loanAmount), nftContract.address, tokenId + 1);

            await dataHolderContract.setFloorPrice(
                nftContract.address,
                encode(liquidatePrice),
                encode(klayExchangeRate)
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

contract("상환", async (accounts) => {
    let nftContract;
    let lendingContract;
    let owner;
    let hacker;
    let stableContract;
    let notWhiteListContract;
    const tokenId = 0;
    const loanAmount = 100;
    const repayAmount = 99;

    beforeEach(async () => {
        ({ lendingContract, nftContract, owner, hacker, stableContract, notWhiteListContract } =
            await prerequisite(accounts));
        await nftContract.mint(owner, tokenId);
        await nftContract.approve(lendingContract.address, tokenId);
        await lendingContract.stake(nftContract.address, tokenId);
        await lendingContract.borrow(encode(loanAmount), nftContract.address, tokenId);
    });

    describe("로직 검증", async () => {
        it("대출금을 전부 상환하면, NFT의 소유권을 가져옴", async () => {
            await stableContract.approve(lendingContract.address, encode(loanAmount));
            await lendingContract.repay(encode(loanAmount), nftContract.address, tokenId);
            assert.equal(await nftContract.ownerOf(tokenId), owner);
        });

        it("대출금을 일부만 상환하면, 프로토콜이 NFT를 소유함", async () => {
            await stableContract.approve(lendingContract.address, encode(repayAmount));
            await lendingContract.repay(encode(repayAmount), nftContract.address, tokenId);
            assert.equal(await nftContract.ownerOf(tokenId), lendingContract.address);
        });

        it("대출금을 상환하면, 상환한 갯수만큼 소유 토큰 갯수가 줄어야함", async () => {
            await stableContract.mint(owner, encode(1000));
            const beforeBalance = decode(await stableContract.balanceOf(owner));
            await stableContract.approve(lendingContract.address, encode(repayAmount));
            await lendingContract.repay(encode(repayAmount), nftContract.address, tokenId);
            const afterBalance = decode(await stableContract.balanceOf(owner));
            assert.equal(beforeBalance - repayAmount, afterBalance);
        });
    });

    describe("예외처리 검증", async () => {
        it("상환액이 0이하만큼 상환함", async () => {
            await lendingContract.repay(encode(-100), nftContract.address, tokenId).should.be
                .rejected;
        });

        it("NFT를 예치한 사용자가 아닌, 다른 사용자가 상환함", async () => {
            await lendingContract.repay(encode(loanAmount), nftContract.address, tokenId, {
                from: hacker,
            }).should.be.rejected;
        });

        it("이미 청산된 NFT에 대해서 상환함", async () => {
            await nftContract.mint(owner, tokenId + 1);
            await nftContract.approve(lendingContract.address, tokenId + 1);
            await lendingContract.stake(nftContract.address, tokenId + 1);
            await lendingContract.borrow(encode(loanAmount), nftContract.address, tokenId + 1);

            await lendingContract.liquidate(owner, nftContract.address, tokenId + 1);

            await lendingContract.repay(encode(loanAmount), nftContract.address, tokenId + 1).should
                .be.rejected;
        });
    });
});
