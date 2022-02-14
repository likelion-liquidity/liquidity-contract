pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "@klaytn/contracts/token/KIP7/KIP7Token.sol";
import "@klaytn/contracts/token/KIP17/KIP17Token.sol";

import "./OpenZeppelin/Ownable.sol";

//모든 데이터를 관리하는 홀더 컨트랙트
contract DataHolder is Ownable {
    struct NftData {
        bool activated;
        uint256 floorPrice;
        uint256 availableLoanAmount;
        uint256 maxLtv;
        uint256 liqLtv;
        uint256 nftKlayPrice;
    }

    address[] whiteListNftList;
    mapping(address => NftData) whiteListNftData;

    function addWhiteList(
        address targetNftAddress,
        uint256 _maxLtv,
        uint256 _liqLtv
    ) public onlyOwner {
        require(
            whiteListNftData[targetNftAddress].activated == false,
            "already whitelist"
        );
        whiteListNftList.push(targetNftAddress);
        whiteListNftData[targetNftAddress].activated = true;
        setMaxLtv(targetNftAddress, _maxLtv);
        setLiqLtv(targetNftAddress, _liqLtv);
    }

    function removeWhiteList(address targetNftAddress)
        public
        onlyOwner
        onlyWhiteList(targetNftAddress)
    {
        _removeWhiteList(targetNftAddress);
        whiteListNftData[targetNftAddress].activated = false;
    }

    function _removeWhiteList(address targetNftAddress) private {
        uint256 length = whiteListNftList.length;
        for (uint256 i = 0; i < length; i++) {
            if (targetNftAddress == whiteListNftList[i]) {
                whiteListNftList[i] = whiteListNftList[length - 1];
                whiteListNftList[length - 1] = targetNftAddress;
                break;
            }
        }
        whiteListNftList.pop();
    }

    function setFloorPrice(
        address targetNftAddress,
        uint256 nftKlayPrice,
        uint256 klayExchangeRate
    ) public onlyOwner onlyWhiteList(targetNftAddress) {
        uint256 floorPrice = (nftKlayPrice * klayExchangeRate) / (10**18);
        whiteListNftData[targetNftAddress].nftKlayPrice = nftKlayPrice;
        whiteListNftData[targetNftAddress].floorPrice = floorPrice;
        setAvailableLoanAmount(
            targetNftAddress,
            _calcAvailableLoanAmount(targetNftAddress, floorPrice)
        );
    }

    function setAvailableLoanAmount(
        address targetNftAddress,
        uint256 availableLoanAmount
    ) public onlyOwner {
        whiteListNftData[targetNftAddress]
            .availableLoanAmount = availableLoanAmount;
    }

    function setMaxLtv(address targetNftAddress, uint256 _maxLtv)
        public
        onlyOwner
        onlyWhiteList(targetNftAddress)
    {
        require(_maxLtv >= 0 && _maxLtv <= 100, "invalid value arange");
        whiteListNftData[targetNftAddress].maxLtv = _maxLtv;
    }

    function setLiqLtv(address targetNftAddress, uint256 _liqLtv)
        public
        onlyOwner
        onlyWhiteList(targetNftAddress)
    {
        require(
            _liqLtv > whiteListNftData[targetNftAddress].maxLtv,
            "liqLtv must be bigger than maxLtv"
        );
        whiteListNftData[targetNftAddress].liqLtv = _liqLtv;
    }

    function _calcAvailableLoanAmount(
        address targetNftAddress,
        uint256 floorPrice
    ) private returns (uint256) {
        return (floorPrice * whiteListNftData[targetNftAddress].maxLtv) / 100;
    }

    function getFloorPrice(address targetNftAddress)
        public
        view
        returns (uint256)
    {
        return whiteListNftData[targetNftAddress].floorPrice;
    }

    function getAvailableLoanAmount(address targetNftAddress)
        public
        view
        returns (uint256)
    {
        return whiteListNftData[targetNftAddress].availableLoanAmount;
    }

    function getMaxLtv(address targetNftAddress) public view returns (uint256) {
        return whiteListNftData[targetNftAddress].maxLtv;
    }

    function getLiqLtv(address targetNftAdrress) public view returns (uint256) {
        return whiteListNftData[targetNftAdrress].liqLtv;
    }

    function isWhiteList(address targetNftAddress) public view returns (bool) {
        return whiteListNftData[targetNftAddress].activated == true;
    }

    function getWhiteListNftList() public view returns (address[] memory) {
        return whiteListNftList;
    }

    function getNftData(address targetNftAddress)
        public
        returns (NftData memory)
    {
        return whiteListNftData[targetNftAddress];
    }

    modifier onlyWhiteList(address targetNftAddress) {
        require(
            whiteListNftData[targetNftAddress].activated == true,
            "not whitelist"
        );
        _;
    }

    function getNftKlayPrice(address targetNftAddress)
        public
        view
        returns (uint256)
    {
        return whiteListNftData[targetNftAddress].nftKlayPrice;
    }

    //화이트 리스트 NFT 리스트
    //ㄴ 새로운 화이트 리스트를 추가할 수 있어야함 (onlyOwner)
    //ㄴ 화이트 리스트에서 삭제할 수 있어야함 (onlyOwner)
    //ㄴ 다른 컨트랙트에서 리스트를 볼 수 있어야함
    //화이트 리스트 NFT의 FP
    //ㄴ 바닥 가격을 갱신할 수 있어야함 (onlyOwner)
    //ㄴ 화이트 리스트가 삭제되면 같이 삭제되어야함
    //화이트 리스트 NFT를 통해, 대출받을 수 있는 최대한도
    //ㄴ FP가 갱신될 때 같이 갱신됨 (*= 0.8)
    //ㄴ 해당 데이터를 FE에서 요청해서 가져갈 수 있어야함
    //청산을 위한 화이트 리스트 NFT의 체결 강도 (TBD)
}
