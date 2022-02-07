const { NftContractDetail } = require("caver-js-ext-kas/src/rest-client");
const { assert } = require("chai");

const Lending = artifacts.require("./contract/Lending.sol");
const KIP7Token = artifacts.require("./node_modules/@klaytn/contracts/token/KIP7/KIP7Token.sol");
const KIP17Token = artifacts.require("./node_modules/@klaytn/contracts/token/KIP17/KIP17Token.sol");

require("chai").use(require("chai-as-promised")).should();

const prerequisite = async (accounts) => {
    let nftContract = await KIP17Token.new("WhiteListed", "WL");
    let notWhiteListContract = await KIP17Token.new("NotWhiteListed", "NWL");
    let stableContract = await KIP7Token.new("StableToken", "Stable", 18, 1000);

    let lendingContract = await Lending.new([nftContract.address], stableContract.address);
    let owner = accounts[0];

    /* jjgob_20220207 start */
    //@@Lending.sol에서 대출금액 만큼 그때그때 stable토큰을 발행하고 싶을때
    // stableContract.addMinter(lendingContract.address);
    /* jjgob_20220207 end   */

    return { lendingContract, nftContract, owner, stableContract, notWhiteListContract };
};

contract("1. 대출", async (accounts) => {
    const tokenId = 0;
    const loanAmount = 100;

    /* jjgob_20220207 start */
    describe("로직 검증", async () => {
        it("프로토콜에게 NFT의 소유권이 이전됨", async () => {
            const { lendingContract, nftContract, owner, stableContract } = await prerequisite(
                accounts
            );
            //테스트를 위해 lendingContract.address한테 stable토큰 1000개를 발행해준다.
            await stableContract.mint(lendingContract.address, 1000);
            //테스트를 위해 owner한테 nft 1개를 발행해준다.
            await nftContract.mint(owner, tokenId);

            //lendingContract.stakeAndBorrow에서의 nft 소유권 이전을 위해 approve
            await nftContract.approve(lendingContract.address, tokenId);

            //address 확인
            console.log("## owner           address : " + owner);
            console.log("## lendingContract address : " + lendingContract.address);
            //대출 실행 전 : nft의 소유자 확인 : owner
            const beforeNftOwner = await await nftContract.ownerOf(tokenId);
            console.log("## beforeNftOwner : " + beforeNftOwner);

            //대출 실행 : lendingContract.stakeAndBorrow 기능 검증이 목적
            await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId);

            //대출 실행 후 : nft의 소유자 확인 : nftContract.address
            const afterNftOwner = await await nftContract.ownerOf(tokenId);
            console.log("## afterNftOwner  : " + afterNftOwner);

            //nft소유권이 owner에서 lendingContract.address로 이전 되었는지 검증
            assert.equal(await nftContract.ownerOf(tokenId), lendingContract.address);
        });

        it("대출자에게 요청한 만큼의 토큰이 전송됨", async () => {
            const { lendingContract, nftContract, owner, stableContract } = await prerequisite(
                accounts
            );
            //테스트를 위해 lendingContract.address한테 stable토큰 1000개를 발행해준다.
            await stableContract.mint(lendingContract.address, 1000);
            //테스트를 위해 owner한테 nft 1개를 발행해준다.
            await nftContract.mint(owner, tokenId);

            //lendingContract.stakeAndBorrow에서의 nft 소유권 이전을 위해 approve
            await nftContract.approve(lendingContract.address, tokenId);

            //대출 실행 전 : owner가 소유한 stable토큰의 잔액 확인
            const beforeBalanceOfOwner = await stableContract.balanceOf(owner);
            console.log("## beforeBalanceOfOwner   : " + beforeBalanceOfOwner);
            //대출 실행 전 : lendingContract.address가 소유한 stable토큰의 잔액 확인
            const beforeBalanceOfLending = await stableContract.balanceOf(lendingContract.address);
            console.log("## beforeBalanceOfLending : " + beforeBalanceOfLending);

            //대출 실행 : lendingContract.stakeAndBorrow 기능 검증이 목적
            await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId);

            //대출 실행 후 : owner가 소유한 stable토큰의 잔액 확인
            const afterBalanceOfOwner = await stableContract.balanceOf(owner);
            console.log("## afterBalanceOfOwner    : " + afterBalanceOfOwner);
            //대출 실행 후 : lendingContract.address가 소유한 stable토큰의 잔액 확인
            const afterBalanceOfLending = await stableContract.balanceOf(lendingContract.address);
            console.log("## afterBalanceOfLending  : " + afterBalanceOfLending);

            //stable토큰이 대출금액만큼 owner한테 전송되었는지 검증
            //owner의 대출 후 잔액 - owner의 대출 후 잔액 == loanAmount 인지 검증(loanAmount만큼 잔액이 늘어남)
            assert.equal(afterBalanceOfOwner - beforeBalanceOfOwner, loanAmount);
            //lendingContract.address의 대출 후 잔액 - lendingContract.address의 대출 후 잔액 == loanAmount 인지 검증(loanAmount만큼 잔액이 줄어듬)
            // assert.equal(beforeBalanceOfLending - afterBalanceOfLending, loanAmount);
        });
    });
    /* jjgob_20220207 end   */

    // describe("예외처리 검증", async () => {
    //     it("대출을 신청한 NFT의 소유권을 가지고 있지않음", async () => {
    //         const { lendingContract, nftContract, owner } = await prerequisite(accounts);
    //         await nftContract.mint(owner, tokenId);
    //         await nftContract.approve(lendingContract.address, tokenId);

    //         await nftContract.mint(accounts[1], tokenId + 1, { from: accounts[1] });
    //         await nftContract.approve(lendingContract.address, tokenId + 1, { from: accounts[1] });

    //         await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId + 1)
    //             .should.be.rejected;
    //     });

    //     it("화이트 리스트가 아닌 NFT로 대출을 신청함", async () => {
    //         const { lendingContract, nftContract, owner, stableContract, notWhiteListContract } =
    //             await prerequisite(accounts);

    //         await notWhiteListContract.mint(owner, tokenId);
    //         await notWhiteListContract.approve(lendingContract.address, tokenId);
    //         await lendingContract.stakeAndBorrow(loanAmount, notWhiteListContract.address, tokenId)
    //             .should.be.rejected;
    //     });
    //     it("KIP17이 아닌 Contract로 대출을 신청함", async () => {
    //         const { lendingContract, nftContract, owner, stableContract, notWhiteListContract } =
    //             await prerequisite(accounts);

    //         await lendingContract.stakeAndBorrow(loanAmount, stableContract.address, tokenId).should
    //             .be.rejected;
    //     });
    //     it("발행되지않은 NFT token으로 대출을 신청함", async () => {
    //         const { lendingContract, nftContract, owner, stableContract, notWhiteListContract } =
    //             await prerequisite(accounts);

    //         await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId).should.be
    //             .rejected;
    //     });

    //     it.skip("NFT로 빌릴 수 있는 한도보다 높게 대출을 신청함", async () => {});
    // });
});

