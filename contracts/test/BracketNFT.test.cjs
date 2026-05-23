const { expect } = require('chai');
const { ethers } = require('hardhat');

const BASE_URI = 'https://x-sight.vercel.app/bracket/';

async function deploy() {
  const [owner, alice, bob] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory('BracketNFT');
  const nft = await Factory.deploy(BASE_URI);
  await nft.waitForDeployment();
  return { nft, owner, alice, bob };
}

describe('BracketNFT', () => {
  it('mints one token per wallet, tokenIds starting at 1', async () => {
    const { nft, alice } = await deploy();
    await nft.connect(alice).mint();
    expect(await nft.totalSupply()).to.equal(1n);
    expect(await nft.ownerOf(1)).to.equal(alice.address);
    expect(await nft.balanceOf(alice.address)).to.equal(1n);
    expect(await nft.mintedBy(alice.address)).to.equal(1n);
  });

  it('rejects a second mint from the same wallet', async () => {
    const { nft, alice } = await deploy();
    await nft.connect(alice).mint();
    await expect(nft.connect(alice).mint()).to.be.revertedWith('already minted');
  });

  it('tokenURI is baseURI + tokenId', async () => {
    const { nft, alice } = await deploy();
    await nft.connect(alice).mint();
    expect(await nft.tokenURI(1)).to.equal(`${BASE_URI}1`);
  });

  it('reverts tokenURI / ownerOf for an unminted token', async () => {
    const { nft } = await deploy();
    await expect(nft.tokenURI(999)).to.be.revertedWith('no token');
    await expect(nft.ownerOf(999)).to.be.revertedWith('no token');
  });

  it('transfers a token between wallets', async () => {
    const { nft, alice, bob } = await deploy();
    await nft.connect(alice).mint();
    await nft.connect(alice).transferFrom(alice.address, bob.address, 1);
    expect(await nft.ownerOf(1)).to.equal(bob.address);
    expect(await nft.balanceOf(alice.address)).to.equal(0n);
    expect(await nft.balanceOf(bob.address)).to.equal(1n);
  });

  it('lets an approved spender transfer, and clears the approval after', async () => {
    const { nft, alice, bob } = await deploy();
    await nft.connect(alice).mint();
    await nft.connect(alice).approve(bob.address, 1);
    expect(await nft.getApproved(1)).to.equal(bob.address);
    await nft.connect(bob).transferFrom(alice.address, bob.address, 1);
    expect(await nft.ownerOf(1)).to.equal(bob.address);
    expect(await nft.getApproved(1)).to.equal(ethers.ZeroAddress);
  });

  it('rejects an unauthorized transfer', async () => {
    const { nft, alice, bob } = await deploy();
    await nft.connect(alice).mint();
    await expect(
      nft.connect(bob).transferFrom(alice.address, bob.address, 1),
    ).to.be.revertedWith('not authorized');
  });

  it('advertises the ERC-721 + Metadata interfaces', async () => {
    const { nft } = await deploy();
    expect(await nft.supportsInterface('0x80ac58cd')).to.equal(true);
    expect(await nft.supportsInterface('0x5b5e139f')).to.equal(true);
    expect(await nft.supportsInterface('0x01ffc9a7')).to.equal(true);
    expect(await nft.supportsInterface('0xffffffff')).to.equal(false);
  });
});
