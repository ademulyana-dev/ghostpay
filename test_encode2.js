import { ethers } from "ethers";

const ABI = [
  "function d7a2c4f8(bytes32 commitment, bytes32 nullifier, address token, uint256 amount, bytes calldata signature) external"
];

const iface = new ethers.Interface(ABI);
const data = iface.encodeFunctionData("d7a2c4f8", [
  "0xa1dc3f556d9b5350395ad1133b8403ba5fd71354c2531d8b15aa7088d3578450",
  "0x3e5057aab481262d57bdab0de03db7b2bf4a7fade600fa3d338796e002689a75",
  "0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8",
  100000000,
  "0x"
]);

console.log(data);