contract("2. 청산", async (accounts) => {
    const amount = 100;
    const tokenId = 0;
    let nftContract;
    let lendingContract;
    let owner;
    let stableContract;
    let notWhiteListContract;

    beforeEach(async () => {
        ({ lendingContract, nftContract, owner, stableContract, notWhiteListContract } =
            await prerequisite(accounts));
        await nftContract.mint(owner, tokenId);
        await nftContract.approve(lendingContract.address, tokenId);
        await lendingContract.stakeAndBorrow(amount, nftContract.address, tokenId);
    });

    describe("로직 검증", async () => {
        it("청산이 실행되면 해당 NFT를 반환할 권리를 박탈함", async () => {
            await lendingContract.liquidate(nftContract.address, tokenId);
            const lendingStatus = await lendingContract.stakedNft(
                owner,
                nftContract.address,
                tokenId
            );

            console.log(lendingStatus);

            assert.equal(await lendingStatus.hasOwnership, false);
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
        it.skip("관리자 Account 이외에 Account가 청산을 요청함", async () => {});
    });
});

contract("3. 상환", async (accounts) => {
    let nftContract;
    let lendingContract;
    let owner;
    let stableContract;
    let notWhiteListContract;
    const tokenId = 0;
    const loanAmount = 100;
    const repayAmount = 99;

    beforeEach(async () => {
        ({ lendingContract, nftContract, owner, stableContract, notWhiteListContract } =
            await prerequisite(accounts));
        await nftContract.mint(owner, tokenId);
        await nftContract.approve(lendingContract.address, tokenId);
        await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId);
    });

    describe("로직 검증", async () => {
        it("대출금을 전부 상환하면, NFT의 소유권을 가져옴", async () => {
            await lendingContract.repay(loanAmount, nftContract.address, tokenId);
            assert.equal(await nftContract.ownerOf(tokenId), owner);
        });

        it("대출금을 일부만 상환하면, 프로토콜이 NFT를 소유함", async () => {
            await lendingContract.repay(repayAmount, nftContract.address, tokenId);
            assert.equal(await nftContract.ownerOf(tokenId), lendingContract.address);
        });

        it("대출금을 상환하면, 상환한 갯수만큼 소유 토큰 갯수가 줄어야함", async () => {
            await stableContract.mint(owner, 1000);
            const beforeBalance = await stableContract.balanceOf(owner);

            await lendingContract.repay(repayAmount, nftContract.address, tokenId);
            const afterBalance = await stableContract.balanceOf(owner);
            assert.equal(beforeBalance - repayAmount, afterBalance);
        });
    });

    describe("예외처리 검증", async () => {
        it("상환액이 0이하만큼 상환함", async () => {
            await lendingContract.repay(-100, nftContract.address, tokenId).should.be.rejected;
        });

        it("NFT를 예치한 사용자가 아닌, 다른 사용자가 상환함", async () => {
            await lendingContract.repay(loanAmount, nftContract.address, tokenId, {
                from: accounts[1],
            }).should.be.rejected;
        });

        it("이미 청산된 NFT에 대해서 상환함", async () => {
            await nftContract.mint(owner, tokenId + 1);
            await nftContract.approve(lendingContract.address, tokenId + 1);
            await lendingContract.stakeAndBorrow(loanAmount, nftContract.address, tokenId + 1);

            await lendingContract.liquidate(nftContract.address, tokenId + 1);

            await lendingContract.repay(loanAmount, nftContract.address, tokenId + 1).should.be
                .rejected;
        });
    });
});
