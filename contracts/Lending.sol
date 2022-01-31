pragma solidity ^0.5.0;

import "@klaytn/contracts/token/KIP17/KIP17Token.sol";

contract Lending {
    KIP17Token nft;
    mapping(uint256 => address) public owner;
    mapping(uint256 => bool) public hasOwnership;
    mapping(address => uint256) public loanAmount;

    //예치 및 대출 실행
    function stakeAndBorrow(
        uint256 amount,
        address stakeNftAddress,
        uint256 stakeNftId
    ) public {
        //함수 호출자가 해당 nft를 보유하고 있는 지
        //todo : 해당 어드레스가 KIP17Token인지 체크
        nft = KIP17Token(stakeNftAddress);

        //소유권 이전 (호출 전, kas 내에서 approve()를 호출하여, 해당 nft가 contract를 컨트롤할 수 있도록 해야한다)
        nft.safeTransferFrom(msg.sender, address(this), stakeNftId);

        //소유자 기록 및 청산 유무 플래그 기록
        owner[stakeNftId] = msg.sender;
        hasOwnership[stakeNftId] = true;

        //대출 실행
        //todo : require(NFT 가치 * 0.8 >= 대출금)
        //todo : KIP7 발행 후, 해당 KIP7 토큰을 tranfer
        loanAmount[msg.sender] += amount;

        //대출 실행 이후, 이율 부과
        //todo : block.timestamp를 이용하여, 시간에 따른 이율 부과
    }

    //청산
    function liquidation() private {}

    //상환
    function payOff() public {}

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
