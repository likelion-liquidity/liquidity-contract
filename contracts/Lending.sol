pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "@klaytn/contracts/token/KIP7/KIP7Token.sol";
import "@klaytn/contracts/token/KIP17/KIP17Token.sol";
import "./OpenZeppelin/Ownable.sol";
import "./DataHolder.sol";

contract Lending is Ownable {
    using SafeMath for uint256;
    uint256 UNIT = 1e18;

    //contract
    KIP17Token nft;
    KIP7Token stable;
    DataHolder dataHolder;

    address stableTokenAddress;
    address liquidationAccountAddress;
    address[] userList;

    struct NftLendingStatus {
        uint256 nftTokenId;
        bool hasOwnership; //예치자가 소유권을 가지고 있는 지 (청산 유무 플래그)
        uint256 loanAmount; //빌려간 금액
    }

    //variable
    //mapping(account => mapping(nftAddress => NftStatus))
    mapping(address => address[]) public stakedNftCollection;
    mapping(address => mapping(address => NftLendingStatus[])) public stakedNft;

    constructor(address _dataHolderAddress, address _stableTokenAddress)
        public
    {
        dataHolder = DataHolder(_dataHolderAddress);
        stableTokenAddress = _stableTokenAddress;
    }

    function isNftWhiteList(address nftAddress) private returns (bool) {
        return dataHolder.isWhiteList(nftAddress);
    }

    function getStakedNftList(address userAddress, address nftAddress)
        public
        view
        returns (NftLendingStatus[] memory)
    {
        NftLendingStatus[] memory lendingStatus = stakedNft[userAddress][
            nftAddress
        ];
        return lendingStatus;
    }

    function stake(address nftAddress, uint256 nftTokenId) public {
        require(isNftWhiteList(nftAddress) == true, "NFT isn't WL");

        nft = KIP17Token(nftAddress);
        require(nft.ownerOf(nftTokenId) == msg.sender, "NFT isn't yours");

        nft.safeTransferFrom(msg.sender, address(this), nftTokenId);
        stakedNft[msg.sender][nftAddress].push(
            NftLendingStatus(nftTokenId, true, 0)
        );

        userList.push(msg.sender);
    }

    function borrow(
        uint256 loanAmount,
        address nftAddress,
        uint256 nftTokenId
    ) public {
        NftLendingStatus memory lendingStatus = safeGetNftLendingStatus(
            msg.sender,
            nftAddress,
            nftTokenId
        );

        require(lendingStatus.hasOwnership == true, "Already Liquidated");

        require(
            dataHolder.getAvailableLoanAmount(nftAddress).sub(
                lendingStatus.loanAmount
            ) >= loanAmount,
            "too much loanAmount"
        );

        stable = KIP7Token(stableTokenAddress);
        require(
            stable.balanceOf(address(this)) >= loanAmount,
            "Balance isn't enough"
        );

        //대출 실행
        stable.approve(msg.sender, loanAmount);
        stable.safeTransfer(msg.sender, loanAmount);

        //소유자 및 청산 유무 플래그 기록
        uint256 index = getStakedNftIndex(msg.sender, nftAddress, nftTokenId);
        stakedNft[msg.sender][nftAddress][index].loanAmount = stakedNft[
            msg.sender
        ][nftAddress][index].loanAmount.add(loanAmount);
    }

    function sync() public onlyOwner {
        _liquidate();
    }

    function _liquidate() private onlyOwner {
        for (uint256 i = 0; i < userList.length; i++) {
            for (
                uint256 j = 0;
                j < dataHolder.getWhiteListNftList().length;
                j++
            ) {
                address userAddress = userList[i];
                address nftAddress = dataHolder.getWhiteListNftList()[j];
                DataHolder.NftData memory nftData = dataHolder.getNftData(
                    nftAddress
                );
                NftLendingStatus[] storage nftLendingStatus = stakedNft[
                    userAddress
                ][nftAddress];
                for (uint256 k = 0; k < nftLendingStatus.length; k++) {
                    if (nftLendingStatus[k].hasOwnership == true) {
                        uint256 currLtv = (
                            nftLendingStatus[k].loanAmount.div(
                                nftData.availableLoanAmount
                            )
                        ).mul(100).mul(UNIT);
                        if (currLtv >= nftData.liqLtv) {
                            liquidate(
                                userAddress,
                                nftAddress,
                                nftLendingStatus[k].nftTokenId
                            );
                        }
                    }
                }
            }
        }
    }

    function liquidate(
        address owner,
        address nftAddress,
        uint256 nftTokenId
    ) public onlyOwner {
        uint256 index = getStakedNftIndex(owner, nftAddress, nftTokenId);
        stakedNft[owner][nftAddress][index].hasOwnership = false;
    }

    function isLiquidated(address nftAddress, uint256 nftTokenId)
        public
        view
        returns (bool)
    {
        NftLendingStatus memory lendingStatus = safeGetNftLendingStatus(
            msg.sender,
            nftAddress,
            nftTokenId
        );
        return lendingStatus.hasOwnership == false;
    }

    function safeGetNftLendingStatus(
        address owner,
        address nftAddress,
        uint256 nftTokenId
    ) private view returns (NftLendingStatus memory) {
        require(owner == msg.sender, "Not owner");
        uint256 index = getStakedNftIndex(owner, nftAddress, nftTokenId);
        NftLendingStatus memory lendingStatus = stakedNft[owner][nftAddress][
            index
        ];

        if (
            lendingStatus.hasOwnership == false &&
            lendingStatus.loanAmount == 0 &&
            lendingStatus.nftTokenId == 0
        ) {
            revert("Not Nft staked");
        }

        return lendingStatus;
    }

    function repay(
        uint256 repayAmount,
        address nftAddress,
        uint256 nftTokenId
    ) public {
        NftLendingStatus[] storage lendingStatusList = stakedNft[msg.sender][
            nftAddress
        ];

        bool isOwner = false;
        uint256 index = 0;
        for (uint256 i = 0; i < lendingStatusList.length; i++) {
            if (lendingStatusList[i].nftTokenId == nftTokenId) {
                isOwner = true;
                index = i;
                break;
            }
        }

        NftLendingStatus storage lendingStatus = lendingStatusList[index];

        //NFT의 소유자가 아님
        require(isOwner == true, "Not owner");

        //청산되지않은 NFT만 상환가능
        require(lendingStatus.hasOwnership == true, "Already Liquidated");
        //amount는 빌린 금액보다 작을 수 없음
        require(
            repayAmount > 0 && repayAmount <= lendingStatus.loanAmount,
            "Check Amount"
        );

        //대출 상환
        stable = KIP7Token(stableTokenAddress);
        stable.safeTransferFrom(msg.sender, address(this), repayAmount);

        lendingStatus.loanAmount = lendingStatus.loanAmount.sub(repayAmount);

        if (lendingStatus.loanAmount == 0) {
            nft = KIP17Token(nftAddress);
            nft.safeTransferFrom(
                address(this),
                msg.sender,
                lendingStatus.nftTokenId
            );

            _removeStakedNft(msg.sender, nftAddress, nftTokenId);
        }
    }

    function getUserList() public view returns (address[] memory) {
        return userList;
    }

    function _removeStakedNft(
        address owner,
        address nftAddress,
        uint256 nftTokenId
    ) private {
        uint256 length = stakedNft[owner][nftAddress].length;
        for (uint256 i = 0; i < length; i++) {
            if (nftTokenId == stakedNft[owner][nftAddress][i].nftTokenId) {
                NftLendingStatus storage lendingStatus = stakedNft[owner][
                    nftAddress
                ][i];

                stakedNft[owner][nftAddress][i] = stakedNft[owner][nftAddress][
                    length - 1
                ];

                stakedNft[owner][nftAddress][length - 1] = lendingStatus;
                break;
            }
        }
        stakedNft[owner][nftAddress].pop();
    }

    function getStakedNftIndex(
        address userAddress,
        address nftAddress,
        uint256 nftTokenId
    ) private view returns (uint256) {
        NftLendingStatus[] memory lendingStatusList = stakedNft[userAddress][
            nftAddress
        ];

        for (uint256 i = 0; i < lendingStatusList.length; i++) {
            if (lendingStatusList[i].nftTokenId == nftTokenId) {
                return i;
            }
        }

        revert("not found");
    }

    function onKIP7Received(
        address sender,
        address recipient,
        uint256 amount,
        bytes memory _data
    ) public returns (bytes4) {
        return
            bytes4(keccak256("onKIP7Received(address,address,uint256,bytes)"));
    }

    function onKIP17Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes memory data
    ) public returns (bytes4) {
        return
            bytes4(keccak256("onKIP17Received(address,address,uint256,bytes)"));
    }
}
