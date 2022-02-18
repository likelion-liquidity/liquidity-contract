const { assert } = require("chai");
const BigNumber = require("bignumber.js");

require("chai").use(require("chai-as-promised")).should();

const DataHolder = artifacts.require("./contract/DataHolder.sol");
const KIP7Token = artifacts.require("./node_modules/@klaytn/contracts/token/KIP7/KIP7Token.sol");
const KIP17Token = artifacts.require("./node_modules/@klaytn/contracts/token/KIP17/KIP17Token.sol");

require("chai").use(require("chai-as-promised")).should();

const prerequisite = async (accounts) => {
    let creator = accounts[0];
    let owner = accounts[1];
    let hacker = accounts[2];

    let dataHolderContract = await DataHolder.new();
    let nftContract = await KIP17Token.new("WhiteListed", "WL");
    let notWhiteListContract = await KIP17Token.new("NotWhiteListed", "NWL");

    return { dataHolderContract, nftContract, creator, owner, hacker, notWhiteListContract };
};
contract("화이트 리스트 추가", async (accounts) => {
    const tokenId = 0;
    const ltv = 0;

    describe("로직 검증", async () => {
        it("화이트리스트를 추가하면, 화이트리스트가 등록되어야함", async () => {
            const { dataHolderContract, nftContract, creator, owner, hacker } = await prerequisite(
                accounts
            );
            await nftContract.mint(owner, tokenId);
            await dataHolderContract.addWhiteList(nftContract.address, ltv);
            const isWhiteList = await dataHolderContract.isWhiteList(nftContract.address, {
                from: creator,
            });
            assert.equal(isWhiteList, true);
        });
    });

    describe("예외처리 검증", async () => {
        it("LTV는 100을 넘을 수 없다.", async () => {
            const { dataHolderContract, nftContract, creator, owner, hacker } = await prerequisite(
                accounts
            );
            await nftContract.mint(owner, tokenId);
            await dataHolderContract.addWhiteList(nftContract.address, 101).should.be.rejected;
        });
        it("LTV는 0보다 낮아질 수 없다.", async () => {
            const { dataHolderContract, nftContract, creator, owner, hacker } = await prerequisite(
                accounts
            );
            await nftContract.mint(owner, tokenId);
            await dataHolderContract.addWhiteList(nftContract.address, -1).should.be.rejected;
        });

        it("이미 화이트리스트에 추가된 NFT Collection은 다시 추가할 수 없다.", async () => {
            const { dataHolderContract, nftContract, creator, owner, hacker } = await prerequisite(
                accounts
            );
            await nftContract.mint(owner, tokenId);
            await dataHolderContract.addWhiteList(nftContract.address, ltv);
            await dataHolderContract.addWhiteList(nftContract.address, ltv).should.be.rejected;
        });

        it("owner가 아닌 계정으로 호출함", async () => {
            const { dataHolderContract, nftContract, creator, owner, hacker } = await prerequisite(
                accounts
            );
            await nftContract.mint(owner, tokenId);
            await dataHolderContract.addWhiteList(nftContract.address, { from: hacker }).should.be
                .rejected;
        });
    });
});

contract("화이트 리스트 삭제", async (accounts) => {
    const tokenId = 0;
    const ltv = 80;
    let dataHolderContract;
    let nftContract;
    let creatror;
    let owner;
    let hacker;

    beforeEach(async () => {
        ({ dataHolderContract, nftContract, creator, owner, hacker } = await prerequisite(
            accounts
        ));
        await nftContract.mint(owner, tokenId);
        await dataHolderContract.addWhiteList(nftContract.address, 80);
    });
    describe("로직 검증", async () => {
        it("화이트리스트를 삭제하면, 화이트리스트에서 삭제되어야함", async () => {
            await dataHolderContract.removeWhiteList(nftContract.address);
            const isWhiteList = await dataHolderContract.isWhiteList(nftContract.address);
            assert.equal(isWhiteList, false);
        });
    });
    describe("예외처리 검증", async () => {
        it("화이트리스트에 등록되지않은 NFT COLLECTION은 삭제할 수 없다.", async () => {
            await dataHolderContract.removeWhiteList(nftContract.address);
            await dataHolderContract.removeWhiteList(nftContract.address).should.be.rejected;
        });

        it("owner가 아닌 계정으로 호출함", async () => {
            await dataHolderContract.removeWhiteList(nftContract.address, {
                from: hacker,
            }).should.be.rejected;
        });
    });
});

