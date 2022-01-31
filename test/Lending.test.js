const { NftContractDetail } = require("caver-js-ext-kas/src/rest-client")

const Lending = artifacts.require("./contract/Lending.sol")
const KIP17Token = artifacts.require("./node_modules/@klaytn/contracts/token/KIP17/KIP17Token.sol")

contract("Lending", async (accounts) => {
    var lendingContract
    var nftContract
    var owner = accounts[0]
    var fakeOwner = accounts[1]

    before(async () => {
        lendingContract = await Lending.new()
        nftContract = await KIP17Token.new("TestToken", "TEST")

        await nftContract.mint(owner, 0)
        await nftContract.mint(owner, 1)
    })

    it("NFT 민팅이 제대로 되었는 지 확인", async () => {
        const balance = await nftContract.balanceOf(owner)
        assert.equal(balance, 2)
    })

    it("소유하고 있는 NFT 예치 후, 소유권이 이전되었는 지 확인", async () => {
        const tokenId = 1
        const amount = 100
        await nftContract.approve(lendingContract.address, tokenId)
        await lendingContract.stakeAndBorrow(tokenId, nftContract.address, amount)
        assert.equal(await nftContract.ownerOf(tokenId), lendingContract.address)
    })
})