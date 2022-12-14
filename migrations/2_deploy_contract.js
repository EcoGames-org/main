const EcoGames = artifacts.require("EcoGames");
const TokensVesting = artifacts.require("TokensVesting");
const CrowdSale = artifacts.require("CrowdSale");

module.exports = async function (deployer, network, accounts) {
  await deployer.deploy(EcoGames);
  await deployer.deploy(TokensVesting, EcoGames);
  await deployer.deploy(CrowdSale, EcoGames, TokensVesting.address);
};