contract("바닥가 갱신", async (accounts) => {
    const tokenId = 0;
    const nftKlayPrice = new BigNumber(100).times(new BigNumber(10 ** 18));
    const klayExchangeRate = new BigNumber(1.245).times(new BigNumber(10 ** 18));
    const ltv = 80;
    let dataHolderContract;
    let nftContract;
    let notWhiteListContract;
    let creatror;
    let owner;
    let hacker;

    beforeEach(async () => {
        ({ dataHolderContract, nftContract, creator, owner, hacker, notWhiteListContract } =
            await prerequisite(accounts));
        await nftContract.mint(owner, tokenId);
        await dataHolderContract.addWhiteList(nftContract.address, ltv);
    });

    describe("로직 검증", async () => {
        it("바닥가를 갱신하면, 해당 nft의 바닥가가 변경되어야함", async () => {
            await dataHolderContract.setFloorPrice(
                nftContract.address,
                nftKlayPrice,
                klayExchangeRate
            );
            const expectedfloorPrice = await dataHolderContract.getFloorPrice(nftContract.address);

            const floorPrice = nftKlayPrice
                .times(klayExchangeRate)
                .div(new BigNumber(10 ** 18))
                .toString();
            assert.equal(
                nftKlayPrice
                    .times(klayExchangeRate)
                    .div(new BigNumber(10 ** 18))
                    .toString(),
                expectedfloorPrice.toString()
            );
        });

        it("바닥가를 갱신하면, 해당 nft로 빌릴 수 있는 금액도 변경되어야함", async () => {
            await dataHolderContract.setFloorPrice(
                nftContract.address,
                nftKlayPrice,
                klayExchangeRate
            );
            const availableLoanAmount = await dataHolderContract.getAvailableLoanAmount(
                nftContract.address
            );
            const floorPrice = await dataHolderContract.getFloorPrice(nftContract.address);
            assert.equal(
                new BigNumber(floorPrice).times(ltv).div(100).toString(),
                availableLoanAmount.toString()
            );
        });

        it("바닥가를 갱신하면, 해당 NFT의 KLAY가격이 변경되어야함", async () => {
            await dataHolderContract.setFloorPrice(
                nftContract.address,
                nftKlayPrice,
                klayExchangeRate
            );
            const expectedKlayPrice = await dataHolderContract.getNftKlayPrice(nftContract.address);
            assert.equal(nftKlayPrice.toString(), expectedKlayPrice.toString());
        });
    });
    describe("예외처리 검증", async () => {
        it("화이트리스트가 아닌 NFT Collection은 바닥가를 변경할 수 없음", async () => {
            await dataHolderContract.setFloorPrice(
                notWhiteListContract.address,
                nftKlayPrice,
                klayExchangeRate
            ).should.be.rejected;
        });
        it("owner가 아닌 계정으로 호출함", async () => {
            await dataHolderContract.setFloorPrice(
                nftContract.address,
                nftKlayPrice,
                klayExchangeRate,
                {
                    from: hacker,
                }
            ).should.be.rejected;
        });
    });
});

contract("LTV", async (accounts) => {
    const ltv = 80;
    const tokenId = 0;
    let dataHolderContract;
    let nftContract;
    let notWhiteListContract;
    let creator;
    let owner;
    let hacker;

    beforeEach(async () => {
        ({ dataHolderContract, nftContract, creator, owner, hacker, notWhiteListContract } =
            await prerequisite(accounts));
        await nftContract.mint(owner, tokenId);
    });
    describe("로직 검증", async () => {
        it("LTV를 변경하면, LTV가 변경되어야한다.", async () => {
            await dataHolderContract.addWhiteList(nftContract.address, ltv);
            await dataHolderContract.setLTV(nftContract.address, ltv + 10);
            const expectedLtv = await dataHolderContract.getLTV(nftContract.address);
            assert.equal(ltv + 10, expectedLtv);
        });
    });
    describe("예외처리 검증", async () => {
        it("LTV는 100을 넘을 수 없다.", async () => {
            await dataHolderContract.addWhiteList(nftContract.address, ltv);
            await dataHolderContract.setLTV(nftContract.address, 101).should.be.rejected;
        });
        it("LTV는 0보다 낮아질 수 없다.", async () => {
            await dataHolderContract.addWhiteList(nftContract.address, ltv);
            await dataHolderContract.setLTV(nftContract.address, -1).should.be.rejected;
        });
        it("화이트리스트가 아닌 NFT Collection에 LTV를 변경할 수 없다.", async () => {
            await dataHolderContract.setLTV(notWhiteListContract.address, ltv).should.be.rejected;
        });
        it("owner가 아닌 계정으로 호출함", async () => {
            await dataHolderContract.addWhiteList(nftContract.address, ltv);
            await dataHolderContract.setLTV(ltv + 10, { from: hacker }).should.be.rejected;
        });
    });
});
