import { ethers } from "ethers";

const funcs = [
    "b2d6f3e9(address,string)",
    "c9a1e7f4(address,string)",
    "a7f3b8d2(address)",
    "a3f8c2d1(bytes32,address,uint256,uint256)",
    "e1b5f9c3(bytes32,uint256)",
    "d7a2c4f8(bytes32,bytes32,address,uint256,bytes)",
    "f4e9b1a6(bytes32)",
    "e4c8a3f1()",
    "b9f2d7c1(bytes32)"
];

for (const f of funcs) {
    if (ethers.id(f).slice(0, 10) === "0x809339c5") {
        console.log("Found:", f);
    }
}
console.log("Done");
