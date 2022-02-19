pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "@klaytn/contracts/token/KIP7/KIP7Token.sol";
import "@klaytn/contracts/token/KIP17/KIP17Token.sol";
import "./OpenZeppelin/Ownable.sol";
import "./DataHolder.sol";

contract Lending is Ownable {
    using SafeMath for uint256;
    uint256 UNIT = 1e18;

    // Seconds in a year calculation
    // One Gregorian calendar year, has 365.2425 days:
    // 1 year = 365.2425 days = (365.2425 days) × (24 hours/day) × (3600 seconds/hour) = 31556952 seconds
    uint256 public SECONDS_IN_YEAR = 31556952;

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
        uint256 debt;
        uint256 lastBorrowedTime;
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

    //NFT 화이트리스트 체크
    function isNftWhiteList(address nftAddress) private returns (bool) {
        return dataHolder.isWhiteList(nftAddress);
    }

    //예치 및 대출 실행
    function stakeAndBorrow(
        uint256 loanAmount,
        address stakeNftAddress,
        uint256 stakeNftId
    ) public {
        nft = KIP17Token(stakeNftAddress);
        require(isNftWhiteList(stakeNftAddress) == true, "NFT isn't WL");
        require(nft.ownerOf(stakeNftId) == msg.sender, "NFT isn't yours");
        require(
            dataHolder.getAvailableLoanAmount(stakeNftAddress) >= loanAmount,
            "too much loanAmount"
        );

        stable = KIP7Token(stableTokenAddress);
        require(
            stable.balanceOf(address(this)) >= loanAmount,
            "Balance isn't enough"
        );

        //소유권 이전 (호출 전, kas 내에서 approve()를 호출하여, 해당 nft가 contract를 컨트롤할 수 있도록 해야한다)
        nft.safeTransferFrom(msg.sender, address(this), stakeNftId);

        //대출 실행
        stable.approve(msg.sender, loanAmount);
        stable.safeTransfer(msg.sender, loanAmount);

        //소유자 및 청산 유무 플래그 기록
        uint256 interest = calcInterest(stakeNftAddress, stakeNftId);
        uint256 debt = loanAmount + interest;
        stakedNft[msg.sender][stakeNftAddress].push(
            NftLendingStatus(
                stakeNftId,
                true,
                loanAmount,
                debt,
                block.timestamp
            )
        );

        userList.push(msg.sender);

        //대출 실행 이후, 이율 부과
        //todo : block.timestamp를 이용하여, 시간에 따른 이율 부과
    }

    function calcInterest(address nftAddress, uint256 nftTokenId)
        public
        returns (uint256)
    {
        NftLendingStatus memory lendingStatus = safeGetNftLendingStatus(
            msg.sender,
            nftAddress,
            nftTokenId
        );

        if (
            lendingStatus.lastBorrowedTime == 0 ||
            block.timestamp == lendingStatus.lastBorrowedTime
        ) {
            return 0;
        }

        uint256 secondsSinceLastInterest = block.timestamp -
            lendingStatus.lastBorrowedTime;
        uint256 yearsBorrowed = secondsSinceLastInterest.div(SECONDS_IN_YEAR);
        uint256 interestRate = 4;

        uint256 principle = lendingStatus.debt;
        for (uint256 i = 0; i < yearsBorrowed; i++) {
            principle += (principle * interestRate) / 100;
        }

        return principle - lendingStatus.debt;
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

    //청산
    function liquidate(
        address owner,
        address nftAddress,
        uint256 nftTokenId
    ) public onlyOwner {
        stakedNft[owner][nftAddress][nftTokenId].hasOwnership = false;
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
        NftLendingStatus memory lendingStatus = stakedNft[owner][nftAddress][
            nftTokenId
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

    //상환
    function repay(
        uint256 repayAmount,
        address targetNftAddress,
        uint256 targetNftTokenId
    ) public {
        NftLendingStatus[] storage lendingStatusList = stakedNft[msg.sender][
            targetNftAddress
        ];

        bool isOwner = false;
        uint256 index = 0;
        for (uint256 i = 0; i < lendingStatusList.length; i++) {
            if (lendingStatusList[i].nftTokenId == targetNftTokenId) {
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
            nft = KIP17Token(targetNftAddress);
            nft.safeTransferFrom(
                address(this),
                msg.sender,
                lendingStatus.nftTokenId
            );
        }
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
