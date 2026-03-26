import https from "https";

https.get("https://eth-sepolia.blockscout.com/api?module=contract&action=getsourcecode&address=0x7906715ad6B8De952AbC35D00C6149E4AcEcA604", (res) => {
  let data = "";
  res.on("data", (chunk) => data += chunk);
  res.on("end", () => {
    try {
      const json = JSON.parse(data);
      const sources = json.result[0].AdditionalSources;
      if (sources) {
        for (const source of sources) {
          if (source.Filename.includes("GhostPay") || source.Filename.includes("Stealth") || !source.Filename.includes("@openzeppelin")) {
            console.log("Found:", source.Filename);
            console.log(source.SourceCode);
          }
        }
      }
      if (json.result[0].SourceCode) {
        console.log("Main SourceCode:");
        console.log(json.result[0].SourceCode);
      }
    } catch (e) {
      console.error(e);
    }
  });
});
