import { ethers } from "ethers";

const funcs = [
    "d7a2c4f8(bytes32,bytes32,address,uint256,bytes)",
    "f4e9b1a6(bytes32)",
    "a3f8c2d1(bytes32,address,uint256,uint256)",
    "e1b5f9c3(bytes32,uint256)"
];

for (const f of funcs) {
    console.log(f, ethers.id(f).slice(0, 10));
}
