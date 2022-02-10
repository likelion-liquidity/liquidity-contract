pragma solidity ^0.5.0;

import "@klaytn/contracts/token/KIP7/KIP7Token.sol";
import "@klaytn/contracts/token/KIP17/KIP17Token.sol";

contract Lending {
    //contract
    KIP17Token nft;
    KIP7Token stable;

    //token
    address stableTokenAddress;
    address[] whiteListedNftArray;

    //address
    address liquidationAccountAddress;

    struct NftLendingStatus {
        uint256 nftTokenId;
        bool hasOwnership; //예치자가 소유권을 가지고 있는 지 (청산 유무 플래그)
        uint256 loanAmount; //빌려간 금액
    }

    //variable
    //mapping(account => mapping(nftAddress => NftStatus))
    mapping(address => mapping(address => NftLendingStatus[])) public stakedNft;

    constructor(
        address[] memory _whiteListedNftArray,
        address _stableTokenAddress
    ) public {
        whiteListedNftArray = _whiteListedNftArray;
        stableTokenAddress = _stableTokenAddress;
    }

    //NFT 화이트리스트 체크
    function isNftWhiteList(address nftAddress) private returns (bool) {
        //todo : 해당 어드레스가 화이트리스트인지 체크
        //외부 ownerable 컨트랙트에서 화이트리스트를 가져와서 체크함
        for (uint256 i = 0; i < whiteListedNftArray.length; i++) {
            if (whiteListedNftArray[i] == nftAddress) {
                return true;
            }
        }

        return false;
    }

    //예치 및 대출 실행
    function stakeAndBorrow(
        uint256 loanAmount,
        address stakeNftAddress,
        uint256 stakeNftId
    ) public {
        //해당 어드레스가 화이트리스트인지 체크
        require(isNftWhiteList(stakeNftAddress) == true, "NFT isn't WL");
        nft = KIP17Token(stakeNftAddress);

        //소유권 이전 (호출 전, kas 내에서 approve()를 호출하여, 해당 nft가 contract를 컨트롤할 수 있도록 해야한다)
        nft.safeTransferFrom(msg.sender, address(this), stakeNftId);

        //대출 실행
        stable = KIP7Token(stableTokenAddress);
        stable.approve(msg.sender, loanAmount);
        stable.transfer(msg.sender, loanAmount);

        //소유자 및 청산 유무 플래그 기록
        stakedNft[msg.sender][stakeNftAddress].push(
            NftLendingStatus(stakeNftId, true, loanAmount)
        );

        //대출 실행 이후, 이율 부과
        //todo : block.timestamp를 이용하여, 시간에 따른 이율 부과
    }

    //청산
    function liquidate(address nftAddress, uint256 nftTokenId) public {
        //todo : Manager Account에서만 호출할 수 있도록함

        NftLendingStatus storage lendingStatus = getNftLendingStatus(
            msg.sender,
            nftAddress,
            nftTokenId
        );
        lendingStatus.hasOwnership = false;
    }

    function getNftLendingStatus(
        address owner,
        address nftAddress,
        uint256 nftTokenId
    ) private returns (NftLendingStatus storage) {
        require(owner == msg.sender, "Not owner");
        NftLendingStatus[] storage nftLendingStatusList = stakedNft[owner][
            nftAddress
        ];

        for (uint256 i = 0; i < nftLendingStatusList.length; i++) {
            if (nftLendingStatusList[i].nftTokenId == nftTokenId) {
                return nftLendingStatusList[i];
            }
        }

        revert("Not Nft staked");
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
        // stable.safeTransferFrom(msg.sender, address(this), repayAmount);
        lendingStatus.loanAmount -= repayAmount;

        if (lendingStatus.loanAmount == 0) {
            nft.safeTransferFrom(
                address(this),
                msg.sender,
                lendingStatus.nftTokenId
            );
        }
    }

    //컨트랙트가 KIP17를 소유할 수 있도록
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
